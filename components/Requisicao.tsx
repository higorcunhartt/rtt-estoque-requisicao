"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useApp } from "./AppProvider";
import { Legend, Ruler } from "./Charts";
import { PcTable, ScTable } from "./Tables";
import { AttBox, CartPanel } from "./CartPanel";
import { HeadForm, Lab } from "./HeadForm";
import { almLabel, calc, esLabel, memo, policyText, type Calc, type Model } from "@/lib/calc";
import type { CartItem } from "@/lib/cart";
import { brl2, dbr, fmt, fmt0, isoDate, mes } from "@/lib/format";
import { headMissing } from "@/lib/sc";

interface ItState { preco: string; xobs2: string; just: string }

export function Requisicao() {
  const { model } = useApp();
  if (!model) return null;
  return <Inner model={model} />;
}

function Inner({ model }: { model: Model }) {
  const { S, R, setR, cart, setCart, toast } = useApp();
  const D = model.D;
  const [ptext, setPtext] = useState("");
  const [acOpen, setAcOpen] = useState(false);
  const [acItems, setAcItems] = useState<{ P: { i: number; c: string; d: string }; saldo: number }[]>([]);
  const [acSel, setAcSel] = useState(-1);
  const [it, setIt] = useState<ItState>({ preco: "", xobs2: "", just: "" });
  const [itKey, setItKey] = useState("");
  const [itErr, setItErr] = useState("");
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const pRef = useRef<HTMLInputElement>(null);
  const srv = R.mode === "srv";

  // data de necessidade padrão: base + 7 dias
  useEffect(() => { if (!R.d) setR((r) => ({ ...r, d: isoDate(new Date(+model.BASE + 7 * 864e5)) })); }, [R.d, model, setR]);
  // armazém padrão ao escolher a filial
  useEffect(() => {
    if (!R.f) return;
    const L = model.ALM.filter((a) => a.f === R.f);
    if (R.a == null || !L.some((a) => a.i === R.a)) setR((r) => ({ ...r, a: L.length ? L[0].i : null }));
  }, [R.f, R.a, model, setR]);
  // local de entrega que não existe mais na base
  useEffect(() => {
    const h = cart.head;
    if (h.local && !model.zzfByCode.has(h.local)) setCart((c) => ({ ...c, head: { ...c.head, local: "", localZ: null } }));
  }, [model, cart.head, setCart]);
  // texto do campo de produto acompanha a seleção (inclusive vinda de outra tela)
  useEffect(() => {
    const P = srv ? (R.sp != null ? model.SERV[R.sp] : null) : R.p != null ? model.PROD[R.p] : null;
    setPtext(P ? P.c + " – " + P.d : "");
  }, [R.p, R.sp, srv, model]);

  const clear = (k: string) => setInvalid((s) => { if (!s.has(k)) return s; const n = new Set(s); n.delete(k); return n; });
  const markInvalid = (keys: string[]) => {
    setInvalid(new Set(keys));
    if (keys.length) setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-hf="${keys[0]}"],[data-h="${keys[0]}"]`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      el?.focus({ preventScroll: true });
    }, 0);
  };

  const q = parseFloat(String(R.q).replace(",", ".")) || 0;
  const lock = cart.items.length > 0 && R.f !== "" && cart.f !== R.f;
  const A = R.a != null ? model.ALM[R.a] : null;
  const P = R.p != null ? model.PROD[R.p] : null;
  const SP = R.sp != null ? model.SERV[R.sp] : null;

  const search = (text: string) => {
    setPtext(text);
    const s = text.trim().toUpperCase();
    if (s.length < 2) { setAcOpen(false); return; }
    const terms = s.split(/\s+/);
    const res: { P: { i: number; c: string; d: string }; saldo: number; score: number }[] = [];
    for (const X of srv ? model.SERV : model.PROD) {
      if (!srv && "t" in X && X.t === "SV") continue;
      const hay = X.c + " " + X.d.toUpperCase();
      if (terms.every((t) => hay.includes(t))) {
        const r = !srv && R.a != null ? model.rowAt.get(R.a + "|" + X.i) : null;
        res.push({ P: X, saldo: r ? r.saldo : 0, score: (X.c.startsWith(s) ? 2 : 0) + (r ? 1 : 0) });
        if (res.length > 400) break;
      }
    }
    res.sort((a, b) => b.score - a.score);
    setAcItems(res.slice(0, 12)); setAcSel(-1); setAcOpen(true);
  };
  const pick = (i: number) => {
    const X = acItems[i].P;
    setR((r) => (srv ? { ...r, sp: X.i } : { ...r, p: X.i }));
    setAcOpen(false);
    document.getElementById("rq")?.focus();
  };

  // ---------- material
  const row = useMemo(() => (A && P ? model.rowAt.get(A.i + "|" + P.i) || { a: A.i, p: P.i, saldo: 0, vatu: 0, cm: 0, dem: Array(model.N).fill(0) as number[] } : null), [A, P, model]);
  const x: Calc | null = useMemo(() => (row ? calc(model, S, row) : null), [row, model, S]);

  const mkey = A && P ? A.i + "|" + P.i : srv && SP && R.f ? "S|" + R.f + "|" + SP.i : "";
  if (itKey !== mkey) {
    setItKey(mkey);
    let init: ItState = { preco: "", xobs2: "", just: "" };
    if (mkey) {
      if (srv && SP) {
        const lp = D.lps[SP.i];
        init = { preco: lp ? String(lp[0]) : "", xobs2: "", just: "" };
      } else if (P && row) {
        const lp = D.lpc[P.i];
        init = { preco: lp ? String(lp[0]) : row.cm > 0 ? String(Math.round(row.cm * 100) / 100) : "", xobs2: "", just: "" };
      }
      const ex = cart.items.find((z) => z.key === mkey);
      if (ex) init = { preco: String(ex.preco), xobs2: ex.xobs2, just: ex.just || "" };
    }
    setIt(init); setItErr("");
  }

  const addToCart = (snap: CartItem, msgNew: string, msgUpd: string) => {
    const i = cart.items.findIndex((z) => z.key === snap.key);
    setCart((c) => {
      const items = c.items.slice();
      const k = items.findIndex((z) => z.key === snap.key);
      if (k >= 0) items[k] = snap; else items.push(snap);
      return { ...c, items, f: snap.f, done: null };
    });
    toast(i >= 0 ? msgUpd : msgNew);
    setR((r) => ({ ...r, p: null, sp: null, q: "" }));
    setPtext(""); setItKey("");
    pRef.current?.focus();
  };

  const validateItem = (extra: [string, string][]): boolean => {
    const miss: [string, string][] = [];
    if (!(parseFloat(it.preco) > 0)) miss.push(["preco", "Orçamento"]);
    miss.push(...extra);
    const hm = headMissing(model, cart, R.f);
    markInvalid(hm.map((m) => m[0]));
    if (miss.length || hm.length) {
      setInvalid((s) => new Set([...s, ...miss.map((m) => m[0])]));
      setItErr(`Preencha antes de adicionar: ${[...hm.map((m) => m[1]), ...miss.map((m) => m[1])].join(", ")}.${hm.length ? " Os campos da SC ficam no formulário à esquerda." : ""}`);
      return false;
    }
    setItErr(""); setInvalid(new Set());
    return true;
  };

  const special = !!x && q > 0 && q > x.prev;
  const exc = special && x ? q - x.prev : 0;

  const addMaterial = () => {
    if (!A || !P || !x || !row) return;
    const extra: [string, string][] = special && it.just.trim().length < 15 ? [["just", "Justificativa para aprovação especial (mínimo 15 caracteres)"]] : [];
    if (!validateItem(extra)) return;
    const pcs = (D.pcs[P.i] || []).filter((p) => p[0] === A.f && p[1] === A.l);
    const scsSame = (D.scs[P.i] || []).filter((s) => s[0] === A.f && s[1] === A.l);
    const otherFsum = (model.rowsByProd.get(P.i) || []).filter((r) => r.a !== A.i && model.ALM[r.a].f !== A.f && r.saldo > 0).reduce((s, r) => s + r.saldo, 0);
    const snap: CartItem = {
      key: mkey, a: A.i, f: A.f, l: A.l, an: A.n, p: P.i, c: P.c, d: P.d, u: P.u, q, need: R.d, win: S.win, cobm: S.cobm, abatOn: S.abat, cmm: x.cmm, cmd: x.cmd, tot: x.tot,
      es: x.es, pp: x.pp, mx: x.mx, pos: x.pos, esL: esLabel(S), trig: S.trig, memo: memo(x, S), saldo: row.saldo, othSaldo: x.othSaldo, othDisp: x.othDisp,
      othList: x.oth.map((o) => [o.a.l, o.saldo, o.need, o.disp]), pc: x.pc, sc: x.sc, prev: x.prev, special, exc, cobAt: x.cobAt, lt: x.lt.d, ltsrc: x.lt.src,
      pcList: pcs.map((p) => [p[2], p[3], p[4], p[5]]), scList: scsSame.map((s) => [s[2], s[3], s[4], s[5]]), otherF: otherFsum,
      local: cart.head.local || "", preco: parseFloat(it.preco), xobs2: it.xobs2.trim(), just: special ? it.just.trim() : "",
    };
    addToCart(snap, `Item incluído (${cart.items.length + 1} na SC). Escolha o próximo produto.`, "Item atualizado.");
  };
  const addService = () => {
    if (!SP || !R.f) return;
    if (!validateItem([])) return;
    const snap: CartItem = {
      key: mkey, srv: true, f: R.f, l: "—", an: "", sp: SP.i, c: SP.c, d: SP.d, u: SP.u, q, need: R.d, local: cart.head.local || "", preco: parseFloat(it.preco), xobs2: it.xobs2.trim(), special: false, just: "",
    };
    addToCart(snap, `Serviço incluído (${cart.items.length + 1} na SC).`, "Serviço atualizado.");
  };

  const inCart = cart.items.some((z) => z.key === mkey);
  const setItField = (k: keyof ItState, v: string) => { setIt((o) => ({ ...o, [k]: v })); setInvalid((s) => { const n = new Set(s); n.delete(k); return n; }); };

  const lockMsg = <p className="pmiss">A SC em montagem é da filial <b>{cart.f}</b>. Uma SC tem uma só filial: gere ou esvazie a SC atual antes de incluir itens de outra filial.</p>;

  // ---------- painel da direita
  let out: React.ReactNode;
  if (srv) {
    if (!R.f || !SP) {
      out = <div className="panel box"><h3>SC de serviço</h3><p className="empty" style={{ margin: 0 }}>Escolha a filial e o serviço. Serviços (B1_TIPO = SV) não passam pela análise de estoque: não há saldo, consumo nem necessidade prevista.</p></div>;
    } else {
      const lp = D.lps[SP.i];
      out = (
        <>
          <div className="verdict"><h2>SC de serviço, sem análise de estoque</h2><p>{SP.c} – {SP.d} (grupo {SP.g}). A SC segue a aprovação normal.</p></div>
          {q > 0 ? (
            <div className="panel box" id="itform"><h3>Dados do serviço para a SC</h3>
              {lock && lockMsg}
              <div className="scgrid">
                <label className="fld"><Lab l="Orçamento (valor unitário)" c="C1_PRECO_UNT" req />
                  <input data-k="preco" type="number" min="0" step="0.01" inputMode="decimal" required aria-required="true" aria-invalid={invalid.has("preco") ? true : undefined} value={it.preco} onChange={(e) => setItField("preco", e.target.value)} />
                  <small className="note">{lp ? `Referência: último PC ${lp[2]} (filial ${lp[3]}, ${dbr(lp[1])}): ${brl2.format(lp[0])}.` : "Sem preço de referência na base."} Total do serviço: <b>{brl2.format((parseFloat(it.preco) || 0) * q)}</b></small>
                </label>
                <label className="fld wide"><Lab l="Observação do item" c="C1_XOBS2" />
                  <textarea data-k="xobs2" value={it.xobs2} onChange={(e) => setItField("xobs2", e.target.value)} placeholder="Escopo do serviço, local de execução, prazo, contato" />
                </label>
              </div>
              {itErr && <div className="scerr" role="alert">{itErr}</div>}
              <p style={{ margin: "12px 0 0", display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn red" onClick={addService} disabled={lock}>{inCart ? "Atualizar serviço na SC" : `Adicionar à SC: ${fmt(q)} ${SP.u}`}</button>
                {cart.items.length > 0 && <a className="btn sec" href="#scitens" style={{ textDecoration: "none" }}>Ver SC em montagem ({cart.items.length})</a>}
              </p>
            </div>
          ) : <div className="panel box"><p className="empty" style={{ margin: 0 }}>Informe a quantidade do serviço para preencher os dados da SC.</p></div>}
        </>
      );
    }
  } else if (!R.f || R.a == null || R.p == null || !A || !P || !row || !x) {
    out = <div className="panel box"><h3>Escolha o almoxarifado e o produto</h3><p className="empty" style={{ margin: 0 }}>A necessidade prevista aparece assim que você seleciona filial, armazém e produto. Na sugestão de produtos, o selo verde indica saldo no almoxarifado escolhido.</p></div>;
  } else {
    const all = (model.rowsByProd.get(P.i) || []).filter((r) => r.a !== A.i && r.saldo > 0).map((r) => ({ a: model.ALM[r.a], s: r.saldo }));
    const otherF = all.filter((o) => o.a.f !== A.f).sort((a, b) => b.s - a.s), otherFsum = otherF.reduce((s, o) => s + o.s, 0);
    const scsSame = (D.scs[P.i] || []).filter((s) => s[0] === A.f && s[1] === A.l);
    const avgW = (a?: number[]) => (a ? a.slice(model.N - S.win).reduce((s, v) => s + v, 0) / S.win : 0);
    const cF = avgW(D.demf[P.i + "|" + A.f]), cP = avgW(D.demp[P.i]), lastA = D.lasta[P.i + "|" + A.f + "|" + A.l];
    let cls = "", head: string, txt: string;
    if (!q) {
      head = `Necessidade prevista: ${fmt0(x.prev)} ${P.u}`;
      txt = x.cmm === 0 ? `Sem consumo na janela de ${mes(S.win)}. Qualquer quantidade informada exigirá aprovação especial.`
        : x.prev === 0 ? (S.trig && !x.hit ? `A posição (${fmt(x.pos)}) está acima do ponto de pedido (${fmt0(x.pp)}): ainda não é hora de comprar. Uma compra agora exigirá aprovação especial.` : `A posição já atinge o estoque máximo (${fmt0(x.mx)}). Uma compra agora exigirá aprovação especial.`)
        : `Informe a quantidade a comprar. Até ${fmt0(x.prev)} ${P.u}, a SC segue a aprovação normal.`;
    } else if (!special) {
      cls = "ok"; head = "Dentro da necessidade prevista";
      txt = `Compra de ${fmt(q)} ${P.u} para uma necessidade prevista de ${fmt0(x.prev)} ${P.u}. A SC segue a aprovação normal.`;
    } else {
      cls = "stop"; head = "Acima da necessidade prevista: a SC exige aprovação especial";
      txt = `Solicitado ${fmt(q)} ${P.u}, previsto ${fmt0(x.prev)} ${P.u}: ${fmt(exc)} ${P.u} acima da necessidade prevista.${x.prev === 0 && x.cmm > 0 ? (S.trig && !x.hit ? " A posição está acima do ponto de pedido." : " A posição já atinge o máximo.") : ""} É obrigatório justificar.`;
    }
    const hints: string[] = [];
    if (scsSame.length) hints.push(`Já existe SC aprovada sem pedido neste almoxarifado: ${scsSame.map((s) => s[0] + " – " + s[2] + "-" + s[3] + " (" + fmt(s[4]) + " " + P.u + ")").join("; ")}. Complemente ou acompanhe essa SC.`);
    if (row.saldo > 0) hints.push(`Há ${fmt(row.saldo)} ${P.u} neste almoxarifado. Para uso imediato, faça uma solicitação ao armazém (MATA105) em vez de comprar.`);
    if (x.othDisp > 0) hints.push(`Os outros armazéns da filial têm ${fmt(x.othDisp)} ${P.u} acima do próprio máximo (${x.oth.filter((o) => o.disp > 0).map((o) => "arm. " + o.a.l + ": " + fmt(o.disp)).join(", ")}). Considere transferência (MATA261).`);
    const m = memo(x, S);
    const consNote = x.cmm > 0 ? "" : cF > 0 ? `Sem recebimento neste armazém em ${mes(S.win)}${lastA ? ` (o último foi ${lastA[1]}, em ${dbr(lastA[0])})` : ""}; a filial ${A.f} recebeu o item em outro armazém.`
      : cP > 0 ? `Sem recebimento na filial ${A.f} em ${mes(S.win)}; houve recebimento só em outras filiais.` : "Sem recebimento deste item na janela.";
    const lp = D.lpc[P.i];
    const ref = [lp ? `último PC ${lp[2]} (filial ${lp[3]}, ${dbr(lp[1])}): ${brl2.format(lp[0])}` : "", row.cm > 0 ? `custo médio no almoxarifado: ${brl2.format(row.cm)}` : ""].filter(Boolean).join("; ");
    out = (
      <>
        <div className={`verdict ${cls}`}>
          <h2>{head}</h2><p>{txt}</p>
          <ul className="alloc">
            {m.map((z, i) => (
              <li key={i} style={i === m.length - 1 ? { borderColor: "var(--ink)" } : undefined}>
                <b>{z[2]}</b><span><strong>{z[0]}</strong><br /><span className="note">{z[1]}</span></span>
              </li>
            ))}
            {q > 0 && (
              <li style={{ borderColor: special ? "var(--red)" : "var(--green)" }}>
                <b>{fmt(q)}</b><span><strong>Quantidade a comprar informada</strong><br /><span className="note">{special ? `aprovação especial: ${fmt(exc)} acima da necessidade prevista` : "aprovação normal"}</span></span>
              </li>
            )}
          </ul>
          {hints.length > 0 && <div className="hints">{hints.map((h, i) => <p key={i}>{h}</p>)}</div>}
        </div>
        <div className="panel box"><h3>Posição na filial {A.f}, armazém {A.l}{A.n ? " – " + A.n : ""}</h3>
          <div className="ruler"><Ruler saldo={row.saldo} oth={x.othDisp} pc={S.abat ? x.pc : 0} sc={S.abat ? x.sc : 0} pp={x.pp} mx={x.mx} q={q} /><Legend /></div>
          <div className="grid2" style={{ marginTop: 10 }}>
            <dl className="kv">
              <dt>Saldo neste almoxarifado (B2_QATU)</dt><dd>{fmt(row.saldo)} {P.u}</dd>
              <dt>Saldo nos outros armazéns da filial</dt><dd>{fmt(x.othSaldo)}</dd>
              <dt>Disponível para transferência</dt><dd>{fmt(x.othDisp)}</dd>
              <dt>PCs aprovados a caminho</dt><dd>{fmt(x.pc)}</dd>
              <dt>SCs aprovadas sem pedido</dt><dd>{fmt(x.sc)}</dd>
              <dt>Saldo em outras filiais <span className="note">(não entra no cálculo)</span></dt><dd>{fmt(otherFsum)}</dd>
            </dl>
            <dl className="kv">
              <dt>Consumo médio neste almoxarifado</dt><dd>{fmt(x.cmm)}/mês</dd>
              <dt>Na filial {A.f} (todos os armazéns)</dt><dd>{fmt(cF)}/mês</dd>
              <dt>Em todas as filiais</dt><dd>{fmt(cP)}/mês</dd>
              <dt>Último recebimento neste almoxarifado</dt><dd>{lastA ? dbr(lastA[0]) + " (" + lastA[1] + ")" : "nenhum"}</dd>
              <dt>Cobertura atual</dt><dd>{x.cobAt == null ? "—" : fmt(x.cobAt) + " meses"}</dd>
              <dt>Lead time de referência ({x.lt.src})</dt><dd>{fmt0(x.lt.d)} dias</dd>
            </dl>
          </div>
          {consNote && <p className="note" style={{ margin: "12px 0 0", maxWidth: "80ch" }}>{consNote}</p>}
          <p className="note" style={{ margin: "12px 0 0" }}>Política em uso: {policyText(S)}. <Link href="/">Alterar em Parâmetros de reposição</Link>.</p>
        </div>
        {q > 0 && (
          <div className="panel box" id="itform"><h3>Dados do item para a SC</h3>
            {lock && lockMsg}
            {special && <p className="pmiss" style={{ background: "var(--red-soft)" }}><b>Aprovação especial.</b> A quantidade passa {fmt(exc)} {P.u} da necessidade prevista. A justificativa é obrigatória e a SC será marcada para aprovação especial.</p>}
            <div className="scgrid">
              <label className="fld"><Lab l="Orçamento (valor unitário)" c="C1_PRECO_UNT" req />
                <input data-k="preco" type="number" min="0" step="0.01" inputMode="decimal" required aria-required="true" aria-invalid={invalid.has("preco") ? true : undefined} value={it.preco} onChange={(e) => setItField("preco", e.target.value)} />
                <small className="note">{ref ? "Referência: " + ref + "." : "Sem preço de referência na base."} Total do item: <b>{brl2.format((parseFloat(it.preco) || 0) * q)}</b></small>
              </label>
              <label className="fld wide"><Lab l="Observação do item" c="C1_XOBS2" />
                <textarea data-k="xobs2" value={it.xobs2} onChange={(e) => setItField("xobs2", e.target.value)} placeholder="Especificação, marca de referência, embalagem, instruções de entrega" />
              </label>
              {special && (
                <label className="fld wide"><Lab l="Justificativa para aprovação especial" c="C1_XJUSTIF" req />
                  <textarea data-k="just" required aria-required="true" aria-invalid={invalid.has("just") ? true : undefined} value={it.just} onChange={(e) => setItField("just", e.target.value)} placeholder="Por que comprar acima da necessidade prevista? Ex.: parada programada, OS nº, consumo extra previsto" />
                </label>
              )}
            </div>
            {itErr && <div className="scerr" role="alert">{itErr}</div>}
            <p style={{ margin: "12px 0 0", display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn red" onClick={addMaterial} disabled={lock}>{inCart ? "Atualizar item na SC" : `Adicionar à SC: ${fmt(q)} ${P.u}`}</button>
              {cart.items.length > 0 && <a className="btn sec" href="#scitens" style={{ textDecoration: "none" }}>Ver SC em montagem ({cart.items.length})</a>}
            </p>
          </div>
        )}
        <div className="panel box"><h3>Pedidos de compra aprovados em aberto</h3><PcTable p={P.i} f={A.f} l={A.l} /></div>
        <div className="panel box"><h3>SCs aprovadas sem pedido</h3><ScTable p={P.i} f={A.f} l={A.l} /></div>
        {otherF.length > 0 && (
          <div className="panel box"><h3>Saldo em outras filiais</h3>
            <p className="note" style={{ margin: "-4px 0 8px" }}>Apenas informativo: não entra na necessidade prevista.</p>
            <div className="tablewrap"><table className="mini"><thead><tr><th className="t">Filial / armazém</th><th>Saldo</th></tr></thead>
              <tbody>{otherF.slice(0, 10).map((o, i) => <tr key={i} style={{ cursor: "default" }}><td className="t">{almLabel(o.a)}</td><td>{fmt(o.s)}</td></tr>)}</tbody></table></div>
          </div>
        )}
      </>
    );
  }

  const setMode = (m: "mat" | "srv") => {
    if (m === R.mode) return;
    setR((r) => ({ ...r, mode: m, p: null, sp: null, q: "" }));
    setPtext(""); setItKey("");
    pRef.current?.focus();
  };

  return (
    <section>
      <p className="lede">Antes de virar SC, a necessidade é confrontada com o ponto de pedido e o estoque máximo do almoxarifado, descontando o estoque dos armazéns da mesma filial e as compras já em andamento. Quantidade acima dessa necessidade exige aprovação especial. Serviços (tipo SV) não passam por essa análise.</p>
      <div className="req">
        <div className="panel form">
          <div className="fld"><span>Tipo de solicitação</span>
            <div className="seg" id="rmode" role="group" aria-label="Tipo de solicitação">
              <button aria-pressed={R.mode === "mat"} onClick={() => setMode("mat")}>Material</button>
              <button aria-pressed={R.mode === "srv"} onClick={() => setMode("srv")}>Serviço</button>
            </div>
            <small className="note">{srv ? "Sem análise de estoque. Só aceita itens do tipo SV." : "Com análise de estoque, PCs e SCs abertos."}</small>
          </div>
          <label className="fld"><span>Filial</span>
            <select value={R.f} onChange={(e) => setR((r) => ({ ...r, f: e.target.value, a: null }))}>
              <option value="">Escolha a filial</option>
              {model.FILIAIS.map((f) => <option key={f}>{f}</option>)}
            </select>
          </label>
          {!srv && (
            <label className="fld"><span>Almoxarifado (B2_LOCAL)</span>
              <select value={R.a ?? ""} onChange={(e) => setR((r) => ({ ...r, a: +e.target.value }))}>
                {model.ALM.filter((a) => a.f === R.f).length ? model.ALM.filter((a) => a.f === R.f).map((a) => <option key={a.i} value={a.i}>{a.l + (a.n ? " – " + a.n : "")}</option>) : <option value="">—</option>}
              </select>
            </label>
          )}
          <HeadForm invalid={invalid} clear={clear} />
          <div style={{ borderTop: "1px solid var(--line)" }} />
          <div className="fld ac">
            <label htmlFor="rp" style={{ fontSize: 13, color: "var(--ink2)" }}>{srv ? "Serviço (B1_COD, tipo SV)" : "Material (B1_COD)"}</label>
            <input id="rp" ref={pRef} type="search" autoComplete="off" value={ptext} aria-autocomplete="list" aria-controls="rplist"
              placeholder={srv ? "Digite código ou descrição do serviço" : "Digite código ou descrição do material"}
              onChange={(e) => search(e.target.value)}
              onKeyDown={(e) => {
                if (!acOpen || !acItems.length) return;
                if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setAcSel((s) => (s + (e.key === "ArrowDown" ? 1 : -1) + acItems.length) % acItems.length); }
                else if (e.key === "Enter" && acSel >= 0) { e.preventDefault(); pick(acSel); }
                else if (e.key === "Escape") setAcOpen(false);
              }}
              onBlur={() => setTimeout(() => setAcOpen(false), 150)} />
            {acOpen && (
              <div className="ac-list" id="rplist" role="listbox">
                {acItems.length ? acItems.map((a, i) => (
                  <button key={a.P.i} type="button" role="option" aria-selected={i === acSel} className={i === acSel ? "on" : ""} onMouseDown={(e) => { e.preventDefault(); pick(i); }}>
                    {a.P.c} {a.saldo > 0 && <span className="pill p-green">saldo {fmt(a.saldo)}</span>}<small>{a.P.d}</small>
                  </button>
                )) : <p className="empty" style={{ padding: "8px 10px", margin: 0 }}>{srv ? "Nenhum serviço (tipo SV) encontrado." : "Nenhum material encontrado. Para serviços, mude o tipo de solicitação."} Confira o código ou use outra palavra.</p>}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <label className="fld" style={{ flex: 1 }}><span>Quantidade a comprar (C1_QUANT)</span>
              <input id="rq" type="number" min="0" step="any" inputMode="decimal" value={R.q} onChange={(e) => setR((r) => ({ ...r, q: e.target.value }))} />
            </label>
            <label className="fld" style={{ flex: 1 }}><span>Data de necessidade (C1_DATPRF)</span>
              <input type="date" value={R.d} onChange={(e) => setR((r) => ({ ...r, d: e.target.value }))} />
            </label>
          </div>
          <div className="fld" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}><AttBox id="attin1" /></div>
          <p className="note" style={{ margin: 0 }}>Saldo considerado: B2_QATU. A base não traz empenhos e reservas; quando disponível, usar o saldo disponível (SaldoSB2).</p>
        </div>
        <div className="out">{out}</div>
      </div>
      <CartPanel invalid={invalid} markInvalid={markInvalid} />
    </section>
  );
}
