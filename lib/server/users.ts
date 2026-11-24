import { randomBytes } from "node:crypto";
import { sql } from "./db";
import { HttpError, json, readJson } from "./http";
import { bumpTokenVersion, checkPassword, hashPassword, requireUser, type Role, type SessionUser } from "./session";
import { clearKey, hit } from "./ratelimit";
import { audit } from "./audit";
import { companyEmail, reqStr } from "./validate";
import { issueLink, revokeLinks } from "./password-links";
import { sendPasswordLinkEmail } from "./mail";

const ROLES: Role[] = ["admin", "gestor", "user"];
// Senha que ninguém conhece: a conta só fica utilizável quando a própria pessoa define a dela pelo link do e-mail.
const unusablePassword = () => hashPassword(randomBytes(32).toString("base64url"));

/** Envia o link de definição de senha. Falha de e-mail não derruba a operação: o chamador mostra o aviso e pode reenviar. */
async function sendInvite(req: Request, u: { id: string; email: string; name: string }): Promise<boolean> {
  try {
    await sendPasswordLinkEmail(u.email, u.name, await issueLink(req, u.id, "invite"), "invite");
    return true;
  } catch (err) {
    if (!(err instanceof HttpError)) console.error("Falha ao enviar convite:", err);
    return false;
  }
}

/**
 * Quem pode o quê:
 *  - admin: tudo (criar com qualquer papel, mudar papel, desativar, redefinir senha);
 *  - gestor: ver a lista, criar usuários comuns, reenviar o convite de quem ainda não definiu a senha e ativar/desativar
 *    usuários comuns. Não redefine senha de ninguém e não mexe em administradores, em outros gestores nem em papéis.
 * Ninguém vê nem digita a senha de outra pessoa: cada um define a própria por um link enviado ao seu e-mail.
 */
const staff = (req: Request) => requireUser(req, { roles: ["admin", "gestor"] });

/**
 * Reautenticação ("step-up") para ações de alto risco: exige a senha de quem está logado no pedido.
 * Quem só possui um cookie de sessão roubado não consegue criar nem alterar contas.
 */
async function reauth(req: Request, actor: SessionUser, confirm: unknown) {
  if (typeof confirm !== "string" || !confirm) throw new HttpError(403, "Confirme sua senha para continuar", "REAUTH_REQUIRED");
  if ((await hit(`stepup:${actor.id}`, 15 * 60)) > 5) throw new HttpError(429, "Muitas tentativas. Tente novamente em alguns minutos.");
  const [u] = await sql`select password_hash from users where id = ${actor.id}`;
  if (!u || !(await checkPassword(confirm, u.password_hash))) {
    await audit(req, actor, "reauth_failed", { result: "fail" });
    throw new HttpError(403, "Senha de confirmação incorreta", "REAUTH_FAILED");
  }
  await clearKey(`stepup:${actor.id}`);
}

const publicUser = (u: Record<string, unknown>) => ({
  id: u.id, email: u.email, name: u.name, role: u.role, active: u.active,
  mustChangePassword: u.must_change_password, createdAt: u.created_at,
});

export async function listUsers(req: Request) {
  await staff(req);
  const rows = await sql`select id, email, name, role, active, must_change_password, created_at from users order by active desc, name`;
  return json({ users: rows.map(publicUser) });
}

export async function createUser(req: Request) {
  const actor = await staff(req);
  const body = await readJson(req);
  const email = companyEmail(body.email);
  const name = reqStr(body.name, "nome", 120);
  const role: Role = ROLES.includes(body.role as Role) ? (body.role as Role) : "user";
  // O gestor só cria usuários comuns: não consegue se multiplicar nem criar administradores.
  if (actor.role === "gestor" && role !== "user") throw new HttpError(403, "O gestor só pode criar usuários comuns.");
  await reauth(req, actor, body.confirmPassword);
  const [dup] = await sql`select 1 as x from users where email = ${email}`;
  if (dup) throw new HttpError(409, "Já existe um usuário com este e-mail.");
  const [u] = await sql`insert into users (email, name, password_hash, role, must_change_password)
                        values (${email}, ${name}, ${await unusablePassword()}, ${role}, true)
                        returning id, email, name, role, active, must_change_password, created_at`;
  await audit(req, actor, "user_created", { target: email, detail: { role } });
  const emailSent = await sendInvite(req, u as { id: string; email: string; name: string });
  return json({ user: publicUser(u), emailSent }, 201);
}

/** Muda papel, ativa/desativa ou redefine a senha (gera outra provisória). Sempre revoga as sessões do alvo. */
export async function updateUser(req: Request, id: string) {
  const actor = await staff(req);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "Usuário não encontrado");
  const body = await readJson(req);
  const action = body.action;
  if (action !== "role" && action !== "active" && action !== "reset" && action !== "invite") throw new HttpError(400, "Ação inválida");
  // Papéis e redefinição de senha ficam só com o administrador; o gestor só ativa/desativa e reenvia convites.
  if (actor.role !== "admin" && action !== "active" && action !== "invite") throw new HttpError(403, "Somente o administrador faz esta ação.");
  await reauth(req, actor, body.confirmPassword);
  const [target] = await sql`select id, email, name, role, active, must_change_password from users where id = ${id}`;
  if (!target) throw new HttpError(404, "Usuário não encontrado");
  if (actor.role === "gestor" && target.role !== "user") throw new HttpError(403, "O gestor só gerencia usuários comuns.");
  if (target.id === actor.id && action !== "reset") {
    throw new HttpError(400, "Você não pode alterar o próprio papel nem se desativar. Peça a outro administrador.");
  }

  // Reenviar convite: só para quem ainda não definiu a senha (não é um atalho para redefinir senha de conta em uso).
  if (action === "invite") {
    if (!target.must_change_password) throw new HttpError(409, "Esta pessoa já definiu a senha. Para trocar, o administrador usa Redefinir senha.");
    if (!target.active) throw new HttpError(409, "Reative a conta antes de reenviar o convite.");
    const emailSent = await sendInvite(req, target as { id: string; email: string; name: string });
    await audit(req, actor, "user_invite_resent", { target: target.email as string, result: emailSent ? "ok" : "fail" });
    const [v] = await sql`select id, email, name, role, active, must_change_password, created_at from users where id = ${id}`;
    return json({ user: publicUser(v), emailSent });
  }

  let emailSent: boolean | undefined;
  try {
    if (action === "role") {
      const role: Role = ROLES.includes(body.role as Role) ? (body.role as Role) : "user";
      await sql`update users set role = ${role} where id = ${id}`;
    } else if (action === "active") {
      await sql`update users set active = ${body.active === true} where id = ${id}`;
    } else {
      // Invalida a senha atual na hora (útil se a conta foi comprometida) e manda o link para a pessoa criar outra.
      await sql`update users set password_hash = ${await unusablePassword()}, must_change_password = true, active = true where id = ${id}`;
      await revokeLinks(id);
      emailSent = await sendInvite(req, target as { id: string; email: string; name: string });
    }
  } catch (e) {
    if (String((e as Error).message).includes("last_admin")) throw new HttpError(409, "O sistema precisa de pelo menos um administrador ativo.");
    throw e;
  }
  await bumpTokenVersion(id); // derruba as sessões abertas dessa conta
  await audit(req, actor, `user_${action}`, { target: target.email as string, detail: action === "reset" ? undefined : { role: body.role, active: body.active } });
  const [u] = await sql`select id, email, name, role, active, must_change_password, created_at from users where id = ${id}`;
  return json({ user: publicUser(u), ...(emailSent === undefined ? {} : { emailSent }) });
}
