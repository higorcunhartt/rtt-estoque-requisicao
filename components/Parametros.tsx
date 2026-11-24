"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "./AppProvider";
import { Bars, Legend, Ruler } from "./Charts";
import { MemoTable, PcTable, ScTable } from "./Tables";
import { PRIO, ST, almLabel, type Calc, type StKey } from "@/lib/calc";
import { brl, fmt, fmt0, mes, isoDate } from "@/lib/format";
import { saveBlob } from "@/lib/download";

const PS = 50;
type SortKey = "prod" | "alm" | "abc" | "freq" | "cmm" | "lt" | "es" | "pp" | "mx" | "saldo" | "oth" | "pcsc" | "prev" | "prio";
const COLS: [SortKey, string, boolean?][] = [
  ["prod", "Produto", true], ["alm", "Almox.", true], ["abc", "ABC"], ["freq", "Meses c/ consumo"], ["cmm", "Consumo/mês"], ["lt", "Lead time (d)"],
  ["es", "Est. segurança"], ["pp", "Ponto de pedido"], ["mx", "Máximo"], ["saldo", "Saldo almox."], ["oth", "Disp. outros arm."], ["pcsc", "PC + SC"],
  ["prev", "Necessidade prevista"], ["prio", "Situação", true],
];
const sortVal: Record<SortKey, (x: Calc) => string | number> = {
  prod: (x) => x.P.c, alm: (x) => x.a.f + x.a.l, abc: (x) => x.abc || "Z", freq: (x) => x.freq, cmm: (x) => x.cmm, lt: (x) => x.lt.d, es: (x) => x.es,
  pp: (x) => x.pp, mx: (x) => x.mx, saldo: (x) => x.r.saldo, oth: (x) => x.othDisp, pcsc: (x) => x.pc + x.sc, prev: (x) => x.prev, prio: (x) => PRIO[x.st] * 1e12 - x.v,
};

function Seg({ label, value, opts, onPick }: { label: string; value: number; opts: [number, string][]; onPick: (v: number) => void }) {
  return (
    <div className="fld">
      <span>{label}</span>
      <div className="seg">
        {opts.map(([v, t]) => <button key={v} aria-pressed={v === value} onClick={() => onPick(v)}>{t}</button>)}
      </div>
    </div>
  );
}

