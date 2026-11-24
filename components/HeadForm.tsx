"use client";

import { useEffect, useState } from "react";
import { useApp } from "./AppProvider";
import type { CartHead } from "@/lib/cart";
import { fmtCNPJ } from "@/lib/format";
import { curZ, headLabel, isDireta, optLabel, optsFor, padZ, resolveZ, type OptKind } from "@/lib/sc";

export const Lab = ({ l, c, req }: { l: string; c: string; req?: boolean }) => (
  <span>{l} <span className="note">({c})</span>{req ? <> <b className="reqmark" aria-hidden="true">*</b></> : null}</span>
);

/** Campos da SC que valem para todos os itens (formulário à esquerda). */
export function HeadForm({ invalid, clear }: { invalid: Set<string>; clear: (k: string) => void }) {
  const { model, R, cart, setCart } = useApp();
  const [zin, setZin] = useState(cart.head.local || "");
  useEffect(() => setZin(cart.head.local || ""), [cart.head.local]);
  if (!model || !R.f) return null;
  const f = R.f, h = cart.head;
  const setH = (p: Partial<CartHead>) => setCart((c) => ({ ...c, head: { ...c.head, ...p } }));
  const inv = (k: string) => (invalid.has(k) ? true : undefined);

  const sel = (k: "cc" | "fin" | "dem" | "mod") => (
    <select data-hf={k} required aria-required="true" aria-invalid={inv(k)} value={h[k] || ""}
      onChange={(e) => { clear(k); if (k === "mod") setH({ mod: e.target.value, forn: isDireta(e.target.value) ? h.forn : "" }); else setH({ [k]: e.target.value }); }}>
      <option value="">Selecione</option>
      {optsFor(model, k as OptKind, f).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
    </select>
  );

  // projetos: os usados nesta filial primeiro
  const used = model.PRJ.map((p) => ({
    p,
    k: p.locs.filter((x) => x.f === f).reduce((s, x) => s + x.k, 0),
    ka: p.locs.filter((x) => x.f === f && R.a != null && x.l === model.ALM[R.a].l).reduce((s, x) => s + x.k, 0),
  })).filter((z) => z.k > 0).sort((a, b) => b.ka - a.ka || b.k - a.k);
  const set = new Set(used.map((z) => z.p.c));

  const fo = model.fornBy.get(h.forn || "");
  const z = curZ(model, cart, f);
  const dup = z ? (model.zzfByCode.get(z.c) || []).length > 1 : false;
  const ccCode = String(optLabel(model, "cc", f, h.cc)).split(" ")[0];
  const sug = model.ZZF.filter((x) => x.f === f)
    .map((x) => ({ x, s: (h.pj && x.pj === h.pj ? 2 : 0) + (h.cc && x.cc === ccCode ? 1 : 0) }))
    .sort((a, b) => b.s - a.s).slice(0, 4);

  const commitLocal = (raw: string) => {
    const v = padZ(raw);
    setZin(v);
    const zz = resolveZ(model, v, f);
    clear("local");
    setH({ local: v, localZ: zz ? zz.i : null });
  };
  const commitForn = (raw: string) => {
    let v = raw.trim();
    const hit = model.FORN.find((x) => x.k === v) || model.FORN.find((x) => x.c === v) || (v.length >= 4 ? model.FORN.find((x) => x.n.toUpperCase().includes(v.toUpperCase())) : null);
    if (hit) v = hit.k;
    clear("forn");
    setH({ forn: v });
  };

  return (
    <div id="rhead" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <label className="fld"><Lab l="Projeto" c="NOME_PROJETO" req />
        <select data-hf="pj" required aria-required="true" aria-invalid={inv("pj")} value={h.pj || ""} onChange={(e) => { clear("pj"); setH({ pj: e.target.value }); }}>
          <option value="">Selecione</option>
          {used.length > 0 && <optgroup label="Usados nesta filial">{used.map((u) => <option key={u.p.c} value={u.p.c}>{u.p.n}</option>)}</optgroup>}
          <optgroup label="Outros projetos">{model.PRJ.filter((p) => !set.has(p.c)).map((p) => <option key={p.c} value={p.c}>{p.n}</option>)}</optgroup>
        </select>
      </label>
      <label className="fld"><Lab l="Centro de custo" c="C1_CC" req />{sel("cc")}</label>
      <label className="fld"><Lab l="Finalidade" c="FINALIDADE" req />{sel("fin")}</label>
      <label className="fld"><Lab l="Tipo de demanda" c="DEMANDA" req />{sel("dem")}</label>
      <label className="fld"><Lab l="Modalidade" c="MODALIDADE" req />{sel("mod")}</label>
      {isDireta(h.mod) && (
        <label className="fld"><Lab l="Fornecedor" c="código-loja" req />
          <input data-hf="forn" list="fornlist" autoComplete="off" required aria-required="true" aria-invalid={inv("forn")} placeholder="Ex.: 405138-01 ou parte do nome"
            value={h.forn || ""} onChange={(e) => { setH({ forn: e.target.value }); }} onBlur={(e) => commitForn(e.target.value)} />
          <small className="note">
            {fo ? <>{fo.n}{fo.cnpj ? ", CNPJ " + fo.cnpj : ""}</> : h.forn ? <span className="flag">Fornecedor não encontrado nos PCs aprovados.</span> : "Digite o código ou o nome e escolha na lista."}
          </small>
        </label>
      )}
      <div className="fld"><Lab l="Local de entrega" c="código ZZF" req />
        <input data-hf="local" aria-label="Local de entrega, código ZZF" list="zzflist" autoComplete="off" required aria-required="true" aria-invalid={inv("local")} inputMode="numeric" placeholder="Ex.: 003"
          value={zin} onChange={(e) => setZin(e.target.value)} onBlur={(e) => commitLocal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commitLocal(zin); }} />
        <div>
          {!h.local ? <small className="note">Digite o código (coluna ZZF_REF) ou escolha uma sugestão.</small>
            : !z ? <small className="flag">Código não encontrado na tabela de locais de entrega (ZZF).</small>
            : (
              <div className="zzf">
                <b>{z.c} – {z.desc}</b>
                <span>CNPJ: {fmtCNPJ(z.cnpj)}</span>
                <span>Endereço: {z.end || "—"}</span>
                {dup && <span className="flag">Código {z.c} aparece mais de uma vez na ZZF; usado o registro da filial {z.f || "—"}.</span>}
              </div>
            )}
        </div>
        {!h.local && sug.length > 0 && (
          <div className="zsug">
            {sug.map(({ x }) => <button key={x.i} type="button" className="btn sec" onClick={() => { clear("local"); setH({ local: x.c, localZ: x.i }); }}>{x.c} – {x.desc}</button>)}
          </div>
        )}
      </div>
      <datalist id="fornlist">{model.FORN.map((x) => <option key={x.k} value={x.k}>{x.n}{x.cnpj ? " – CNPJ " + x.cnpj : ""}</option>)}</datalist>
      <datalist id="zzflist">{model.ZZF.map((x) => <option key={x.i} value={x.c}>{x.desc}{x.f ? " (filial " + x.f + ")" : ""}</option>)}</datalist>
    </div>
  );
}

export { headLabel };
