/**
 * Estágio 2 do ETL: SpecDados -> Dataset (formato empacotado por índices, usado pela interface).
 * Função pura, roda em Node e no navegador.
 *
 * Deriva a partir da spec: demf/demp (somando consumo_mensal), lasta/lastp (ultimo_recebimento),
 * ltpf/ltp/ltg/ltglob (medianas sobre lead_time), prjf (somando projeto_locais).
 */
import type {
  Dataset, Alm, Prod, Row, PcItem, ScItem, Preco, Projeto, Fornecedor, Zzf,
} from "../types";
import { assertSpec, type SpecDados } from "./spec";

export interface OpcoesAssemble {
  /**
   * Abrevia nomes como o ETL original (fornecedor 40, projeto 60, centro de custo 40,
   * projeto por filial 50, fornecedor da lista 60 caracteres). Padrão: true (paridade com o seed).
   */
  truncarNomes?: boolean;
  /** Pula a validação da spec (padrão: valida e lança Error em português). */
  semValidar?: boolean;
}

const NOME_SEM_PROJETO_PC = "999999999 (sem nome cadastrado)";
const NOME_SEM_PROJETO_LISTA = "999999999 – sem nome cadastrado";

const mediana = (a: number[]): number => {
  const v = Float64Array.from(a).sort();
  const n = v.length;
  return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
};

const dias = (a: string, b: string): number =>
  Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 864e5);

function push<T>(m: Record<string, T[]>, k: string, v: T) {
  (m[k] ||= []).push(v);
}

