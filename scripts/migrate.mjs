import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { splitSql } from "./sql-split.mjs";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não definida (crie o arquivo .env.local a partir de .env.example).");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

const schema = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
for (const stmt of splitSql(schema)) await sql.query(stmt);
console.log("Schema aplicado.");

const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
const [{ n }] = await sql`select count(*)::int as n from users where role = 'admin'`;
if (n === 0) {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.log("Nenhum administrador existe. Defina ADMIN_EMAIL e ADMIN_PASSWORD e rode novamente.");
  } else if (ADMIN_PASSWORD.length < 10) {
    console.error("ADMIN_PASSWORD deve ter no mínimo 10 caracteres.");
    process.exit(1);
  } else {
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await sql`insert into users (email, name, password_hash, role, must_change_password)
              values (${ADMIN_EMAIL.toLowerCase()}, ${ADMIN_NAME || "Administrador"}, ${hash}, 'admin', true)`;
    console.log(`Administrador criado: ${ADMIN_EMAIL.toLowerCase()} (troca a senha no primeiro acesso)`);
  }
} else {
  console.log("Administrador já existe; nada a fazer.");
}
