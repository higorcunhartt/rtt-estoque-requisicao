"use client";

import type { ReactNode } from "react";
import { AppProvider, useApp } from "./AppProvider";
import { AuthGate } from "./AuthProvider";
import { Header } from "./Header";
import { UpdatePanel } from "./UpdatePanel";

function Inner({ children }: { children: ReactNode }) {
  const { toastMsg, loadError, ds } = useApp();
  return (
    <>
      <Header />
      <main className="wrap">
        {loadError ? <div className="panel needprj"><h3>Falha ao carregar</h3><p className="empty">{loadError}</p></div>
          : !ds ? <div className="panel needprj"><h3><span className="spin" /> Carregando dados…</h3><p className="empty">Os dados de estoque, pedidos e SCs estão sendo carregados.</p></div>
          : children}
      </main>
      <UpdatePanel />
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  return <AuthGate><AppProvider><Inner>{children}</Inner></AppProvider></AuthGate>;
}
