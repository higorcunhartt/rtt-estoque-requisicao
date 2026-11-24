// Cria (ou reativa com nova senha provisória) um usuário.  Uso:
//   node --env-file-if-exists=.env.local scripts/usuario.mjs email@rttshop.com.br "Nome Completo" [admin|gestor|user]
// A senha provisória é lida de USER_PASSWORD (não vai para o histórico do shell nem para a lista de processos).
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

const [, , emailArg, nome, papel = "user"] = process.argv;
const senha = process.env.USER_PASSWORD;
const dominios = (process.env.ALLOWED_EMAIL_DOMAINS || "rttshop.com.br").split(",").map((d) => d.trim().toLowerCase());
if (!process.env.DATABASE_URL || !emailArg || !nome || !senha) {
  console.error('Uso: USER_PASSWORD=... node scripts/usuario.mjs email "Nome" [admin|gestor|user]   (precisa de DATABASE_URL)');
  process.exit(1);
}
const email = emailArg.toLowerCase();
if (!dominios.includes(email.split("@")[1])) { console.error(`E-mail fora dos domínios permitidos: ${dominios.join(", ")}`); process.exit(1); }
if (!["admin", "gestor", "user"].includes(papel)) { console.error("Papel deve ser admin, gestor ou user."); process.exit(1); }
if (senha.length < 10) { console.error("USER_PASSWORD deve ter no mínimo 10 caracteres."); process.exit(1); }

const sql = neon(process.env.DATABASE_URL);
const hash = await bcrypt.hash(senha, 12);
await sql`insert into users (email, name, password_hash, role, must_change_password)
          values (${email}, ${nome}, ${hash}, ${papel}, true)
          on conflict (email) do update set name = excluded.name, password_hash = excluded.password_hash,
            role = excluded.role, active = true, must_change_password = true, token_version = users.token_version + 1`;
console.log(`Usuário ${email} (${papel}) pronto. Ele troca a senha provisória no primeiro acesso.`);