export function assemble(spec: SpecDados, opts: OpcoesAssemble = {}): Dataset {
  if (!opts.semValidar) assertSpec(spec);
  const trunc = opts.truncarNomes !== false;
  const cut = (t: string, n: number) => (trunc ? t.slice(0, n) : t);
  const nomeProjPc = (t: string) => (t === "#N/D" ? NOME_SEM_PROJETO_PC : cut(t, 60));

  const N = spec.meta.meses.length;
  const mesIdx = new Map(spec.meta.meses.map((m, i) => [m, i]));

  // ---------- Índices
  const almOrdenados = [...spec.armazens].sort((a, b) => (a.filial + a.local < b.filial + b.local ? -1 : a.filial + a.local > b.filial + b.local ? 1 : 0));
  const alm: Alm[] = almOrdenados.map((a) => [a.filial, a.local, a.nome]);
  const almIdx = new Map(alm.map((a, i) => [a[0] + "|" + a[1], i]));
  const prod: Prod[] = spec.produtos.map((p) => [p.cod, p.descricao, p.um, p.grupo, p.tipo]);
  const prodIdx = new Map(prod.map((p, i) => [p[0], i]));
  const servIdx = new Map(spec.servicos.map((p, i) => [p.cod, i]));
  const grupoDe = (i: number) => prod[i][3];

  const grp: Record<string, string> = {};
  for (const g of spec.grupos) grp[g.grupo] = g.descricao;

  // ---------- Consumo: por (alm, prod) [armazém != 0000], por prod|filial e por prod
  const demPar = new Map<string, number[]>(); // "a|p"
  const demf: Record<string, number[]> = {};
  const demp: Record<string, number[]> = {};
  for (const c of spec.consumo_mensal) {
    const p = prodIdx.get(c.produto);
    const mi = mesIdx.get(c.mes);
    if (p === undefined || mi === undefined || !(c.qtd > 0)) continue;
    const kf = p + "|" + c.filial;
    (demf[kf] ||= new Array(N).fill(0))[mi] += c.qtd;
    (demp[p] ||= new Array(N).fill(0))[mi] += c.qtd;
    if (c.local === "0000") continue;
    const a = almIdx.get(c.filial + "|" + c.local);
    if (a === undefined) continue;
    const kp = a + "|" + p;
    let arr = demPar.get(kp);
    if (!arr) demPar.set(kp, (arr = new Array(N).fill(0)));
    arr[mi] += c.qtd;
  }

  // ---------- rows: linhas de saldo (ordem da spec) + pares só com consumo; estável por armazém
  const rowsPorAlm: Row[][] = alm.map(() => []);
  const vistos = new Set<string>();
  for (const s of spec.saldos) {
    if (s.local === "0000") continue;
    const a = almIdx.get(s.filial + "|" + s.local);
    const p = prodIdx.get(s.produto);
    if (a === undefined || p === undefined) continue;
    const kp = a + "|" + p;
    if (vistos.has(kp)) continue;
    vistos.add(kp);
    rowsPorAlm[a].push([a, p, s.qtd, s.valor, s.custo_medio, demPar.get(kp) ?? new Array(N).fill(0)]);
  }
  // Pares com consumo mas sem linha de saldo: o custo médio não vem na spec (no Protheus seria o B2_CM1 de uma
  // linha de SB2 com saldo zero). Estimativa: último preço do produto; sem preço, 1.
  const precoDe = new Map<number, number>();
  for (const u of spec.ultimo_preco) {
    const p = prodIdx.get(u.produto);
    if (p !== undefined && u.preco > 0) precoDe.set(p, u.preco);
  }
  const soConsumo: Row[][] = alm.map(() => []);
  for (const [kp, dem] of demPar) {
    if (vistos.has(kp)) continue;
    const [a, p] = kp.split("|").map(Number);
    soConsumo[a].push([a, p, 0, 0, precoDe.get(p) ?? 1, dem]);
  }
  // ordem do seed: por armazém e, dentro dele, pelo código do produto
  const rows: Row[] = [];
  for (let a = 0; a < alm.length; a++) {
    const l = [...rowsPorAlm[a], ...soConsumo[a]];
    l.sort((x, y) => (prod[x[1]][0] < prod[y[1]][0] ? -1 : prod[x[1]][0] > prod[y[1]][0] ? 1 : 0));
    rows.push(...l);
  }

  // ---------- Último recebimento
  const lasta: Dataset["lasta"] = {};
  const lastp: Dataset["lastp"] = {};
  for (const u of spec.ultimo_recebimento) {
    const p = prodIdx.get(u.produto);
    if (p === undefined) continue;
    lasta[p + "|" + u.filial + "|" + u.local] = [u.data, "PC " + u.pc];
    const cur = lastp[p];
    if (!cur || u.data > cur[0]) lastp[p] = [u.data, u.filial, "PC " + u.pc];
  }

  // ---------- Lead time
  const gpf: Record<string, number[]> = {};
  const gp: Record<string, number[]> = {};
  const gg: Record<string, number[]> = {};
  const todos: number[] = [];
  for (const l of spec.lead_time) {
    const p = prodIdx.get(l.produto);
    if (p === undefined) continue;
    const d = dias(l.emissao, l.nf_digitacao);
    push(gpf, p + "|" + l.filial, d);
    push(gp, String(p), d);
    push(gg, grupoDe(p), d);
    todos.push(d);
  }
  const resumo = (g: Record<string, number[]>) => {
    const o: Record<string, [number, number]> = {};
    for (const [k, v] of Object.entries(g)) o[k] = [mediana(v), v.length];
    return o;
  };

  // ---------- PCs e SCs abertos (indexados por produto, na ordem da spec)
  const pcs: Record<string, PcItem[]> = {};
  for (const x of spec.pcs_abertos) {
    const p = prodIdx.get(x.produto);
    if (p === undefined) continue;
    push(pcs, String(p), [x.filial, x.local, x.pc, x.item, x.qtd_pendente, x.entrega_prevista ?? "", cut(x.fornecedor_nome, 40), x.emissao ?? "", nomeProjPc(x.projeto_nome)]);
  }
  const scs: Record<string, ScItem[]> = {};
  for (const x of spec.scs_abertas) {
    const p = prodIdx.get(x.produto);
    if (p === undefined) continue;
    push(scs, String(p), [x.filial, x.local, x.sc, x.item, x.qtd_pendente, x.emissao ?? "", x.necessidade ?? "", x.solicitante, x.situacao, nomeProjPc(x.projeto_nome)]);
  }

  // ---------- Centros de custo e projetos por filial
  const ordena = <T,>(l: T[], q: (x: T) => number, cod: (x: T) => string) =>
    l.sort((a, b) => q(b) - q(a) || (cod(a) < cod(b) ? -1 : cod(a) > cod(b) ? 1 : 0));
  const ccf: Dataset["ccf"] = {};
  for (const c of spec.centros_custo_filial) push(ccf, c.filial, [c.cc, cut(c.nome, 40), c.qtd_itens] as [string, string, number]);
  for (const l of Object.values(ccf)) ordena(l, (x) => x[2], (x) => x[0]);

  const nomeProj = new Map(spec.projetos.map((p) => [p.codigo, p.nome]));
  const prjfAcum = new Map<string, number>(); // "filial|projeto"
  for (const l of spec.projeto_locais) {
    const k = l.filial + "|" + l.projeto;
    prjfAcum.set(k, (prjfAcum.get(k) ?? 0) + l.qtd_itens);
  }
  const prjf: Dataset["prjf"] = {};
  for (const [k, q] of prjfAcum) {
    const [f, c] = k.split("|");
    push(prjf, f, [c, cut(nomeProj.get(c) ?? "", 50), q] as [string, string, number]);
  }
  for (const l of Object.values(prjf)) ordena(l, (x) => x[2], (x) => x[0]);

  const porProj = new Map<string, Projeto>();
  for (const l of spec.projeto_locais) {
    let pr = porProj.get(l.projeto);
    if (!pr) {
      const nome = nomeProj.get(l.projeto) ?? l.projeto;
      porProj.set(l.projeto, (pr = [l.projeto, nome === "#N/D" ? NOME_SEM_PROJETO_LISTA : nome, [], 0]));
    }
    pr[2].push([l.filial, l.local, l.qtd_itens]);
    pr[3] += l.qtd_itens;
  }
  const proj = ordena([...porProj.values()], (x) => x[3], (x) => x[0]);
  for (const pr of proj) pr[2].sort((a, b) => b[2] - a[2]); // estável: empates na ordem de entrada

  // ---------- Preços
  const lpc: Dataset["lpc"] = {};
  const lps: Dataset["lps"] = {};
  for (const u of spec.ultimo_preco) {
    const reg: Preco = [u.preco, u.data, u.pc, u.filial];
    const p = prodIdx.get(u.produto);
    if (p !== undefined) lpc[p] = reg;
    const sv = servIdx.get(u.produto);
    if (sv !== undefined) lps[sv] = reg;
  }

  const forn: Fornecedor[] = ordena(
    spec.fornecedores.map((f) => [f.cod, f.loja, cut(f.nome, 60), f.cnpj, f.qtd_pedidos] as Fornecedor),
    (x) => x[4],
    () => "",
  );
  const zzf: Zzf[] = spec.locais_entrega.map((z) => [z.ref, z.filial, z.cnpj, z.local, z.descricao, z.projeto, z.cc, z.obs_entrega, z.cep]);

  const [ay, am, ad] = spec.meta.base.split("-");
  return {
    meta: { base: `${ad}/${am}/${ay}`, months: spec.meta.meses, ltglob: todos.length ? mediana(todos) : 0, geradoEm: spec.meta.gerado_em },
    alm, prod, grp, rows, pcs, scs,
    ltp: resumo(gp), ltpf: resumo(gpf), ltg: resumo(gg),
    demf, demp, lasta, lastp, ccf, prjf, lpc,
    fins: spec.dominios.finalidades, mods: spec.dominios.modalidades, dems: spec.dominios.demandas,
    serv: spec.servicos.map((s) => [s.cod, s.descricao, s.um, s.grupo]),
    lps, proj, forn, zzf,
  };
}
