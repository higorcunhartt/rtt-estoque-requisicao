/** Regras do cabeçalho da SC (projeto, centro de custo, local de entrega etc.), compartilhadas pela tela e pelo PDF. */
import type { Model, ZzfX } from "./calc";
import type { Cart, CartHead } from "./cart";

export const HF: [keyof CartHead, string, string][] = [
  ["pj", "Projeto", "NOME_PROJETO"], ["cc", "Centro de custo", "C1_CC"], ["fin", "Finalidade", "FINALIDADE"],
  ["dem", "Tipo de demanda", "DEMANDA"], ["mod", "Modalidade", "MODALIDADE"], ["forn", "Fornecedor", "código + loja"], ["local", "Local de entrega", "código ZZF"],
];

export const isDireta = (v?: string) => /^direta$/i.test(v || "");

export const padZ = (v: string) => {
  v = String(v || "").trim();
  const m = v.match(/^(\d{1,3})(\s|–|-|$)/);
  return m ? m[1].padStart(3, "0") : v.split(/\s/)[0];
};

export function resolveZ(m: Model, code: string, f: string): ZzfX | null {
  const L = m.zzfByCode.get(padZ(code));
  if (!L) return null;
  return L.find((z) => z.f === f) || L[0];
}

export function curZ(m: Model, cart: Cart, fallbackF: string): ZzfX | null {
  const h = cart.head;
  if (!h.local) return null;
  if (h.localZ != null && m.ZZF[h.localZ] && m.ZZF[h.localZ].c === h.local) return m.ZZF[h.localZ];
  return resolveZ(m, h.local, cart.f || fallbackF);
}

export type OptKind = "fin" | "dem" | "mod" | "local" | "cc" | "prj";
export function optsFor(m: Model, k: OptKind, f: string): [string, string][] {
  const D = m.D;
  if (k === "fin") return D.fins.map((v) => [v, v]);
  if (k === "dem") return D.dems.map((v) => [v, v]);
  if (k === "mod") return D.mods.map((v) => [v, v]);
  if (k === "local") return m.ALM.filter((a) => a.f === f).map((a) => [a.l, a.l + (a.n ? " – " + a.n : "")]);
  if (k === "cc") return (D.ccf[f] || []).map((c) => [c[0], c[0] + (c[1] ? " – " + c[1] : "")]);
  if (k === "prj") return (D.prjf[f] || []).map((c) => [c[0], c[1] || c[0]]);
  return [];
}
export const optLabel = (m: Model, k: OptKind, f: string, v: string | undefined) => {
  const o = optsFor(m, k, f).find((z) => z[0] === v);
  return o ? o[1] : v || "";
};

export const prjName = (m: Model, c?: string) => (c && m.prjBy.get(c)?.n) || c || "—";

export function headLabel(m: Model, cart: Cart, fallbackF: string, k: keyof CartHead): string {
  const h = cart.head, v = h[k] as string | undefined;
  if (k === "pj") return prjName(m, v);
  if (k === "cc") return optLabel(m, "cc", cart.f || fallbackF, v);
  if (k === "local") {
    const z = curZ(m, cart, fallbackF);
    return z ? `${z.c} – ${z.desc}` : v || "";
  }
  if (k === "forn") {
    const fo = m.fornBy.get(v || "");
    return fo ? `${fo.k} – ${fo.n}` : v || "";
  }
  return v || "";
}

/** Campos do cabeçalho ainda não preenchidos: [chave, rótulo]. */
export function headMissing(m: Model, cart: Cart, fallbackF: string): [keyof CartHead, string][] {
  const h = cart.head, miss: [keyof CartHead, string][] = [];
  for (const [k, l, c] of HF) {
    if (k === "local") { if (!curZ(m, cart, fallbackF)) miss.push([k, l + " (código ZZF)"]); continue; }
    if (k === "forn") { if (isDireta(h.mod) && !m.fornBy.has(h.forn || "")) miss.push([k, l + " (modalidade Direta)"]); continue; }
    if (!h[k]) miss.push([k, l + " (" + c + ")"]);
  }
  return miss;
}
