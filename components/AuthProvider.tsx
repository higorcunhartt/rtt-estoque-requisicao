"use client";

import Image from "next/image";
import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";

export type User = { id: string; email: string; name: string; role: "admin" | "gestor" | "user"; mustChangePassword: boolean };

async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api/auth/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.erro || `Falha (HTTP ${r.status}).`), { status: r.status });
  return j as T;
}

const Ctx = createContext<{ user: User; logout: () => Promise<void> } | null>(null);
export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth fora do AuthProvider");
  return c;
};

/** Só mostra o sistema (e só então carrega os dados) com sessão válida. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined); // undefined = verificando
  useEffect(() => {
    api<{ user: User }>("me").then((r) => setUser(r.user)).catch(() => setUser(null));
  }, []);
  const logout = useCallback(async () => {
    try { await api("logout", {}); } finally { setUser(null); }
  }, []);

  if (user === undefined) return <div className="center"><p className="note"><span className="spin" /> Verificando acesso…</p></div>;
  if (!user) return <Login onDone={setUser} />;
  if (user.mustChangePassword) return <ChangePassword onDone={setUser} onLogout={logout} />;
  return <Ctx.Provider value={{ user, logout }}>{children}</Ctx.Provider>;
}

function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Falha."); } finally { setBusy(false); }
  };
  return { busy, error, setError, run };
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="center">
      <div className="panel authcard">
        <Image src="/logo.png" alt="Rema Tip Top" width={1132} height={869} priority className="auth-logo" />
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  );
}

function Login({ onDone }: { onDone: (u: User) => void }) {
  const [step, setStep] = useState<"password" | "code">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [mfaToken, setMfaToken] = useState("");
  const [masked, setMasked] = useState("");
  const [info, setInfo] = useState("");
  const { busy, error, setError, run } = useAction();

  const submitPassword = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const r = await api<{ mfaToken: string; email: string }>("login", { email, password });
      setMfaToken(r.mfaToken); setMasked(r.email); setPassword(""); setStep("code");
    });
  };
  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => { onDone((await api<{ user: User }>("verify", { mfaToken, code })).user); });
  };
  const resend = () => void run(async () => { await api("resend", { mfaToken }); setInfo("Novo código enviado."); });

  return (
    <Card title="Controle de estoque na requisição">
      {step === "password" ? (
        <form onSubmit={submitPassword} className="authform">
          <label className="fld"><span>E-mail</span>
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></label>
          <label className="fld"><span>Senha</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          {error && <p className="scerr" role="alert">{error}</p>}
          <button className="btn red" disabled={busy}>{busy ? "Verificando…" : "Continuar"}</button>
        </form>
      ) : (
        <form onSubmit={submitCode} className="authform">
          <p>Enviamos um código de 6 dígitos para <b>{masked}</b>.</p>
          <label className="fld"><span>Código de verificação</span>
            <input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required autoFocus /></label>
          {error && <p className="scerr" role="alert">{error}</p>}
          {info && !error && <p className="note">{info}</p>}
          <button className="btn red" disabled={busy || code.length !== 6}>{busy ? "Verificando…" : "Entrar"}</button>
          <div className="authrow">
            <button type="button" className="btn sec" onClick={resend} disabled={busy}>Reenviar código</button>
            <button type="button" className="btn sec" onClick={() => { setStep("password"); setCode(""); setError(""); setInfo(""); }}>Voltar</button>
          </div>
        </form>
      )}
    </Card>
  );
}

function ChangePassword({ onDone, onLogout }: { onDone: (u: User) => void; onLogout: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const { busy, error, setError, run } = useAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (next !== again) { setError("A confirmação não confere com a nova senha."); return; }
    void run(async () => {
      await api("change-password", { currentPassword: current, newPassword: next });
      onDone((await api<{ user: User }>("me")).user);
    });
  };
  return (
    <Card title="Defina uma nova senha">
      <form onSubmit={submit} className="authform">
        <p className="note">Por segurança, troque a senha provisória antes de continuar. Mínimo de 10 caracteres; prefira uma frase longa.</p>
        <label className="fld"><span>Senha atual</span>
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoFocus /></label>
        <label className="fld"><span>Nova senha</span>
          <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={10} /></label>
        <label className="fld"><span>Repita a nova senha</span>
          <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required minLength={10} /></label>
        {error && <p className="scerr" role="alert">{error}</p>}
        <button className="btn red" disabled={busy}>{busy ? "Salvando…" : "Salvar nova senha"}</button>
        <button type="button" className="btn sec" onClick={onLogout}>Sair</button>
      </form>
    </Card>
  );
}
