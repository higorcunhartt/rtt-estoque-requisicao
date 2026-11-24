"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  const path = usePathname();
  const [user, setUser] = useState<User | null | undefined>(undefined); // undefined = verificando
  useEffect(() => {
    api<{ user: User }>("me").then((r) => setUser(r.user)).catch(() => setUser(null));
  }, []);
  const logout = useCallback(async () => {
    try { await api("logout", {}); } finally { setUser(null); }
  }, []);

  // Link do e-mail (convite ou redefinição): aberto sem login.
  if (path === "/definir-senha") return <SetPassword />;
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
  const [forgot, setForgot] = useState(false);
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

  if (forgot) return <Forgot onBack={() => setForgot(false)} />;
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
          <button type="button" className="btn sec" onClick={() => setForgot(true)}>Esqueci minha senha</button>
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

function Forgot({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const { busy, error, run } = useAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => { setMessage((await api<{ message: string }>("forgot", { email })).message); });
  };
  return (
    <Card title="Redefinir senha">
      {message ? (
        <div className="authform">
          <p>{message}</p>
          <p className="note">O link vale por 1 hora e só pode ser usado uma vez. Confira também a caixa de spam.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="authform">
          <label className="fld"><span>E-mail cadastrado</span>
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></label>
          {error && <p className="scerr" role="alert">{error}</p>}
          <button className="btn red" disabled={busy}>{busy ? "Enviando…" : "Enviar link"}</button>
        </form>
      )}
      <div className="authform" style={{ marginTop: 12 }}><button type="button" className="btn sec" onClick={onBack}>Voltar ao login</button></div>
    </Card>
  );
}

/** Página aberta pelo link do e-mail (#t=...). O token fica no fragmento e é removido da barra de endereço. */
function SetPassword() {
  const [token, setToken] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [done, setDone] = useState(false);
  const { busy, error, setError, run } = useAction();
  useEffect(() => {
    setToken(new URLSearchParams(window.location.hash.replace(/^#/, "")).get("t") ?? "");
    window.history.replaceState(null, "", window.location.pathname); // tira o token do endereço
  }, []);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (next !== again) { setError("A confirmação não confere com a nova senha."); return; }
    void run(async () => { await api("set-password", { token, newPassword: next }); setDone(true); });
  };
  return (
    <Card title="Defina sua senha">
      {done ? (
        <div className="authform">
          <p><b>Senha definida com sucesso.</b></p>
          <p className="note">Agora entre com o seu e-mail e a nova senha. Enviaremos um código de verificação para o seu e-mail.</p>
          <Link className="btn red" href="/" style={{ textAlign: "center", textDecoration: "none" }}>Ir para o login</Link>
        </div>
      ) : !token ? (
        <div className="authform">
          <p className="scerr">Este link está incompleto. Abra novamente o link do e-mail ou peça um novo.</p>
          <Link className="btn sec" href="/" style={{ textAlign: "center", textDecoration: "none" }}>Voltar ao login</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="authform">
          <label className="fld"><span>Nova senha (10 a 72 caracteres)</span>
            <input type="password" autoComplete="new-password" minLength={10} maxLength={72} value={next} onChange={(e) => setNext(e.target.value)} required autoFocus /></label>
          <label className="fld"><span>Confirmar nova senha</span>
            <input type="password" autoComplete="new-password" minLength={10} maxLength={72} value={again} onChange={(e) => setAgain(e.target.value)} required /></label>
          <p className="note">Use uma frase longa e única. Evite senhas óbvias como &quot;senha12345&quot;.</p>
          {error && <p className="scerr" role="alert">{error}</p>}
          <button className="btn red" disabled={busy}>{busy ? "Salvando…" : "Salvar senha"}</button>
        </form>
      )}
    </Card>
  );
}
