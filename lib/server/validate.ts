import { HttpError } from "./http";

export function reqStr(v: unknown, field: string, max = 500): string {
  if (typeof v !== "string" || !v.trim()) throw new HttpError(400, `Campo obrigatório: ${field}`);
  if (v.length > max) throw new HttpError(400, `Campo muito longo: ${field}`);
  return v.trim();
}

const domains = () =>
  (process.env.ALLOWED_EMAIL_DOMAINS || "rttshop.com.br").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);

export function email(v: unknown): string {
  const e = reqStr(v, "e-mail", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new HttpError(400, "E-mail inválido");
  return e;
}

/** Só aceita e-mails dos domínios da empresa (usado ao criar usuários). */
export function companyEmail(v: unknown): string {
  const e = email(v);
  if (!domains().includes(e.split("@")[1])) throw new HttpError(400, `Use um e-mail de: ${domains().join(", ")}`);
  return e;
}

export function loginPassword(v: unknown): string {
  if (typeof v !== "string" || v.length === 0) throw new HttpError(400, "Campo obrigatório: senha");
  if (v.length > 128) throw new HttpError(400, "Senha inválida");
  return v;
}

const COMMON = new Set([
  "password", "password1", "password123", "passw0rd123", "senha", "senha123", "senha1234", "senha12345", "senha123456",
  "mudar123", "mudar1234", "admin", "admin123", "admin1234", "administrador", "qwerty", "qwerty123", "qwertyuiop",
  "brasil123", "brasil1234", "estoque", "estoque123", "estoque1234", "rtt123", "rtt1234", "rttshop", "rttshop123",
  "abc123", "abc1234567", "abcdefghij", "1234567890", "12345678910", "0123456789", "1q2w3e4r5t", "welcome123", "letmein123",
  "trocar123", "trocar1234", "temporaria", "temporaria123", "novasenha", "novasenha123",
]);
const ROOTS = ["password", "senha", "admin", "qwerty", "mudar", "trocar", "brasil", "estoque", "welcome", "letmein", "temporaria", "novasenha", "rttshop", "rtt"];

/** Política de definição de senha: mínimo 10, máximo 72 bytes (limite do bcrypt) e bloqueio de senhas triviais. */
export function password(v: unknown): string {
  if (typeof v !== "string" || v.length < 10) throw new HttpError(400, "A senha deve ter no mínimo 10 caracteres");
  if (Buffer.byteLength(v, "utf8") > 72) throw new HttpError(400, "A senha deve ter no máximo 72 bytes");
  const lower = v.toLowerCase();
  const stripped = lower.replace(/[\d\W_]+$/g, "");
  if (COMMON.has(lower) || ROOTS.includes(stripped) || /^(.)\1+$/.test(v) || new Set(v).size < 4) {
    throw new HttpError(400, "Senha muito comum ou previsível. Escolha uma frase mais longa e única.");
  }
  return v;
}
