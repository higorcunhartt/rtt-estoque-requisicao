import type { Dataset } from "./types";
import { fmt, fmt0, mes, nf, nf2, parseBase } from "./format";

export interface Settings {
  win: number; // janela de consumo, em meses (6, 12, 22)
  cobm: number; // cobertura após o ponto de pedido, em meses
  abat: number; // 1 = abater PCs e SCs abertos
  es: number; // estoque de segurança: 0, 15, 30 dias ou -1 (estatístico 95%)
  trig: number; // 1 = comprar só ao atingir o ponto de pedido
}
export const DEFAULT_SETTINGS: Settings = { win: 12, cobm: 3, abat: 1, es: 15, trig: 1 };

export function sanitizeSettings(s: Partial<Settings>): Settings {
  const o = { ...DEFAULT_SETTINGS, ...s };
  if (![6, 12, 22].includes(o.win)) o.win = 12;
  if (![1, 2, 3, 4, 6].includes(o.cobm)) o.cobm = 3;
  if (![0, 1].includes(o.abat)) o.abat = 1;
  if (![0, 15, 30, -1].includes(o.es)) o.es = 15;
  if (![0, 1].includes(o.trig)) o.trig = 1;
  return o;
}

export interface AlmX { i: number; f: string; l: string; n: string }
export interface ProdX { i: number; c: string; d: string; u: string; g: string; t: string }
export interface RowX { a: number; p: number; saldo: number; vatu: number; cm: number; dem: number[] }
export interface PrjX { i: number; c: string; n: string; locs: { f: string; l: string; k: number }[]; tot: number }
export interface FornX { c: string; l: string; n: string; cnpj: string; k: string }
export interface ZzfX { i: number; c: string; f: string; cnpj: string; desc: string; end: string; pj: string; cc: string; obs: string; cep: string }
export interface ServX { i: number; c: string; d: string; u: string; g: string }

export type Model = ReturnType<typeof buildModel>;

export function buildModel(D: Dataset) {
  const N = D.meta.months.length;
  const BASE = parseBase(D.meta.base);
  const ALM: AlmX[] = D.alm.map((a, i) => ({ i, f: a[0], l: a[1], n: a[2] }));
  const PROD: ProdX[] = D.prod.map((p, i) => ({ i, c: p[0], d: p[1], u: p[2], g: p[3], t: p[4] }));
  const ROWS: RowX[] = D.rows.map((r) => ({ a: r[0], p: r[1], saldo: r[2], vatu: r[3], cm: r[4], dem: r[5] }));
  const rowsByProd = new Map<number, RowX[]>();
  const rowAt = new Map<string, RowX>();
  for (const r of ROWS) {
    let l = rowsByProd.get(r.p);
    if (!l) rowsByProd.set(r.p, (l = []));
    l.push(r);
    rowAt.set(r.a + "|" + r.p, r);
  }
  const pcSum = new Map<string, number>();
  const scSum = new Map<string, number>();
  for (const [p, list] of Object.entries(D.pcs)) for (const x of list) {
    const k = p + "|" + x[0] + "|" + x[1];
    pcSum.set(k, (pcSum.get(k) || 0) + x[4]);
  }
  for (const [p, list] of Object.entries(D.scs)) for (const x of list) {
    const k = p + "|" + x[0] + "|" + x[1];
    scSum.set(k, (scSum.get(k) || 0) + x[4]);
  }
  const FILIAIS = [...new Set(ALM.map((a) => a.f))].sort();
  const PRJ: PrjX[] = D.proj.map((p, i) => ({ i, c: p[0], n: p[1], locs: p[2].map((x) => ({ f: x[0], l: x[1], k: x[2] })), tot: p[3] }));
  const prjBy = new Map(PRJ.map((p) => [p.c, p]));
  const FORN: FornX[] = D.forn.map((x) => ({ c: x[0], l: x[1], n: x[2], cnpj: x[3], k: x[0] + "-" + x[1] }));
  const fornBy = new Map(FORN.map((x) => [x.k, x]));
  const ZZF: ZzfX[] = D.zzf.map((z, i) => ({ i, c: z[0], f: z[1], cnpj: z[2], desc: z[3], end: z[4], pj: z[5], cc: z[6], obs: z[7], cep: z[8] }));
  const zzfByCode = new Map<string, ZzfX[]>();
  for (const z of ZZF) {
    let l = zzfByCode.get(z.c);
    if (!l) zzfByCode.set(z.c, (l = []));
    l.push(z);
  }
  const SERV: ServX[] = D.serv.map((s, i) => ({ i, c: s[0], d: s[1], u: s[2], g: s[3] }));
  const grpUsed = [...new Set(ROWS.map((r) => PROD[r.p].g))].sort();
  return { D, N, BASE, ALM, PROD, ROWS, rowsByProd, rowAt, pcSum, scSum, FILIAIS, PRJ, prjBy, FORN, fornBy, ZZF, zzfByCode, SERV, grpUsed };
}

