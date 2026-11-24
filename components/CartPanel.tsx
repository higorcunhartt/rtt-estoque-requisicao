"use client";

import { useState } from "react";
import { useApp } from "./AppProvider";
import { Lab } from "./HeadForm";
import { brl2, fmt, fmt0, fmtSize } from "@/lib/format";
import { HF, headLabel, headMissing, isDireta } from "@/lib/sc";
import { buildPdf, loadLogo } from "@/lib/pdf";
import { saveBlob } from "@/lib/download";
import { EMPTY_CART, type Att } from "@/lib/cart";

/** Anexos da SC (ficam só na sessão do navegador). */
export function AttBox({ id }: { id: string }) {
  const { atts, setAtts, toast } = useApp();
  const onFiles = async (fs: File[]) => {
    let skip = 0;
    const add: Att[] = [];
    for (const f of fs) {
      if (f.size > 10 * 1024 * 1024 || atts.length + add.length >= 15) { skip++; continue; }
      const img = /^image\/(png|jpe?g)$/.test(f.type);
      add.push({ name: f.name, size: f.size, type: f.type, url: img ? await new Promise<string>((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result as string); fr.readAsDataURL(f); }) : null });
    }
    setAtts((a) => [...a, ...add]);
    toast(skip ? `${skip} arquivo(s) não anexado(s): limite de 10 MB por arquivo e 15 arquivos.` : `${fs.length} documento(s) anexado(s) à SC.`);
  };
  return (
    <>
      <span>Anexos da SC <span className="note">(opcional)</span></span>
      <label className="btn sec" style={{ alignSelf: "flex-start", cursor: "pointer", position: "relative" }}>
        📎 Anexar documentos
        <input id={id} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt,.msg,.eml,.zip"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }}
          onChange={(e) => { const fs = [...(e.target.files || [])]; e.target.value = ""; void onFiles(fs); }} />
      </label>
      {atts.length > 0 && (
        <ul className="atts" style={{ padding: 0, margin: "4px 0 0" }}>
          {atts.map((a, i) => (
            <li key={i}>
              <span style={{ overflowWrap: "anywhere" }}>{a.name} <span className="note">{fmtSize(a.size)}</span></span>
              <button className="btn sec" style={{ padding: "3px 9px" }} aria-label={`Remover ${a.name}`} onClick={() => setAtts((x) => x.filter((_, j) => j !== i))}>Remover</button>
            </li>
          ))}
        </ul>
      )}
      <small className="note">PDF, imagens, Word, Excel, e-mail ou ZIP, até 10 MB cada. Ficam só nesta sessão do navegador; no Protheus iriam para o banco de conhecimento da SC.</small>
    </>
  );
}

