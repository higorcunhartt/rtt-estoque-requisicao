import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

process.env.JWT_SECRET = "x".repeat(48);
process.env.ADMIN_TOKEN = "token-de-maquina-longo-e-aleatorio";
delete process.env.CRON_SECRET;
process.env.ALLOWED_EMAIL_DOMAINS = "x.com";
delete process.env.SMTP_HOST;
delete process.env.RESEND_API_KEY;
(process.env as Record<string, string>).NODE_ENV = "test"; // e-mail MFA vai para o console

const { setSql } = await import("../lib/server/db.ts");
const { hashPassword } = await import("../lib/server/session.ts");
const { splitSql } = await import("../scripts/sql-split.mjs");
const login = await import("../app/api/auth/login/route.ts");
const verify = await import("../app/api/auth/verify/route.ts");
const logout = await import("../app/api/auth/logout/route.ts");
const me = await import("../app/api/auth/me/route.ts");
const change = await import("../app/api/auth/change-password/route.ts");
const setPw = await import("../app/api/auth/set-password/route.ts");
const forgotRoute = await import("../app/api/auth/forgot/route.ts");
const dados = await import("../app/api/dados/route.ts");
const status = await import("../app/api/status/route.ts");
const usuarios = await import("../app/api/usuarios/route.ts");
const usuarioId = await import("../app/api/usuarios/[id]/route.ts");

const db = new PGlite();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
setSql(async (s, ...v) => (await db.query(s.reduce((a, x, i) => a + "$" + i + x), v)).rows as any);

