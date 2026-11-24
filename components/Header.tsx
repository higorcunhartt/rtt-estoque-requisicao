"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "./AppProvider";
import { useAuth } from "./AuthProvider";
import { fmtDateTime } from "@/lib/format";

export function Header() {
  const path = usePathname();
  const { ds, status, setPanelOpen } = useApp();
  const { user, logout } = useAuth();
  const req = path.startsWith("/requisicao");
  const usr = path.startsWith("/usuarios");
  return (
    <header className="top">
      <div className="top-in">
        <Link href="/" className="logo" aria-label="RTT – início">
          <Image src="/logo.png" alt="Rema Tip Top" width={1132} height={869} priority />
        </Link>
        <div className="brand">
          <h1>Controle de estoque na requisição</h1>
          <p>{ds ? "Dados do Protheus extraídos em " + ds.meta.base : "Carregando dados…"}</p>
        </div>
        <nav className="tabs" aria-label="Módulos">
          <Link href="/" aria-current={!req && !usr ? "page" : undefined}>Parâmetros de reposição</Link>
          <Link href="/requisicao" aria-current={req ? "page" : undefined}>Requisição com saldo na tela</Link>
          {user.role === "admin" && <Link href="/usuarios" aria-current={usr ? "page" : undefined}>Usuários</Link>}
        </nav>
        <div className="top-right">
          <button className="upd" onClick={() => setPanelOpen(true)} title="Atualizar os dados">
            <span className={`dot ${status?.emAndamento ? "busy" : status?.erro ? "err" : "ok"}`} />
            <span>
              <b>Dados atualizados</b>
              <small>{status?.emAndamento ? "atualizando…" : fmtDateTime(status?.atualizadoEm)}</small>
            </span>
            <span className="btn sec upd-b">Atualizar</span>
          </button>
          <div className="who">
            <span title={user.email}>{user.name}</span>
            <button className="btn sec" onClick={() => void logout()}>Sair</button>
          </div>
        </div>
      </div>
    </header>
  );
}