export function CartPanel({ invalid, markInvalid }: { invalid: Set<string>; markInvalid: (keys: string[]) => void }) {
  const { model, ds, cart, setCart, atts, setAtts, R, setR, toast } = useApp();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (!model || !ds || !cart.items.length) return null;
  const f = cart.f, h = cart.head, nSp = cart.items.filter((z) => z.special).length;
  const tot = cart.items.reduce((s, z) => s + z.q * z.preco, 0);
  const hf = (k: Parameters<typeof headLabel>[3]) => headLabel(model, cart, R.f, k);

  const generate = async () => {
    const hm = headMissing(model, cart, R.f);
    const miss: [string, string, string][] = [];
    if (String(h.xobs1 || "").trim().length < 10) miss.push(["xobs1", "Motivo da SC", "C1_XOBS1"]);
    for (const [k, l] of hm) miss.push([k, l.replace(/ \(.*\)$/, ""), l.match(/\((.*)\)$/)?.[1] || ""]);
    markInvalid(miss.map((m) => m[0]));
    if (miss.length) {
      setErr(`Preencha os dados da SC: ${miss.map((m) => m[1] + (m[2] ? " (" + m[2] + ")" : "")).join(", ")}.${miss.some((m) => m[0] === "xobs1") ? " O motivo precisa ter ao menos 10 caracteres." : ""}`);
      return;
    }
    setErr(""); setBusy(true);
    try {
      const now = new Date(), pad = (n: number) => String(n).padStart(2, "0");
      const at = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
      const num = "SIM-" + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + "-" + pad(now.getHours()) + pad(now.getMinutes());
      const blob = await buildPdf({ model, cart, atts, num, at, baseStr: ds.meta.base, logo: await loadLogo() });
      saveBlob(`SC_${cart.f}_${num}.pdf`, blob);
      setCart((c) => ({ ...c, done: { num, at } }));
      toast("Relatório gerado. Nada foi enviado ao Protheus.");
    } catch (e) {
      toast("Não foi possível gerar o PDF. " + (e instanceof Error ? e.message : ""));
    } finally { setBusy(false); }
  };

  const edit = (i: number) => {
    const z = cart.items[i];
    setR((r) => ({ ...r, mode: z.srv ? "srv" : "mat", f: z.f, ...(z.srv ? { sp: z.sp ?? null } : { a: z.a ?? null, p: z.p ?? null }), q: String(z.q), d: z.need }));
    scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <section className="panel box" id="scitens" style={{ marginTop: 18 }} aria-labelledby="scith">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
        <h3 id="scith" style={{ margin: 0 }}>SC em montagem – filial {f}</h3>
        <span className="note">{cart.items.length} {cart.items.length === 1 ? "item" : "itens"}; orçamento {brl2.format(tot)}</span>
      </div>
      {nSp > 0 && <p className="pmiss" style={{ background: "var(--red-soft)" }}><b>Esta SC exige aprovação especial:</b> {nSp} {nSp === 1 ? "item está" : "itens estão"} acima da necessidade prevista.</p>}
      {cart.done && (
        <div className="pmiss" style={{ background: "var(--green-soft)" }}>
          <b>SC {cart.done.num} simulada e relatório gerado em {cart.done.at}.</b> Nada foi enviado ao Protheus.{" "}
          <button className="btn sec" style={{ marginLeft: 8 }} onClick={() => { setCart(EMPTY_CART); setAtts([]); }}>Iniciar nova requisição</button>
        </div>
      )}
      <div className="tablewrap" style={{ marginTop: 12 }}>
        <table className="mini">
          <thead><tr><th className="t">#</th><th className="t">Produto</th><th className="t">Arm.</th><th>Consumo/mês</th><th>Lead time</th><th>Ponto de pedido</th><th>Máximo</th><th>Posição</th><th>Necessidade prevista</th><th>Qtd. a comprar</th><th className="t">Aprovação</th><th>Orç. unit.</th><th>Total</th><th /></tr></thead>
          <tbody>
            {cart.items.map((z, i) => (
              <tr key={z.key} style={{ cursor: "default" }}>
                <td className="t">{i + 1}</td>
                <td className="t"><b>{z.c}</b>{z.srv && <> <span className="pill p-blue">Serviço</span></>}<span className="d">{z.d}</span></td>
                <td className="t">{z.l}</td>
                {z.srv ? <td colSpan={5} className="note" style={{ textAlign: "center" }}>sem análise de estoque</td>
                  : <><td>{fmt(z.cmm)}</td><td>{fmt0(z.lt)} d</td><td>{fmt0(z.pp)}</td><td>{fmt0(z.mx)}</td><td>{fmt(z.pos)}</td></>}
                <td>{z.srv ? "—" : fmt0(z.prev)}</td>
                <td><b>{fmt(z.q)}</b> {z.u}</td>
                <td className="t">{z.special ? <span className="pill p-red">Especial</span> : <span className="pill p-green">Normal</span>}</td>
                <td>{brl2.format(z.preco)}</td><td>{brl2.format(z.q * z.preco)}</td>
                <td className="t" style={{ whiteSpace: "nowrap" }}>
                  <button className="btn sec" style={{ padding: "4px 9px" }} onClick={() => edit(i)}>Revisar</button>{" "}
                  <button className="btn sec" style={{ padding: "4px 9px" }} onClick={() => setCart((c) => { const items = c.items.filter((_, j) => j !== i); return items.length ? { ...c, items } : { ...c, items, f: "", done: null }; })}>Remover</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Dados gerais da SC <span className="note" style={{ font: "400 13px var(--body)" }}>valem para todos os itens</span></h3>
      <div className="scgrid" id="headf">
        <label className="fld wide"><Lab l="Motivo da SC" c="C1_XOBS1" req />
          <textarea data-h="xobs1" required aria-required="true" aria-invalid={invalid.has("xobs1") ? true : undefined} value={h.xobs1 || ""}
            placeholder="Por que estes materiais são necessários? Ex.: reposição para a parada da unidade, OS 77812"
            onChange={(e) => { setCart((c) => ({ ...c, head: { ...c.head, xobs1: e.target.value } })); }} />
        </label>
      </div>
      <dl className="kv" style={{ marginTop: 12, maxWidth: 760 }}>
        {HF.filter(([k]) => k !== "forn" || isDireta(h.mod)).map(([k, l, c]) => (
          <div key={k} style={{ display: "contents" }}>
            <dt>{l} <span className="note">({c})</span></dt>
            <dd style={{ textAlign: "right" }}>{h[k] ? hf(k) : <span className="flag">não informado</span>}</dd>
          </div>
        ))}
      </dl>
      <p className="note" style={{ margin: "6px 0 0" }}>Projeto, centro de custo, finalidade, demanda, modalidade, fornecedor e local de entrega são alterados no formulário à esquerda e valem para toda a SC.</p>
      <div className="fld wide" style={{ marginTop: 14 }}><AttBox id="attin2" /></div>
      {err && <div className="scerr" role="alert">{err}</div>}
      <p style={{ margin: "14px 0 0", display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn red" onClick={generate} disabled={busy}>{busy ? "Gerando…" : "Gerar SC e relatório em PDF"}</button>
        <button className="btn sec" onClick={() => { if (!confirm("Remover todos os itens da SC em montagem?")) return; setCart((c) => ({ ...EMPTY_CART, head: c.head })); setAtts([]); }}>Esvaziar lista</button>
      </p>
    </section>
  );
}