export const almLabel = (a: AlmX) => `${a.f} / ${a.l}${a.n ? " – " + a.n : ""}`;
export const days = (m: Model, s: string) => Math.round((+new Date(s + "T12:00:00") - +m.BASE) / 864e5);

export interface Lead { d: number; n: number | null; src: string }
export function leadTime(m: Model, p: number, f: string): Lead {
  const D = m.D, g = m.PROD[p].g;
  let x = D.ltpf[p + "|" + f];
  if (x && x[1] >= 2) return { d: x[0], n: x[1], src: "produto nesta filial" };
  x = D.ltp[p];
  if (x) return { d: x[0], n: x[1], src: "produto, todas as filiais" };
  x = D.ltg[g];
  if (x) return { d: x[0], n: x[1], src: "grupo " + g };
  return { d: D.meta.ltglob, n: null, src: "média geral" };
}

export const ZSS = 1.65;
export const esLabel = (S: Settings) => (S.es < 0 ? "estatístico, 95%" : S.es === 0 ? "sem estoque de segurança" : `${S.es} dias de consumo`);

export function base(m: Model, S: Settings, r: RowX) {
  const a = m.ALM[r.a], w = S.win, win = r.dem.slice(m.N - w);
  const tot = win.reduce((s, x) => s + x, 0), cmm = tot / w, cmd = cmm / 30;
  const sd = Math.sqrt(win.reduce((s, x) => s + (x - cmm) ** 2, 0) / w), lt = leadTime(m, r.p, a.f);
  const es = cmm === 0 ? 0 : Math.ceil(S.es < 0 ? ZSS * sd * Math.sqrt(lt.d / 30) : cmd * S.es);
  const pp = cmm === 0 ? 0 : Math.ceil(cmd * lt.d + es);
  const mx = cmm === 0 ? 0 : Math.ceil(pp + cmd * S.cobm * 30);
  return { tot, cmm, cmd, sd, lt, es, pp, mx, freq: win.filter((x) => x > 0).length };
}

export interface Other { a: AlmX; saldo: number; cmm: number; need: number; disp: number }
export function othersOf(m: Model, S: Settings, r: RowX): Other[] {
  const f = m.ALM[r.a].f;
  return (m.rowsByProd.get(r.p) || [])
    .filter((o) => o.a !== r.a && m.ALM[o.a].f === f && o.saldo > 0)
    .map((o) => {
      const b = base(m, S, o);
      return { a: m.ALM[o.a], saldo: o.saldo, cmm: b.cmm, need: b.mx, disp: Math.max(0, o.saldo - b.mx) };
    })
    .sort((a, b) => b.disp - a.disp);
}

export type StKey = "comprar" | "coberto" | "excesso" | "parado" | "semcons";
export const ST: Record<StKey, { l: string; c: string; dot: string; vl: string }> = {
  comprar: { l: "Necessidade de compra", c: "p-red", dot: "var(--red)", vl: "necessidade prevista" },
  coberto: { l: "Coberto pelo estoque", c: "p-green", dot: "var(--green)", vl: "em estoque" },
  excesso: { l: "Acima do máximo", c: "p-amber", dot: "var(--amber)", vl: "acima do estoque máximo" },
  parado: { l: "Sem consumo, com saldo", c: "p-blue", dot: "var(--blue)", vl: "parado em estoque" },
  semcons: { l: "Sem consumo, sem saldo", c: "p-gray", dot: "var(--ink3)", vl: "" },
};
export const PRIO: Record<StKey, number> = { comprar: 0, excesso: 1, coberto: 2, parado: 3, semcons: 4 };