export function Parametros() {
  const { model, RES, S, setS, PJ, setPJ, setR, toast } = useApp();
  const router = useRouter();
  const [F, setF] = useState({ f: "", a: "", g: "", abc: "", q: "", st: "" as "" | StKey });
  const [qIn, setQIn] = useState("");
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "prio", dir: 1 });
  const [pg, setPg] = useState(0);
  const [open, setOpen] = useState<Calc | null>(null);
  const qt = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prj = model && PJ ? model.prjBy.get(PJ) || null : null;
  const prjFiliais = useMemo(() => {
    if (!prj) return [] as string[];
    const m = new Map<string, number>();
    for (const x of prj.locs) m.set(x.f, (m.get(x.f) || 0) + x.k);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
  }, [prj]);
  const prjAlm = useMemo(() => new Set(prj ? prj.locs.filter((x) => x.l !== "0000").map((x) => x.f + "|" + x.l) : []), [prj]);

  useEffect(() => { setF((s) => ({ ...s, f: "", a: "" })); setPg(0); }, [PJ]);

  const base = useMemo(() => {
    if (!prj) return [] as Calc[];
    const q = F.q;
    return RES.filter((x) =>
      prjAlm.has(x.a.f + "|" + x.a.l) && (!F.f || x.a.f === F.f) && (!F.a || String(x.r.a) === F.a) && (!F.g || x.P.g === F.g) && (!F.abc || x.abc === F.abc) &&
      (!q || x.P.c.includes(q) || x.P.d.toUpperCase().includes(q)));
  }, [RES, prj, prjAlm, F.f, F.a, F.g, F.abc, F.q]);

  const agg = useMemo(() => {
    const a = {} as Record<StKey, { n: number; v: number }>;
    for (const k of Object.keys(ST) as StKey[]) a[k] = { n: 0, v: 0 };
    for (const x of base) { a[x.st].n++; a[x.st].v += x.v; }
    return a;
  }, [base]);

  const list = useMemo(() => {
    const l = (F.st ? base.filter((x) => x.st === F.st) : base).slice();
    const fn = sortVal[sort.k];
    l.sort((a, b) => { const A = fn(a), B = fn(b); return (A < B ? -1 : A > B ? 1 : 0) * sort.dir; });
    return l;
  }, [base, F.st, sort]);

  if (!model) return null;
  const pages = Math.max(1, Math.ceil(list.length / PS));
  const page = Math.min(pg, pages - 1);
  const almOpts = model.ALM.filter((a) => prjAlm.has(a.f + "|" + a.l) && (!F.f || a.f === F.f));

  const exportCsv = async () => {
    if (!list.length) { toast("Nenhum item nesta seleção."); return; }
    const n = (v: number) => String(Math.round(v * 100) / 100).replace(".", ",");
    const lines = ["FILIAL;ARMAZEM;PRODUTO;DESCRICAO;CONSUMO_MES;CONSUMO_DIA;LEAD_TIME_DIAS;ESTOQUE_SEGURANCA;PONTO_PEDIDO;ESTOQUE_MAXIMO;SALDO_ALMOX;DISP_OUTROS_ARM;PC_ABERTO;SC_ABERTA;POSICAO;NECESSIDADE_PREVISTA;SITUACAO"];
    for (const x of list) lines.push([x.a.f, x.a.l, x.P.c, '"' + x.P.d.replace(/"/g, "'") + '"', n(x.cmm), n(x.cmd), Math.round(x.lt.d), x.es, x.pp, x.mx, n(x.r.saldo), n(x.othDisp), n(x.pc), n(x.sc), n(x.pos), x.prev, ST[x.st].l].join(";"));
    saveBlob("necessidade_prevista.csv", new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    toast("Arquivo gerado.");
  };

  const simulate = (x: Calc) => {
    setR((r) => ({ ...r, mode: "mat", f: x.a.f, a: x.r.a, p: x.r.p, q: x.prev ? String(x.prev) : "", d: r.d || isoDate(new Date(+model.BASE + 7 * 864e5)) }));
    setOpen(null);
    router.push("/requisicao");
  };

  return (
    <section>
      <p className="lede">Ponto de pedido de cada almoxarifado (filial + armazém) = consumo médio diário × lead time + estoque de segurança. Ao atingir o ponto de pedido, a necessidade prevista completa o estoque até o máximo, descontando o estoque da filial e as compras em andamento.</p>
      <div className="panel settings" role="group" aria-label="Política de reposição">
        <Seg label="Consumo médio dos últimos" value={S.win} onPick={(v) => { setS({ win: v }); setPg(0); }} opts={[[6, "6 meses"], [12, "12 meses"], [22, "22 meses (toda a base)"]]} />
        <Seg label="Estoque de segurança" value={S.es} onPick={(v) => { setS({ es: v }); setPg(0); }} opts={[[0, "Nenhum"], [15, "15 dias"], [30, "30 dias"], [-1, "Estatístico 95%"]]} />
        <Seg label="Cobertura após o ponto de pedido" value={S.cobm} onPick={(v) => { setS({ cobm: v }); setPg(0); }} opts={[[1, "1 mês"], [2, "2 meses"], [3, "3 meses"], [4, "4 meses"], [6, "6 meses"]]} />
        <Seg label="Comprar só ao atingir o ponto de pedido" value={S.trig} onPick={(v) => { setS({ trig: v }); setPg(0); }} opts={[[1, "Sim"], [0, "Não"]]} />
        <Seg label="Abater PCs e SCs aprovados em aberto" value={S.abat} onPick={(v) => { setS({ abat: v }); setPg(0); }} opts={[[1, "Sim"], [0, "Não"]]} />
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn sec" onClick={exportCsv}>Exportar (CSV)</button>
        </div>
      </div>

      {prj && (
        <div className="statusbar">
          {(Object.entries(ST) as [StKey, (typeof ST)[StKey]][]).map(([k, s]) => (
            <button key={k} className="st" aria-pressed={F.st === k} onClick={() => { setF((o) => ({ ...o, st: o.st === k ? "" : k })); setPg(0); }}>
              <div className="n">{fmt0(agg[k].n)}</div>
              <div className="l"><span className="dot" style={{ background: s.dot }} />{s.l}</div>
              <div className="v">{s.vl ? brl.format(agg[k].v) + " " + s.vl : " "}</div>
            </button>
          ))}
        </div>
      )}

      <div className="filters">
        <label className="fld grow"><span>Projeto <span className="note">(NOME_PROJETO)</span> <b className="reqmark" aria-hidden="true">*</b></span>
          <select value={PJ} onChange={(e) => setPJ(e.target.value)} required aria-required="true">
            <option value="">Selecione o projeto</option>
            {model.PRJ.map((p) => <option key={p.c} value={p.c}>{p.n}</option>)}
          </select>
        </label>
        <label className="fld"><span>Filial</span>
          <select value={F.f} onChange={(e) => { setF((o) => ({ ...o, f: e.target.value, a: "" })); setPg(0); }}>
            <option value="">Todas do projeto</option>
            {prjFiliais.map((f) => <option key={f}>{f}</option>)}
          </select>
        </label>
        <label className="fld"><span>Almoxarifado</span>
          <select value={F.a} onChange={(e) => { setF((o) => ({ ...o, a: e.target.value })); setPg(0); }}>
            <option value="">Todos do projeto</option>
            {almOpts.map((a) => <option key={a.i} value={a.i}>{almLabel(a)}</option>)}
          </select>
        </label>
        <label className="fld"><span>Grupo</span>
          <select value={F.g} onChange={(e) => { setF((o) => ({ ...o, g: e.target.value })); setPg(0); }}>
            <option value="">Todos</option>
            {model.grpUsed.map((g) => <option key={g} value={g}>{g} – {model.D.grp[g] || ""}</option>)}
          </select>
        </label>
        <label className="fld"><span>Curva ABC</span>
          <select value={F.abc} onChange={(e) => { setF((o) => ({ ...o, abc: e.target.value })); setPg(0); }}>
            <option value="">Todas</option><option>A</option><option>B</option><option>C</option>
          </select>
        </label>
        <label className="fld grow"><span>Produto (código ou descrição)</span>
          <input type="search" value={qIn} placeholder="Ex.: disco de corte, EP00000001198"
            onChange={(e) => {
              setQIn(e.target.value);
              if (qt.current) clearTimeout(qt.current);
              const v = e.target.value.trim().toUpperCase();
              qt.current = setTimeout(() => { setF((o) => ({ ...o, q: v })); setPg(0); }, 200);
            }} />
        </label>
      </div>

      <div className="panel">
        <div className="tablewrap">
          <table>
            {prj && (
              <thead>
                <tr>
                  {COLS.map(([k, l, t]) => (
                    <th key={k} className={t ? "t" : ""} aria-sort={sort.k === k ? (sort.dir > 0 ? "ascending" : "descending") : "none"}
                      onClick={() => { setSort((s) => (s.k === k ? { k, dir: (-s.dir as 1 | -1) } : { k, dir: ["prod", "alm", "abc", "prio"].includes(k) ? 1 : -1 })); }}>
                      {l}{sort.k === k ? (sort.dir > 0 ? " ▲" : " ▼") : ""}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {!prj ? (
                <tr><td className="t" style={{ whiteSpace: "normal", padding: "28px 16px", textAlign: "center", cursor: "default" }}>
                  <b style={{ font: "600 18px var(--cond)" }}>Informe o projeto</b><br />
                  <span className="note">Escolha o projeto nos filtros acima para ver a necessidade prevista dos almoxarifados que o atendem.</span>
                </td></tr>
              ) : list.length === 0 ? (
                <tr><td className="t" colSpan={14}>Nenhum item com esses filtros. Limpe a busca ou escolha outra filial.</td></tr>
              ) : list.slice(page * PS, page * PS + PS).map((x) => (
                <tr key={x.r.a + "|" + x.r.p} tabIndex={0} onClick={() => setOpen(x)} onKeyDown={(e) => { if (e.key === "Enter") setOpen(x); }}>
                  <td className="t"><b>{x.P.c}</b><span className="d">{x.P.d}</span></td>
                  <td className="t">{x.a.f} / {x.a.l}</td>
                  <td>{x.abc || "—"}</td>
                  <td>{x.freq}/{S.win}</td>
                  <td>{fmt(x.cmm)}</td><td>{fmt0(x.lt.d)}</td>
                  <td>{x.cmm ? fmt0(x.es) : "—"}</td><td>{x.cmm ? fmt0(x.pp) : "—"}</td><td>{x.cmm ? fmt0(x.mx) : "—"}</td>
                  <td>{fmt(x.r.saldo)}</td><td>{x.othDisp ? fmt(x.othDisp) : "—"}</td><td>{x.pc + x.sc ? fmt(x.pc + x.sc) : "—"}</td>
                  <td>{x.prev ? <b>{fmt0(x.prev)}</b> : "0"}</td>
                  <td className="t"><span className={`pill ${ST[x.st].c}`}>{ST[x.st].l}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <span className="note">{prj ? `${fmt0(list.length)} itens, página ${page + 1} de ${pages}` : ""}</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn sec" disabled={!prj || page === 0} onClick={() => setPg(page - 1)}>Anterior</button>
            <button className="btn sec" disabled={!prj || page >= pages - 1} onClick={() => setPg(page + 1)}>Próxima</button>
          </div>
        </div>
      </div>

      <div className="panel premissas">
        <b>Premissas do cálculo</b>
        <ul>
          <li>Consumo mensal: quantidade recebida (qtd_entregue) dos pedidos de compra aprovados, na filial de entrega + armazém, dividida pelo número de meses da janela. O mês é o da digitação da NF (mapa de pedidos); sem NF no mapa, a data de entrega prevista.</li>
          <li>Ponto de pedido = consumo médio diário × lead time + estoque de segurança. Estoque máximo = ponto de pedido + consumo médio diário × dias de cobertura. Posição = saldo do almoxarifado + disponível nos outros armazéns da filial + PCs e SCs aprovados em aberto (se a opção de abater estiver ligada).</li>
          <li>Estoque de segurança: dias de consumo (CMD × dias) ou estatístico (1,65 × desvio padrão mensal × √(lead time/30), nível de serviço de 95%). Dos outros armazéns, só conta o saldo acima do máximo deles, para não descobrir um armazém para cobrir outro.</li>
          <li>Projeto obrigatório nos filtros: a tela mostra só os almoxarifados (filial + armazém) que aparecem nas SCs aprovadas do projeto escolhido (NOME_PROJETO).</li>
          <li>Somente documentos aprovados: SCs com C1_APROV = L e PCs com C7_CONAPRO = L. Saldo de outras filiais não entra.</li>
          <li>Situação “Acima do máximo”: saldo do almoxarifado maior que o estoque máximo calculado.</li>
          <li>Somente grupos que movimentam estoque (BM_XMVEST = S) e armazéns diferentes de 0000. Saldo considerado: B2_QATU, sem empenhos e reservas.</li>
        </ul>
      </div>

      {open && <Drawer x={open} onClose={() => setOpen(null)} onSimular={() => simulate(open)} />}
    </section>
  );
}

function Drawer({ x, onClose, onSimular }: { x: Calc; onClose: () => void; onSimular: () => void }) {
  const { S } = useApp();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", k);
    return () => { removeEventListener("keydown", k); prev?.focus?.(); };
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="dh">
        <button className="btn sec x" ref={closeRef} onClick={onClose}>Fechar</button>
        <h2 id="dh">{x.P.c}</h2>
        <p style={{ margin: "0 0 4px" }}>{x.P.d}</p>
        <p className="note" style={{ margin: 0 }}>{almLabel(x.a)}, grupo {x.P.g}, UM {x.P.u}</p>
        <p style={{ margin: "12px 0 0" }}>
          <span className={`pill ${ST[x.st].c}`}>{ST[x.st].l}</span> {x.abc && <span className="pill p-gray">Curva {x.abc}</span>}
        </p>
        <div className="ruler">
          <Ruler saldo={x.r.saldo} oth={x.othDisp} pc={S.abat ? x.pc : 0} sc={S.abat ? x.sc : 0} pp={x.pp} mx={x.mx} />
          <Legend />
        </div>
        <h3>Memória do cálculo</h3>
        <MemoTable x={x} />
        <dl className="kv" style={{ marginTop: 12 }}>
          <dt>Cobertura atual do almoxarifado</dt><dd>{x.cobAt == null ? "—" : fmt(x.cobAt) + " meses"}</dd>
          <dt>Saldo total em outros armazéns da filial</dt><dd>{fmt(x.othSaldo)}</dd>
        </dl>
        <h3>Quantidade recebida por mês</h3>
        <Bars dem={x.r.dem} />
        <p className="note">Barras escuras entram no consumo médio (janela de {mes(S.win)}).</p>
        <h3>Pedidos de compra aprovados em aberto</h3>
        <PcTable p={x.r.p} f={x.a.f} l={x.a.l} />
        <h3>SCs aprovadas sem pedido</h3>
        <ScTable p={x.r.p} f={x.a.f} l={x.a.l} />
        <p style={{ marginTop: 20 }}><button className="btn" onClick={onSimular}>Simular requisição deste item</button></p>
      </aside>
    </>
  );
}
