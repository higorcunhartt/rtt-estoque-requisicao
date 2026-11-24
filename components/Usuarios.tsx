"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "./AuthProvider";

type U = { id: string; email: string; name: string; role: "admin" | "user"; active: boolean; mustChangePassword: boolean; createdAt: string };
type Pending = { title: string; run: (confirm: string) => Promise<void> } | null;

async function call<T>(url: string, method: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method, cache: "no-store",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || `Falha (HTTP ${r.status}).`);
  return j as T;
}

export function Usuarios() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<U[] | null>(null);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ name: "", email: "", role: "user" as "admin" | "user" });
  const [pending, setPending] = useState<Pending>(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<{ email: string; pass: string } | null>(null);

  const load = useCallback(async () => {
    try { setUsers((await call<{ users: U[] }>("/api/usuarios", "GET")).users); setErr(""); }
    catch (e) { setErr(e instanceof Error ? e.message : "Falha ao carregar."); }
  }, []);
  useEffect(() => { if (me.role === "admin") void load(); }, [me.role, load]);

  if (me.role !== "admin") return <div className="panel needprj"><h3>Acesso restrito</h3><p className="empty">Só administradores gerenciam usuários.</p></div>;

  // Toda ação sensível pede a senha do administrador de novo.
  const ask = (title: string, run: (c: string) => Promise<void>) => { setConfirm(""); setErr(""); setPending({ title, run }); };
  const submitConfirm = async (e: FormEvent) => {
    e.preventDefault();
    if (!pending) return;
    setBusy(true);
    try { await pending.run(confirm); setPending(null); setConfirm(""); await load(); }
    catch (x) { setErr(x instanceof Error ? x.message : "Falha."); }
    finally { setBusy(false); }
  };

  const create = (e: FormEvent) => {
    e.preventDefault();
    const f = { ...form };
    ask(`Criar ${f.email}`, async (c) => {
      const r = await call<{ tempPassword: string }>("/api/usuarios", "POST", { ...f, confirmPassword: c });
      setSecret({ email: f.email, pass: r.tempPassword });
      setForm({ name: "", email: "", role: "user" });
    });
  };
  const patch = (u: U, body: Record<string, unknown>, title: string) => ask(title, async (c) => {
    const r = await call<{ tempPassword?: string }>(`/api/usuarios/${u.id}`, "PATCH", { ...body, confirmPassword: c });
    if (r.tempPassword) setSecret({ email: u.email, pass: r.tempPassword });
  });

  return (
    <>
      <section className="panel box">
        <h3 style={{ marginTop: 0 }}>Novo usuário</h3>
        <form onSubmit={create} className="userform">
          <label className="fld"><span>Nome</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={120} /></label>
          <label className="fld"><span>E-mail corporativo</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
          <label className="fld"><span>Papel</span>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "admin" | "user" })}>
              <option value="user">Usuário (consulta e simula)</option>
              <option value="admin">Administrador (também atualiza dados e gerencia usuários)</option>
            </select></label>
          <button className="btn red">Criar usuário</button>
        </form>
        <p className="note" style={{ margin: "8px 0 0" }}>O sistema gera uma senha provisória, mostrada uma única vez. A pessoa a troca no primeiro acesso e recebe o código de verificação por e-mail.</p>
      </section>

      {secret && (
        <div className="pmiss" style={{ background: "var(--green-soft)", marginTop: 14 }} role="status">
          <b>Senha provisória de {secret.email}:</b> <code className="tmp">{secret.pass}</code>{" "}
          <button className="btn sec" onClick={() => void navigator.clipboard?.writeText(secret.pass)}>Copiar</button>{" "}
          <button className="btn sec" onClick={() => setSecret(null)}>Ocultar</button>
          <div className="note">Ela não será exibida de novo. Entregue por um canal seguro (não por e-mail ou chat em grupo).</div>
        </div>
      )}
      {err && !pending && <div className="scerr" role="alert">{err}</div>}

      <section className="panel box" style={{ marginTop: 14 }}>
        <h3 style={{ marginTop: 0 }}>Usuários {users ? <span className="note">({users.length})</span> : null}</h3>
        <div className="tablewrap">
          <table className="mini">
            <thead><tr><th className="t">Nome</th><th className="t">E-mail</th><th className="t">Papel</th><th className="t">Situação</th><th /></tr></thead>
            <tbody>
              {(users || []).map((u) => {
                const self = u.id === me.id;
                return (
                  <tr key={u.id} style={{ cursor: "default" }}>
                    <td className="t"><b>{u.name}</b>{self && <span className="note"> (você)</span>}</td>
                    <td className="t">{u.email}</td>
                    <td className="t">{u.role === "admin" ? <span className="pill p-red">Administrador</span> : <span className="pill p-gray">Usuário</span>}</td>
                    <td className="t">{!u.active ? <span className="pill p-gray">Desativado</span> : u.mustChangePassword ? <span className="pill p-amber">Aguardando 1º acesso</span> : <span className="pill p-green">Ativo</span>}</td>
                    <td className="t" style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                      {!self && <button className="btn sec" style={{ padding: "4px 9px" }} onClick={() => patch(u, { action: "role", role: u.role === "admin" ? "user" : "admin" }, `${u.role === "admin" ? "Tornar usuário comum" : "Tornar administrador"}: ${u.email}`)}>{u.role === "admin" ? "Tornar usuário" : "Tornar admin"}</button>}{" "}
                      <button className="btn sec" style={{ padding: "4px 9px" }} onClick={() => patch(u, { action: "reset" }, `Redefinir a senha de ${u.email}`)}>Redefinir senha</button>{" "}
                      {!self && <button className="btn sec" style={{ padding: "4px 9px" }} onClick={() => patch(u, { action: "active", active: !u.active }, `${u.active ? "Desativar" : "Reativar"} ${u.email}`)}>{u.active ? "Desativar" : "Reativar"}</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {pending && (
        <>
          <div className="scrim" onClick={() => !busy && setPending(null)} />
          <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="cf-h" style={{ maxWidth: 420 }}>
            <h2 id="cf-h">Confirme sua senha</h2>
            <p>{pending.title}</p>
            <form onSubmit={submitConfirm} className="authform">
              <label className="fld"><span>Sua senha</span>
                <input type="password" autoComplete="current-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoFocus /></label>
              {err && <p className="scerr" role="alert">{err}</p>}
              <button className="btn red" disabled={busy}>{busy ? "Confirmando…" : "Confirmar"}</button>
              <button type="button" className="btn sec" onClick={() => setPending(null)} disabled={busy}>Cancelar</button>
            </form>
          </aside>
        </>
      )}
    </>
  );
}