export function calc(m: Model, S: Settings, r: RowX) {
  const a = m.ALM[r.a], P = m.PROD[r.p], b = base(m, S, r);
  const pc = m.pcSum.get(r.p + "|" + a.f + "|" + a.l) || 0;
  const sc = m.scSum.get(r.p + "|" + a.f + "|" + a.l) || 0;
  const oth = othersOf(m, S, r);
  const othSaldo = oth.reduce((s, o) => s + o.saldo, 0), othDisp = oth.reduce((s, o) => s + o.disp, 0);
  const abat = S.abat ? pc + sc : 0, pos = r.saldo + othDisp + abat;
  const hit = pos <= b.pp;
  const prev = b.cmm === 0 ? 0 : S.trig && !hit ? 0 : Math.max(0, Math.ceil(b.mx - pos - 1e-9));
  const cobAt = b.cmm > 0 ? r.saldo / b.cmm : null;
  const st: StKey = b.cmm === 0 ? (r.saldo > 0 ? "parado" : "semcons") : prev > 0 ? "comprar" : r.saldo > b.mx ? "excesso" : "coberto";
  const v = st === "comprar" ? prev * r.cm : st === "excesso" ? (r.saldo - b.mx) * r.cm : r.vatu;
  return { r, a, P, ...b, pc, sc, oth, othSaldo, othDisp, abat, pos, hit, prev, cobAt, st, v, val: (b.tot * r.cm) / S.win * 12, abc: "" as string };
}
export type Calc = ReturnType<typeof calc>;

export function computeAll(m: Model, S: Settings): Calc[] {
  const RES = m.ROWS.map((r) => calc(m, S, r));
  const byA = new Map<number, Calc[]>();
  for (const x of RES) if (x.val > 0) {
    let l = byA.get(x.r.a);
    if (!l) byA.set(x.r.a, (l = []));
    l.push(x);
  }
  for (const list of byA.values()) {
    list.sort((a, b) => b.val - a.val);
    const T = list.reduce((s, x) => s + x.val, 0);
    let c = 0;
    for (const x of list) {
      c += x.val;
      x.abc = c / T <= 0.8 ? "A" : c / T <= 0.95 ? "B" : "C";
    }
  }
  return RES;
}

/** Memória do cálculo: [rótulo, fórmula, valor][] */
export function memo(x: Calc, S: Settings): [string, string, string][] {
  const othTxt = x.oth.length
    ? x.oth.map((o) => `arm. ${o.a.l}: saldo ${fmt(o.saldo)} − máximo próprio ${fmt0(o.need)} = ${fmt(o.disp)}`).join("; ")
    : "sem saldo nos outros armazéns";
  const cmd2 = nf2.format(x.cmd);
  const esF = x.cmm === 0 ? "sem consumo" : S.es < 0 ? `${nf.format(ZSS)} × desvio ${fmt(x.sd)} × √(${fmt0(x.lt.d)}/30)` : S.es === 0 ? "política sem estoque de segurança" : `${cmd2} × ${S.es} dias`;
  return [
    ["Consumo médio mensal", `${fmt(x.tot)} recebidos em ${mes(S.win)} ÷ ${S.win}`, fmt(x.cmm)],
    ["Consumo médio diário (CMD)", `${fmt(x.cmm)} ÷ 30`, cmd2],
    ["Lead time", `mediana ${x.lt.n ? `de ${x.lt.n} recebimentos, ` : ""}${x.lt.src}`, fmt0(x.lt.d) + " d"],
    [`Estoque de segurança (${esLabel(S)})`, esF, fmt0(x.es)],
    ["Ponto de pedido", `CMD × lead time + estoque de segurança = ${cmd2} × ${fmt0(x.lt.d)} + ${fmt0(x.es)}`, fmt0(x.pp)],
    ["Estoque máximo", `ponto de pedido + CMD × ${S.cobm * 30} dias de cobertura = ${fmt0(x.pp)} + ${cmd2} × ${S.cobm * 30}`, fmt0(x.mx)],
    ["Posição", `saldo ${fmt(x.r.saldo)} + disponível em outros armazéns ${fmt(x.othDisp)}${S.abat ? ` + PCs ${fmt(x.pc)} + SCs ${fmt(x.sc)}` : " (PCs e SCs não abatidos)"}. Outros armazéns: ${othTxt}`, fmt(x.pos)],
    ["Necessidade prevista", x.cmm === 0 ? "sem consumo, sem sugestão" : x.hit || !S.trig ? `posição ${x.hit ? "≤" : ">"} ponto de pedido: máximo ${fmt0(x.mx)} − posição ${fmt(x.pos)}` : `posição ${fmt(x.pos)} acima do ponto de pedido ${fmt0(x.pp)}: ainda não é hora de comprar`, fmt0(x.prev)],
  ];
}

export const policyText = (S: Settings) =>
  `consumo médio de ${mes(S.win)}; estoque de segurança ${esLabel(S)}; cobertura de ${mes(S.cobm)} após o ponto de pedido; ${S.abat ? "abatendo" : "sem abater"} PCs e SCs abertos; ${S.trig ? "compra só ao atingir o ponto de pedido" : "compra sempre que abaixo do máximo"}`;
