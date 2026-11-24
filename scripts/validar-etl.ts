/**
 * Valida o ETL: lê os 5 Excel do disco, roda excelToSpec + assemble e compara com data/seed.json chave a chave.
 *
 * Uso:  npx --yes tsx scripts/validar-etl.ts [pastaDosExcel] [--sem-spec]
 *   pastaDosExcel: padrão ~/Downloads
 * Gera scripts/spec-exemplo.json (a spec completa; se passar de ~25 MB, só uma filial).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { excelToSpec, assemble, validateSpec } from "../lib/etl";
import type { SpecDados } from "../lib/etl";
import type { Dataset } from "../lib/types";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, "..");
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const pasta = args[0] ?? path.join(os.homedir(), "Downloads");
const arquivos = {
  scs: "BASE DE SCs - 03.11.2026.xlsx",
  estoque: "BaseDadosEstoque 1.xlsx",
  pedidos: "PEDIDOS EMITIDOS - 03.11.2026.xlsx",
  zzf: "TabelaZZF_LocaisEntrega.xlsx",
  mapa: "COM_001_MAPA_PEDIDO_COMPRA (6).xlsx",
};
const TOL = 0.01;
const ler = (f: string) => { const b = fs.readFileSync(path.join(pasta, f)); return new Uint8Array(b.buffer, b.byteOffset, b.length); };

// ---------- comparação
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function igual(a: any, b: any): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= TOL;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => igual(x, b[i]));
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => igual(a[k], b[k]));
  }
  return a === b;
}
const resumo = (x: unknown) => JSON.stringify(x).slice(0, 220);
const linhas: string[] = [];
const out = (s: string) => { console.log(s); linhas.push(s); };

interface Res { chave: string; total: number; ok: number; detalhe: string }
const resultados: Res[] = [];
function reg(chave: string, total: number, ok: number, extra: string, exemplos: string[] = []) {
  const pct = total ? ((ok / total) * 100).toFixed(2) : "100.00";
  out(`${ok === total ? "OK " : "DIF"} ${chave.padEnd(22)} ${String(ok).padStart(7)}/${String(total).padEnd(7)} ${pct.padStart(7)}%  ${extra}`);
  for (const e of exemplos.slice(0, 3)) out("      " + e);
  resultados.push({ chave, total, ok, detalhe: extra });
}

/** Objeto indexado por chave (ordem das chaves irrelevante). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cmpObj(chave: string, calc: Record<string, any>, seed: Record<string, any>) {
  let ok = 0, dif = 0, soSeed = 0;
  const ex: string[] = [];
  for (const k of Object.keys(seed)) {
    if (!(k in calc)) { soSeed++; if (ex.length < 3) ex.push(`só no seed: ${k} ${resumo(seed[k])}`); continue; }
    if (igual(calc[k], seed[k])) ok++; else { dif++; if (ex.length < 3) ex.push(`dif ${k}: seed ${resumo(seed[k])} | etl ${resumo(calc[k])}`); }
  }
  const soEtl = Object.keys(calc).filter((k) => !(k in seed)).length;
  reg(chave, Object.keys(seed).length, ok, `diferentes ${dif}, só no seed ${soSeed}, só no ETL ${soEtl}`, ex);
}

/** Lista com ordem relevante; informa também a igualdade ignorando a ordem. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cmpLista(chave: string, calc: any[], seed: any[]) {
  let ok = 0;
  const ex: string[] = [];
  const n = Math.max(calc.length, seed.length);
  for (let i = 0; i < n; i++) {
    if (i < calc.length && i < seed.length && igual(calc[i], seed[i])) ok++;
    else if (ex.length < 3) ex.push(`[${i}] seed ${resumo(seed[i])} | etl ${resumo(calc[i])}`);
  }
  const cs = new Set(calc.map((x) => JSON.stringify(x)));
  const ordemOk = seed.filter((x) => cs.has(JSON.stringify(x))).length;
  reg(chave, seed.length, ok, `etl=${calc.length}; mesmo conteúdo, qualquer ordem: ${ordemOk}/${seed.length}`, ex);
}

/** Objeto cujos valores são listas; compara a lista de cada chave em ordem e fora de ordem. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cmpObjListas(chave: string, calc: Record<string, any[]>, seed: Record<string, any[]>) {
  let ok = 0, semOrdem = 0, dif = 0, soSeed = 0;
  const ex: string[] = [];
  for (const k of Object.keys(seed)) {
    const c = calc[k];
    if (!c) { soSeed++; continue; }
    if (igual(c, seed[k])) { ok++; continue; }
    const a = c.map((x) => JSON.stringify(x)).sort().join("\n");
    const b = seed[k].map((x) => JSON.stringify(x)).sort().join("\n");
    if (a === b) semOrdem++;
    else { dif++; if (ex.length < 3) ex.push(`dif ${k}: seed ${resumo(seed[k])} | etl ${resumo(c)}`); }
  }
  const soEtl = Object.keys(calc).filter((k) => !(k in seed)).length;
  reg(chave, Object.keys(seed).length, ok, `só ordem diferente ${semOrdem}, conteúdo diferente ${dif}, só no seed ${soSeed}, só no ETL ${soEtl}`, ex);
}

function subsetFilial(spec: SpecDados, f: string): SpecDados {
  const por = <T extends { filial: string }>(l: T[]) => l.filter((x) => x.filial === f);
  const prods = new Set<string>();
  const s2: SpecDados = {
    ...spec,
    armazens: por(spec.armazens), saldos: por(spec.saldos), consumo_mensal: por(spec.consumo_mensal), lead_time: por(spec.lead_time),
    ultimo_recebimento: por(spec.ultimo_recebimento), pcs_abertos: por(spec.pcs_abertos), scs_abertas: por(spec.scs_abertas),
    ultimo_preco: por(spec.ultimo_preco), projeto_locais: por(spec.projeto_locais), centros_custo_filial: por(spec.centros_custo_filial),
    locais_entrega: por(spec.locais_entrega),
  };
  for (const l of [s2.saldos, s2.consumo_mensal, s2.lead_time, s2.ultimo_recebimento, s2.pcs_abertos, s2.scs_abertas, s2.ultimo_preco])
    for (const x of l) prods.add(x.produto);
  s2.produtos = spec.produtos.filter((p) => prods.has(p.cod));
  s2.servicos = spec.servicos.filter((p) => prods.has(p.cod));
  const pj = new Set(s2.projeto_locais.map((p) => p.projeto));
  s2.projetos = spec.projetos.filter((p) => pj.has(p.codigo));
  return s2;
}

async function main() {
  out(`Pasta dos Excel: ${pasta}`);
  const buf = Object.fromEntries(Object.entries(arquivos).map(([k, f]) => [k, ler(f)])) as unknown as Record<keyof typeof arquivos, Uint8Array>;
  const seed = JSON.parse(fs.readFileSync(path.join(raiz, "data", "seed.json"), "utf8")) as Dataset;

  const t0 = Date.now();
  const spec = excelToSpec(buf, { base: "2026-11-03", progresso: (m) => console.log(`  [${((Date.now() - t0) / 1000).toFixed(1)} s] ${m}`) });
  const t1 = Date.now();
  const ds = assemble(spec);
  const t2 = Date.now();
  const v = validateSpec(spec);
  out(`\nTempo: excelToSpec ${((t1 - t0) / 1000).toFixed(1)} s, assemble ${((t2 - t1) / 1000).toFixed(2)} s, total ${((t2 - t0) / 1000).toFixed(1)} s`);
  out(`Memória: pico RSS ${(process.resourceUsage().maxRSS / 1024).toFixed(0)} MB, heap atual ${(process.memoryUsage().heapUsed / 1048576).toFixed(0)} MB`);
  out(`validateSpec: ${v.ok ? "ok" : "ERROS"} ${v.erros.slice(0, 5).join(" | ")} ${v.avisos.length ? "avisos: " + v.avisos.join(" | ") : ""}`);
  out("Contagens da spec: " + Object.entries(spec).filter(([, x]) => Array.isArray(x)).map(([k, x]) => `${k}=${(x as unknown[]).length}`).join(", "));
  out("");

  // ---------- chaves
  reg("meta", 3, [seed.meta.base === ds.meta.base, igual(seed.meta.months, ds.meta.months), seed.meta.ltglob === ds.meta.ltglob].filter(Boolean).length,
    `base ${ds.meta.base}, ltglob seed ${seed.meta.ltglob} etl ${ds.meta.ltglob}`);
  cmpLista("alm", ds.alm, seed.alm);
  cmpLista("prod", ds.prod, seed.prod);
  cmpObj("grp", ds.grp, seed.grp);
  cmpLista("rows", ds.rows, seed.rows);
  {
    const chave = (d: Dataset) => new Map(d.rows.map((r) => [d.alm[r[0]].join("|") + "#" + d.prod[r[1]][0], r]));
    const a = chave(ds), b = chave(seed);
    let ok = 0, cmDif = 0, demDif = 0, so = 0;
    for (const [k, r] of b) {
      const c = a.get(k);
      if (!c) { so++; continue; }
      if (igual(c[2], r[2]) && igual(c[3], r[3]) && igual(c[5], r[5])) { if (igual(c[4], r[4])) ok++; else cmDif++; } else demDif++;
    }
    reg("rows (por chave)", b.size, ok, `custo médio diferente ${cmDif}, saldo/valor/consumo diferente ${demDif}, ausentes no ETL ${so}, extras no ETL ${a.size - (b.size - so)}`);
  }
  cmpObjListas("pcs", ds.pcs, seed.pcs);
  cmpObjListas("scs", ds.scs, seed.scs);
  cmpObj("ltp", ds.ltp, seed.ltp);
  cmpObj("ltpf", ds.ltpf, seed.ltpf);
  cmpObj("ltg", ds.ltg, seed.ltg);
  cmpObj("demf", ds.demf, seed.demf);
  cmpObj("demp", ds.demp, seed.demp);
  cmpObj("lasta", ds.lasta, seed.lasta);
  cmpObj("lastp", ds.lastp, seed.lastp);
  cmpObjListas("ccf", ds.ccf, seed.ccf);
  cmpObjListas("prjf", ds.prjf, seed.prjf);
  cmpObj("lpc", ds.lpc, seed.lpc);
  cmpLista("fins", ds.fins, seed.fins);
  cmpLista("mods", ds.mods, seed.mods);
  cmpLista("dems", ds.dems, seed.dems);
  cmpLista("serv", ds.serv, seed.serv);
  cmpObj("lps", ds.lps, seed.lps);
  cmpLista("proj", ds.proj, seed.proj);
  {
    // proj ignorando a ordem dos locais dentro de cada projeto (empates sem regra)
    const norm = (l: Dataset["proj"]) => l.map((p) => [p[0], p[1], p[3], [...p[2]].map((x) => x.join("|")).sort().join(",")]);
    const a = norm(ds.proj), b = norm(seed.proj);
    reg("proj (locais s/ ordem)", b.length, b.filter((x, i) => igual(x, a[i])).length, "");
  }
  cmpLista("forn", ds.forn, seed.forn);
  cmpLista("zzf", ds.zzf, seed.zzf);

  // ---------- resumo
  const totalOk = resultados.filter((r) => r.ok === r.total).length;
  out(`\nChaves 100% iguais: ${totalOk}/${resultados.length}`);

  // ---------- spec de exemplo
  let json = JSON.stringify(spec);
  let nota = "completa";
  if (json.length > 25 * 1024 * 1024) {
    const sub = subsetFilial(spec, "03029");
    const vs = validateSpec(sub);
    json = JSON.stringify(sub);
    nota = `somente a filial 03029 (spec completa: ${(JSON.stringify(spec).length / 1048576).toFixed(1)} MB)${vs.ok ? "" : " [INVÁLIDA: " + vs.erros.join("; ") + "]"}`;
  }
  fs.writeFileSync(path.join(aqui, "spec-exemplo.json"), json);
  out(`scripts/spec-exemplo.json: ${(json.length / 1048576).toFixed(1)} MB, ${nota}`);
  // confere que assemble sozinho (a partir do JSON) funciona
  const re = assemble(JSON.parse(json) as SpecDados);
  out(`assemble(spec-exemplo.json): ${re.rows.length} rows, ${re.prod.length} produtos`);

  fs.writeFileSync(path.join(aqui, "validar-etl.relatorio.txt"), linhas.join("\n"));
}

main().catch((e) => { console.error(e); process.exit(1); });
