"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "./AppProvider";
import { fmtDateTime, fmtSize } from "@/lib/format";
import { SLOTS, detectSlot, getAdminToken, processExcel, publishDataset, setAdminToken, triggerSystemRefresh, type SlotFiles, type SlotKey } from "@/lib/client";

const ORIGEM: Record<string, string> = {
  seed: "dados iniciais (HTML original)",
  excel: "upload de Excel",
  sistema: "sistema (Protheus)",
  agendado: "atualização agendada",
};

export function UpdatePanel() {
  const { panelOpen, setPanelOpen, status, refreshStatus, reloadData, applyDataset, toast } = useApp();
  const [files, setFiles] = useState<SlotFiles>({});
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [publish, setPublish] = useState(true);
  const [token, setToken] = useState("");
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { setToken(getAdminToken()); }, []);
  useEffect(() => {
    if (!panelOpen) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setPanelOpen(false); };
    addEventListener("keydown", k);
    void refreshStatus();
    return () => removeEventListener("keydown", k);
  }, [panelOpen, setPanelOpen, refreshStatus]);
  useEffect(() => () => { if (poll.current) clearInterval(poll.current); }, []);

  if (!panelOpen) return null;

  const addFiles = (list: FileList | File[]) => {
    const next = { ...files };
    const unknown: string[] = [];
    for (const f of Array.from(list)) {
      const k = detectSlot(f.name);
      if (k) next[k] = f; else unknown.push(f.name);
    }
    setFiles(next);
    setMsg(unknown.length ? { ok: false, t: `Não reconheci: ${unknown.join(", ")}. O nome do arquivo deve conter SCs, Estoque, Pedidos, Mapa ou ZZF/Locais.` } : null);
  };
  const missing = SLOTS.filter((s) => !files[s.key as SlotKey]);

  const watch = () => {
    if (poll.current) clearInterval(poll.current);
    const t0 = Date.now();
    poll.current = setInterval(async () => {
      const s = await refreshStatus();
      if (s && !s.emAndamento) {
        if (poll.current) clearInterval(poll.current);
        setBusy("");
        if (s.erro) setMsg({ ok: false, t: s.erro });
        else { setMsg({ ok: true, t: "Dados atualizados." }); await reloadData(); }
      } else if (Date.now() - t0 > 16 * 60 * 1000) {
        if (poll.current) clearInterval(poll.current);
        setBusy("");
        setMsg({ ok: false, t: "A atualização demorou mais que o esperado. Verifique o status mais tarde." });
      }
    }, 4000);
  };

  const fromSystem = async () => {
    setMsg(null);
    setBusy("Buscando os dados no sistema…");
    try {
      const r = await triggerSystemRefresh();
      if (r.emAndamento) { setBusy("Atualização em andamento no servidor…"); watch(); return; }
      await reloadData();
      setBusy("");
      setMsg({ ok: true, t: "Dados atualizados a partir do sistema." });
      toast("Dados atualizados.");
    } catch (e) {
      setBusy("");
      setMsg({ ok: false, t: e instanceof Error ? e.message : "Falha ao atualizar." });
    }
  };

  const fromExcel = async () => {
    setMsg(null);
    try {
      setBusy("Preparando…");
      const ds = await processExcel(files, setBusy);
      applyDataset(ds);
      if (publish) {
        setBusy("Publicando para todos os usuários…");
        await publishDataset(ds, "excel", Object.values(files).map((f) => f!.name).join("; "));
        await refreshStatus();
        setMsg({ ok: true, t: "Planilhas processadas e publicadas. Todos os usuários verão os novos dados." });
      } else {
        setMsg({ ok: true, t: "Planilhas processadas. Os novos dados valem só neste navegador até você recarregar a página." });
      }
      setFiles({});
      toast("Dados atualizados.");
    } catch (e) {
      setMsg({ ok: false, t: e instanceof Error ? e.message : "Falha ao processar as planilhas." });
    } finally {
      setBusy("");
    }
  };

  const cfg = status?.config;
  return (
    <>
      <div className="scrim" onClick={() => setPanelOpen(false)} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="upd-h">
        <button className="btn sec x" onClick={() => setPanelOpen(false)}>Fechar</button>
        <h2 id="upd-h">Atualização dos dados</h2>
        <p className="note" style={{ margin: "2px 0 0" }}>Os dados vêm do Protheus. Escolha como atualizar.</p>

        <h3>Situação atual</h3>
        <dl className="kv">
          <dt>Última atualização</dt><dd>{fmtDateTime(status?.atualizadoEm)}</dd>
          <dt>Origem</dt><dd>{status?.origem ? ORIGEM[status.origem] || status.origem : "—"}</dd>
          <dt>Atualização agendada</dt><dd>{cfg?.agenda || "—"}</dd>
        </dl>
        {status?.emAndamento && <p className="pmiss">Há uma atualização em andamento no servidor.</p>}
        {status?.erro && <p className="scerr">Última tentativa falhou: {status.erro}</p>}

        {cfg?.protegido && (
          <label className="fld" style={{ marginTop: 14 }}>
            <span>Senha de atualização</span>
            <input type="password" value={token} autoComplete="off" onChange={(e) => { setToken(e.target.value); setAdminToken(e.target.value); }} placeholder="Necessária para atualizar" />
          </label>
        )}

        <h3>Atualizar do sistema</h3>
        <p className="note" style={{ margin: "0 0 8px" }}>
          {cfg?.sistema
            ? "Busca agora os dados atuais do Protheus (consulta ao banco)."
            : "A fonte do sistema ainda não está configurada (variável SOURCE_URL). Enquanto isso, use o Excel abaixo."}
        </p>
        <button className="btn red" onClick={fromSystem} disabled={!!busy || !cfg?.sistema}>Atualizar agora do sistema</button>

        <h3>Atualizar por planilhas Excel</h3>
        <div
          className="drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
        >
          <label className="btn sec" style={{ cursor: "pointer" }}>
            Selecionar arquivos .xlsx
            <input type="file" multiple accept=".xlsx,.xlsm" hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
          </label>
          <span className="note">ou arraste os 5 arquivos para cá</span>
        </div>
        <ul className="atts" style={{ padding: 0, marginTop: 10 }}>
          {SLOTS.map((s) => {
            const f = files[s.key as SlotKey];
            return (
              <li key={s.key}>
                <span style={{ overflowWrap: "anywhere" }}>
                  <b>{s.label}</b> <span className="note">{f ? `${f.name} (${fmtSize(f.size)})` : s.dica}</span>
                </span>
                <span className={`pill ${f ? "p-green" : "p-gray"}`}>{f ? "pronto" : "falta"}</span>
              </li>
            );
          })}
        </ul>
        <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0" }}>
          <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
          <span>Publicar para todos os usuários <span className="note">(desmarque para testar só neste navegador)</span></span>
        </label>
        <button className="btn" onClick={fromExcel} disabled={!!busy || missing.length > 0}>Processar planilhas e atualizar</button>
        {missing.length > 0 && <p className="note" style={{ margin: "8px 0 0" }}>Faltam: {missing.map((s) => s.label).join(", ")}.</p>}

        {busy && <p className="pmiss" role="status"><span className="spin" /> {busy}</p>}
        {msg && <p className={msg.ok ? "pmiss ok" : "scerr"} role="status">{msg.t}</p>}
      </aside>
    </>
  );
}
