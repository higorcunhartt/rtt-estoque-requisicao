import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

process.env.JWT_SECRET = "x".repeat(48);
process.env.ADMIN_TOKEN = "token-de-maquina-longo-e-aleatorio";
delete process.env.CRON_SECRET;
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
const dados = await import("../app/api/dados/route.ts");
const status = await import("../app/api/status/route.ts");

const db = new PGlite();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
setSql(async (s, ...v) => (await db.query(s.reduce((a, x, i) => a + "$" + i + x), v)).rows as any);

let lastCode = "";
const origLog = console.log;
console.log = (...a: unknown[]) => {
  const m = String(a[0]).match(/\[DEV\] Código MFA para .*: (\d{6})/);
  if (m) lastCode = m[1]; else origLog(...a);
};
console.error = () => {};

const PASS = "frase-longa-segura-42";
let ipN = 0;
const newIp = () => `10.0.0.${++ipN}`;

async function addUser(email: string, role: "admin" | "user", mustChange = false, pass = PASS) {
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
