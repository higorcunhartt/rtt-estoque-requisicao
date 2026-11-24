import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { sql } from "./db";
import { HttpError } from "./http";
import { authorized as tokenAuthorized } from "../auth";

const SESSION_SECONDS = 8 * 60 * 60;
const ISS = "rtt-estoque";
const prod = () => process.env.NODE_ENV === "production";
// Em produção o prefixo __Host- obriga Secure, Path=/ e proíbe Domain: o cookie não vaza para subdomínios.
const COOKIE = () => (prod() ? "__Host-session" : "session");

export type Role = "admin" | "user";
export type SessionUser = { id: string; email: string; name: string; role: Role; mustChangePassword: boolean };

function secretKey() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error("JWT_SECRET ausente ou com menos de 32 caracteres");
  return new TextEncoder().encode(s);
}

async function sign(userId: string, purpose: "session" | "mfa", seconds: number, tokenVersion = 0) {
  return new SignJWT({ purpose, tv: tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISS)
    .setIssuedAt()
    .setExpirationTime(`${seconds}s`)
    .sign(secretKey());
}

async function verifyClaims(token: string, purpose: "session" | "mfa"): Promise<{ sub: string; tv: number }> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { issuer: ISS, algorithms: ["HS256"] });
    if (payload.purpose !== purpose || !payload.sub) throw new Error("purpose");
    return { sub: payload.sub, tv: typeof payload.tv === "number" ? payload.tv : -1 };
  } catch {
    throw new HttpError(
      401,
      purpose === "mfa" ? "Sessão de verificação expirada. Faça login novamente." : "Não autenticado",
      "UNAUTHENTICATED",
    );
  }
}

export const signMfaToken = (userId: string) => sign(userId, "mfa", 10 * 60);
export const verifyMfaToken = async (token: string) => (await verifyClaims(token, "mfa")).sub;

export async function sessionCookie(userId: string, tokenVersion: number) {
  const token = await sign(userId, "session", SESSION_SECONDS, tokenVersion);
  return `${COOKIE()}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}${prod() ? "; Secure" : ""}`;
}

export const clearCookie = () => `${COOKIE()}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${prod() ? "; Secure" : ""}`;

function readCookie(req: Request): string | null {
  for (const part of (req.headers.get("cookie") || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE()) return v.join("=");
  }
  return null;
}

export async function requireUser(
  req: Request,
  opts: { roles?: Role[]; allowPasswordChange?: boolean } = {},
): Promise<SessionUser> {
  const token = readCookie(req);
  if (!token) throw new HttpError(401, "Não autenticado", "UNAUTHENTICATED");
  const { sub: id, tv } = await verifyClaims(token, "session");
  const [u] = await sql`select id, email, name, role, active, must_change_password, token_version from users where id = ${id}`;
  // token_version diferente = sessão revogada (logout, troca de senha, desativação ou mudança de papel)
  if (!u || !u.active || u.token_version !== tv) throw new HttpError(401, "Não autenticado", "UNAUTHENTICATED");
  if (u.must_change_password && !opts.allowPasswordChange) {
    throw new HttpError(403, "Altere sua senha para continuar", "PASSWORD_CHANGE_REQUIRED");
  }
  if (opts.roles && !opts.roles.includes(u.role)) throw new HttpError(403, "Sem permissão para esta ação");
  return { id: u.id, email: u.email, name: u.name, role: u.role, mustChangePassword: u.must_change_password };
}

/**
 * Quem pode gravar dados: administrador logado OU máquina com token (n8n e agendador).
 * O token vem em cabeçalho, nunca em cookie, então não depende da sessão do navegador.
 */
export async function requireWriter(req: Request): Promise<void> {
  if ((req.headers.get("authorization") || req.headers.get("x-admin-token")) && tokenAuthorized(req)) return;
  await requireUser(req, { roles: ["admin"] });
}

export const hashPassword = (p: string) => bcrypt.hash(p, 12);
export const checkPassword = (p: string, hash: string) => bcrypt.compare(p, hash);

// Mantém o tempo de resposta do login quando o e-mail não existe.
let dummyHash: string | undefined;
export const getDummyHash = () => (dummyHash ??= bcrypt.hashSync(randomUUID(), 12));

export const generateCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

export function hashCode(code: string, userId: string) {
  secretKey(); // falha cedo se JWT_SECRET estiver ausente ou curto
  // Chave derivada por finalidade: o segredo do JWT nunca é usado diretamente para os códigos de MFA.
  const key = createHmac("sha256", process.env.JWT_SECRET || "").update("rtt-estoque:mfa-code:v1").digest();
  return createHmac("sha256", key).update(`${userId}:${code}`).digest("hex");
}

export function codesMatch(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Revoga todas as sessões do usuário e devolve a nova versão. */
export async function bumpTokenVersion(userId: string): Promise<number> {
  const [r] = await sql`update users set token_version = token_version + 1 where id = ${userId} returning token_version`;
  return r.token_version;
}

/** Id do dono do cookie de sessão, se válido e não revogado (sem lançar erro). */
export async function currentSessionUserId(req: Request): Promise<string | null> {
  try {
    const token = readCookie(req);
    if (!token) return null;
    const { sub, tv } = await verifyClaims(token, "session");
    const [u] = await sql`select token_version from users where id = ${sub}`;
    return u && u.token_version === tv ? sub : null;
  } catch {
    return null;
  }
}