let lastCode = "";
let lastLinkToken = "";
let linkMails = 0;
const origLog = console.log;
console.log = (...a: unknown[]) => {
  const m = String(a[0]).match(/\[DEV\] Código MFA para .*: (\d{6})/);
  const l = String(a[0]).match(/\[DEV\] Link de senha para .*#t=(\S+)/);
  if (m) lastCode = m[1];
  else if (l) { lastLinkToken = l[1]; linkMails++; }
  else origLog(...a);
};
console.error = () => {};

const PASS = "frase-longa-segura-42";
let ipN = 0;
const newIp = () => `10.0.0.${++ipN}`;

async function addUser(email: string, role: "admin" | "gestor" | "user", mustChange = false, pass = PASS) {
  await db.query("insert into users (email, name, password_hash, role, must_change_password) values ($1,$2,$3,$4,$5)", [email, email.split("@")[0], await hashPassword(pass), role, mustChange]);
}
const req = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost" + path, { method, headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const cookieOf = (r: Response) => (r.headers.get("set-cookie") || "").split(";")[0];

async function fullLogin(email: string, password = PASS, ip = newIp()) {
  const r1 = await login.POST(req("POST", "/api/auth/login", { email, password }, { "x-forwarded-for": ip }));
  assert.equal(r1.status, 200);
  const { mfaToken } = await r1.json();
  const r2 = await verify.POST(req("POST", "/api/auth/verify", { mfaToken, code: lastCode }, { "x-forwarded-for": ip }));
  assert.equal(r2.status, 200);
  return cookieOf(r2);
}

before(async () => {
  for (const stmt of splitSql(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"))) await db.query(stmt);
  await addUser("admin@x.com", "admin");
  await addUser("user@x.com", "user");
  await addUser("novo@x.com", "user", true, "provisoria-123456");
});

test("sem sessão, dados e status são recusados", async () => {
  assert.equal((await dados.GET(req("GET", "/api/dados"))).status, 401);
  assert.equal((await status.GET(req("GET", "/api/status"))).status, 401);
  assert.equal((await me.GET(req("GET", "/api/auth/me"))).status, 401);
});

test("login exige senha E código MFA; a sessão libera os dados", async () => {
  const bad = await login.POST(req("POST", "/api/auth/login", { email: "user@x.com", password: "errada-errada" }, { "x-forwarded-for": newIp() }));
  assert.equal(bad.status, 401);
  const ghost = await login.POST(req("POST", "/api/auth/login", { email: "ninguem@x.com", password: "errada-errada" }, { "x-forwarded-for": newIp() }));
  assert.equal(ghost.status, 401);
  assert.equal((await bad.json()).erro, (await ghost.json()).erro); // não revela se o e-mail existe

  const ip = newIp();
  const r1 = await login.POST(req("POST", "/api/auth/login", { email: "user@x.com", password: PASS }, { "x-forwarded-for": ip }));
  const { mfaToken } = await r1.json();
  assert.ok(!r1.headers.get("set-cookie"), "senha certa sozinha não cria sessão");
  const wrong = await verify.POST(req("POST", "/api/auth/verify", { mfaToken, code: lastCode === "000000" ? "111111" : "000000" }, { "x-forwarded-for": ip }));
  assert.equal(wrong.status, 401);
  const ok = await verify.POST(req("POST", "/api/auth/verify", { mfaToken, code: lastCode }, { "x-forwarded-for": ip }));
  assert.equal(ok.status, 200);
  const set = ok.headers.get("set-cookie") || "";
  assert.match(set, /HttpOnly/);
  assert.match(set, /SameSite=Strict/);
  const cookie = cookieOf(ok);
  assert.equal((await dados.GET(req("GET", "/api/dados", undefined, { cookie }))).status, 200);
  assert.equal((await status.GET(req("GET", "/api/status", undefined, { cookie }))).status, 200);
  // o mesmo código não vale duas vezes
  const again = await verify.POST(req("POST", "/api/auth/verify", { mfaToken, code: lastCode }, { "x-forwarded-for": ip }));
  assert.equal(again.status, 400);
});

test("token do MFA não serve como sessão", async () => {
  const r1 = await login.POST(req("POST", "/api/auth/login", { email: "user@x.com", password: PASS }, { "x-forwarded-for": newIp() }));
  const { mfaToken } = await r1.json();
  assert.equal((await dados.GET(req("GET", "/api/dados", undefined, { cookie: `session=${mfaToken}` }))).status, 401);
});

test("só administrador (ou token de máquina) grava dados", async () => {
  const userCookie = await fullLogin("user@x.com");
  const adminCookie = await fullLogin("admin@x.com");
  const invalid = { method: "PUT", body: "{}", headers: { "content-type": "application/json" } };
  const asUser = await dados.PUT(new Request("http://localhost/api/dados", { ...invalid, headers: { ...invalid.headers, cookie: userCookie } }));
  assert.equal(asUser.status, 403);
  const anon = await dados.PUT(new Request("http://localhost/api/dados", invalid));
  assert.equal(anon.status, 401);
  const wrongToken = await dados.PUT(new Request("http://localhost/api/dados", { ...invalid, headers: { ...invalid.headers, authorization: "Bearer errado" } }));
  assert.equal(wrongToken.status, 401);
  // admin e token passam da autorização (o corpo inválido {} é recusado depois, com 400)
  const asAdmin = await dados.PUT(new Request("http://localhost/api/dados", { ...invalid, headers: { ...invalid.headers, cookie: adminCookie } }));
  assert.equal(asAdmin.status, 400);
  const asMachine = await dados.PUT(new Request("http://localhost/api/dados", { ...invalid, headers: { ...invalid.headers, authorization: `Bearer ${process.env.ADMIN_TOKEN}` } }));
  assert.equal(asMachine.status, 400);
});

test("logout revoga a sessão no servidor (cookie copiado deixa de valer)", async () => {
  const cookie = await fullLogin("user@x.com");
  assert.equal((await me.GET(req("GET", "/api/auth/me", undefined, { cookie }))).status, 200);
  await logout.POST(req("POST", "/api/auth/logout", {}, { cookie }));
  assert.equal((await me.GET(req("GET", "/api/auth/me", undefined, { cookie }))).status, 401);
});

test("senha provisória: tudo bloqueado até trocar; depois as sessões antigas caem", async () => {
  const cookie = await fullLogin("novo@x.com", "provisoria-123456");
  assert.equal((await dados.GET(req("GET", "/api/dados", undefined, { cookie }))).status, 403);
  assert.equal((await me.GET(req("GET", "/api/auth/me", undefined, { cookie }))).status, 200);
  const fraca = await change.POST(req("POST", "/api/auth/change-password", { currentPassword: "provisoria-123456", newPassword: "senha123456" }, { cookie }));
  assert.equal(fraca.status, 400);
  const ok = await change.POST(req("POST", "/api/auth/change-password", { currentPassword: "provisoria-123456", newPassword: "outra-frase-bem-longa-7" }, { cookie }));
  assert.equal(ok.status, 200);
  assert.equal((await me.GET(req("GET", "/api/auth/me", undefined, { cookie }))).status, 401); // cookie antigo revogado
  assert.equal((await dados.GET(req("GET", "/api/dados", undefined, { cookie: cookieOf(ok) }))).status, 200);
});

test("origem cruzada é recusada em requisições que alteram algo", async () => {
  const r = await logout.POST(req("POST", "/api/auth/logout", {}, { origin: "https://site-malicioso.example", host: "localhost" }));
  assert.equal(r.status, 403);
});

test("muitas senhas erradas bloqueiam (429) sem revelar se a conta existe", async () => {
  const ip = newIp();
  let last = 0;
  for (let i = 0; i < 7; i++) last = (await login.POST(req("POST", "/api/auth/login", { email: "admin@x.com", password: "errada-errada" }, { "x-forwarded-for": ip }))).status;
  assert.equal(last, 429);
});

test("usuário desativado perde o acesso na hora", async () => {
  const cookie = await fullLogin("user@x.com");
  await db.query("update users set active = false where email = 'user@x.com'");
  assert.equal((await me.GET(req("GET", "/api/auth/me", undefined, { cookie }))).status, 401);
  const r = await login.POST(req("POST", "/api/auth/login", { email: "user@x.com", password: PASS }, { "x-forwarded-for": newIp() }));
  assert.equal(r.status, 401);
});

test("gestão de usuários: só admin, com reautenticação, e nada de se auto-rebaixar", async () => {
  await addUser("gestor@x.com", "admin");
  await addUser("comum@x.com", "user");
  const adminCookie = await fullLogin("gestor@x.com");
  const userCookie = await fullLogin("comum@x.com");
  const post = (cookie: string, body: unknown) => usuarios.POST(req("POST", "/api/usuarios", body, { cookie }));

  assert.equal((await usuarios.GET(req("GET", "/api/usuarios"))).status, 401);
  assert.equal((await usuarios.GET(req("GET", "/api/usuarios", undefined, { cookie: userCookie }))).status, 403);
  assert.equal((await post(userCookie, { name: "X", email: "a@x.com", confirmPassword: PASS })).status, 403);

  const novo = { name: "Fulano", email: "fulano@x.com", role: "user" };
  assert.equal((await post(adminCookie, novo)).status, 403); // sem confirmar a senha
  assert.equal((await post(adminCookie, { ...novo, confirmPassword: "senha-errada-123" })).status, 403);
  assert.equal((await post(adminCookie, { ...novo, email: "fulano@fora.com", confirmPassword: PASS })).status, 400); // domínio não permitido
  const ok = await post(adminCookie, { ...novo, confirmPassword: PASS });
  assert.equal(ok.status, 201);
  const created = await ok.json();
  const user = created.user;
  assert.equal(created.emailSent, true);
  assert.ok(!JSON.stringify(created).match(/tempPassword|password_hash|passwordHash|"password"/), "a resposta não carrega senha nenhuma");
  assert.ok(lastLinkToken.length > 30);
  assert.equal((await post(adminCookie, { ...novo, confirmPassword: PASS })).status, 409); // duplicado

  // conta nova não entra até a pessoa definir a própria senha pelo link
  const early = await login.POST(req("POST", "/api/auth/login", { email: "fulano@x.com", password: "qualquer-coisa-123" }, { "x-forwarded-for": newIp() }));
  assert.equal(early.status, 401);
  const weak = await setPw.POST(req("POST", "/api/auth/set-password", { token: lastLinkToken, newPassword: "senha123456" }));
  assert.equal(weak.status, 400); // senha fraca não gasta o link
  const bad = await setPw.POST(req("POST", "/api/auth/set-password", { token: "token-invalido", newPassword: "minha-frase-nova-99" }));
  assert.equal(bad.status, 400);
  const tokenInvite = lastLinkToken;
  assert.equal((await setPw.POST(req("POST", "/api/auth/set-password", { token: tokenInvite, newPassword: "minha-frase-nova-99" }))).status, 200);
  assert.equal((await setPw.POST(req("POST", "/api/auth/set-password", { token: tokenInvite, newPassword: "outra-frase-nova-99" }))).status, 400); // uso único
  const c = await fullLogin("fulano@x.com", "minha-frase-nova-99");
  assert.equal((await dados.GET(req("GET", "/api/dados", undefined, { cookie: c }))).status, 200); // sem troca forçada: ela já escolheu

  const patch = (id: string, body: unknown) => usuarioId.PATCH(req("PATCH", `/api/usuarios/${id}`, body, { cookie: adminCookie }), { params: Promise.resolve({ id }) });
  const self = (await db.query("select id from users where email = 'gestor@x.com'")).rows[0] as { id: string };
  assert.equal((await patch(self.id, { action: "role", role: "user", confirmPassword: PASS })).status, 400);
  assert.equal((await patch(self.id, { action: "active", active: false, confirmPassword: PASS })).status, 400);

  // desativar derruba a sessão aberta da pessoa
  assert.equal((await patch(user.id, { action: "active", active: false, confirmPassword: PASS })).status, 200);
  assert.equal((await me.GET(req("GET", "/api/auth/me", undefined, { cookie: c }))).status, 401);
  // redefinir: a senha antiga deixa de valer na hora e a pessoa recebe um link para criar outra (nada de senha na resposta)
  const before = linkMails;
  const reset = await patch(user.id, { action: "reset", confirmPassword: PASS });
  assert.equal(reset.status, 200);
  const rj = await reset.json();
  assert.equal(rj.emailSent, true);
  assert.ok(!JSON.stringify(rj).match(/tempPassword/));
  assert.equal(linkMails, before + 1);
  const old = await login.POST(req("POST", "/api/auth/login", { email: "fulano@x.com", password: "minha-frase-nova-99" }, { "x-forwarded-for": newIp() }));
  assert.equal(old.status, 401);
  assert.equal((await setPw.POST(req("POST", "/api/auth/set-password", { token: lastLinkToken, newPassword: "terceira-frase-nova-99" }))).status, 200);
  assert.equal((await patch(user.id, { action: "invite", confirmPassword: PASS })).status, 409); // já definiu a senha: reenviar convite não vale
  assert.equal((await patch("nao-e-um-id", { action: "reset", confirmPassword: PASS })).status, 404);
});
test("gestor de suprimentos: atualiza dados e cria usuários comuns, mas não reseta senha nem mexe em admin", async () => {
  await addUser("chefe@x.com", "admin");
  await addUser("suprimentos@x.com", "gestor");
  await addUser("simples@x.com", "user");
  const g = await fullLogin("suprimentos@x.com");
  const adm = (await db.query("select id from users where email = 'chefe@x.com'")).rows[0] as { id: string };
  const simples = (await db.query("select id from users where email = 'simples@x.com'")).rows[0] as { id: string };
  const gestorSelf = (await db.query("select id from users where email = 'suprimentos@x.com'")).rows[0] as { id: string };

  // atualiza dados (passa da autorização; corpo inválido => 400) e vê a lista
  const put = await dados.PUT(new Request("http://localhost/api/dados", { method: "PUT", body: "{}", headers: { "content-type": "application/json", cookie: g } }));
  assert.equal(put.status, 400);
  assert.equal((await usuarios.GET(req("GET", "/api/usuarios", undefined, { cookie: g }))).status, 200);

  const post = (body: unknown) => usuarios.POST(req("POST", "/api/usuarios", body, { cookie: g }));
  const patch = (id: string, body: unknown) => usuarioId.PATCH(req("PATCH", `/api/usuarios/${id}`, body, { cookie: g }), { params: Promise.resolve({ id }) });

  // cria só usuário comum
  assert.equal((await post({ name: "A", email: "a1@x.com", role: "admin", confirmPassword: PASS })).status, 403);
  assert.equal((await post({ name: "A", email: "a2@x.com", role: "gestor", confirmPassword: PASS })).status, 403);
  const ok = await post({ name: "Novo", email: "novo-comum@x.com", role: "user", confirmPassword: PASS });
  assert.equal(ok.status, 201);
  assert.equal((await ok.json()).user.role, "user");
  // recriar um e-mail existente não vira atalho para resetar senha
  assert.equal((await post({ name: "X", email: "chefe@x.com", role: "user", confirmPassword: PASS })).status, 409);

  // nunca reseta senha, nem de usuário comum
  assert.equal((await patch(simples.id, { action: "reset", confirmPassword: PASS })).status, 403);
  assert.equal((await patch(adm.id, { action: "reset", confirmPassword: PASS })).status, 403);
  // nunca muda papéis
  assert.equal((await patch(simples.id, { action: "role", role: "admin", confirmPassword: PASS })).status, 403);
  assert.equal((await patch(gestorSelf.id, { action: "role", role: "admin", confirmPassword: PASS })).status, 403);
  // não desativa admin; pode desativar/reativar usuário comum
  assert.equal((await patch(adm.id, { action: "active", active: false, confirmPassword: PASS })).status, 403);
  assert.equal((await patch(simples.id, { action: "active", active: false, confirmPassword: PASS })).status, 200);
  assert.equal((await patch(simples.id, { action: "active", active: true, confirmPassword: PASS })).status, 200);
  assert.equal(((await db.query("select active from users where email = 'chefe@x.com'")).rows[0] as { active: boolean }).active, true);
});

test("usuário comum continua sem acesso à gestão nem à gravação de dados", async () => {
  const c = await fullLogin("simples@x.com");
  assert.equal((await usuarios.GET(req("GET", "/api/usuarios", undefined, { cookie: c }))).status, 403);
  const put = await dados.PUT(new Request("http://localhost/api/dados", { method: "PUT", body: "{}", headers: { "content-type": "application/json", cookie: c } }));
  assert.equal(put.status, 403);
});
test("esqueci minha senha: resposta igual para conta inexistente; o link troca a senha e derruba sessões", async () => {
  process.env.FORGOT_MIN_MS = "0";
  const known = await forgotRoute.POST(req("POST", "/api/auth/forgot", { email: "comum@x.com" }, { "x-forwarded-for": newIp() }));
  const unknown = await forgotRoute.POST(req("POST", "/api/auth/forgot", { email: "ninguem-mesmo@x.com" }, { "x-forwarded-for": newIp() }));
  assert.equal(known.status, 200);
  assert.deepEqual(await known.json(), await unknown.json());
  assert.ok(lastLinkToken.length > 30);
  const cookie = await fullLogin("comum@x.com");
  assert.equal((await setPw.POST(req("POST", "/api/auth/set-password", { token: lastLinkToken, newPassword: "senha-nova-depois-do-esqueci-1" }))).status, 200);
  assert.equal((await me.GET(req("GET", "/api/auth/me", undefined, { cookie }))).status, 401); // sessão antiga caiu
  await fullLogin("comum@x.com", "senha-nova-depois-do-esqueci-1");
});

test("gestor reenvia convite só de quem ainda não definiu a senha", async () => {
  await addUser("sup2@x.com", "gestor");
  const g = await fullLogin("sup2@x.com");
  const post = (body: unknown) => usuarios.POST(req("POST", "/api/usuarios", body, { cookie: g }));
  const patch = (id: string, body: unknown) => usuarioId.PATCH(req("PATCH", `/api/usuarios/${id}`, body, { cookie: g }), { params: Promise.resolve({ id }) });
  const c = await post({ name: "Pendente", email: "pendente@x.com", role: "user", confirmPassword: PASS });
  const pend = (await c.json()).user;
  const before = linkMails;
  assert.equal((await patch(pend.id, { action: "invite", confirmPassword: PASS })).status, 200);
  assert.equal(linkMails, before + 1);
  const other = (await db.query("select id from users where email = 'comum@x.com'")).rows[0] as { id: string };
  assert.equal((await patch(other.id, { action: "invite", confirmPassword: PASS })).status, 409); // já usa a conta: sem atalho de reset
  assert.equal((await patch(other.id, { action: "reset", confirmPassword: PASS })).status, 403);
});
