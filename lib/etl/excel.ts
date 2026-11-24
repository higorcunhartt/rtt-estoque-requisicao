/**
 * Estágio 1 do ETL: planilhas Excel do Protheus -> SpecDados (formato normalizado).
 * Função pura, roda em Node e no navegador (entradas são ArrayBuffer/Uint8Array).
 *
 * As regras abaixo foram reconstruídas por comparação com o seed (ver scripts/validar-etl.ts).
 */
import { lerTabela, serialParaIso, type Cel } from "./xlsx-lite";
import type {
  SpecDados, SpecConsumo, SpecLeadTime, SpecUltimoRecebimento, SpecPcAberto, SpecScAberta, SpecUltimoPreco,
  SpecProjeto, SpecProjetoLocal, SpecCentroCusto, SpecFornecedor, SpecSaldo, SpecArmazem, SpecProduto, SpecServico,
} from "./spec";

export type Arquivo = ArrayBuffer | Uint8Array;
export interface ArquivosExcel { scs: Arquivo; estoque: Arquivo; pedidos: Arquivo; zzf: Arquivo; mapa: Arquivo }
export interface OpcoesExcel {
  /** Data-base "AAAA-MM-DD". Se omitida, usa a maior data de emissão encontrada em pedidos e SCs. */
  base?: string;
  /** Recebe mensagens de progresso (ex.: console.log). */
  progresso?: (msg: string) => void;
}

const s = (v: Cel): string => (v == null ? "" : String(v).trim());
const num = (v: Cel): number => (typeof v === "number" ? v : v == null || v === "" ? 0 : Number(v) || 0);
/** Colapsa espaços repetidos (o seed normaliza os textos do ZZF). */
const sp = (v: Cel): string => s(v).replace(/\s+/g, " ");
const r2 = (x: number) => Math.round(x * 100) / 100;

/** "AAAAMMDD" (texto ou número) -> "AAAA-MM-DD" */
function ymd(v: Cel): string | null {
  const t = s(v);
  return t.length >= 8 ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` : null;
}

/** Os 22 meses fechados anteriores à data-base. */
export function janelaMeses(base: string, n = 22): string[] {
  let y = +base.slice(0, 4);
  let m = +base.slice(5, 7); // mês da base (aberto)
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    m--;
    if (m === 0) { m = 12; y--; }
    out.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return out.reverse();
}

export function excelToSpec(files: ArquivosExcel, opts: OpcoesExcel = {}): SpecDados {
  const log = opts.progresso ?? (() => {});

  // ---------- Estoque
  log("Lendo BaseDadosEstoque...");
  const tGrp = lerTabela(files.estoque, { aba: "GrupoDeProdutos", colunas: ["BM_GRUPO", "BM_DESC", "BM_XMVEST"] });
  const tCad = lerTabela(files.estoque, {
    aba: "CadastroProdutos",
    colunas: ["B1_COD", "B1_DESC", "B1_TIPO", "B1_UM", "B1_GRUPO", "B1_MSBLQL", "BM_XMVEST"],
  });
  const tCus = lerTabela(files.estoque, {
    aba: "CustoEstoque-MovIntegracaoERP",
    colunas: ["B2_FILIAL", "B2_LOCAL", "ARMAZEM", "B2_COD", "B2_QATU", "B2_VATU1", "B2_CM1"],
  });
  const grupos = tGrp.linhas
    .filter((r) => s(r[0]))
    .map((r) => ({ grupo: s(r[0]), descricao: s(r[1]), movimenta_estoque: (s(r[2]) === "S" ? "S" : "N") as "S" | "N" }));
  const gMov = new Map(grupos.map((g) => [g.grupo, g.movimenta_estoque === "S"]));

  // ---------- SCs
  log("Lendo BASE DE SCs...");
  const tSc = lerTabela(files.scs, {
    aba: "RTT_SC1010",
    ancora: "C1_FILIAL",
    colunas: [
      "C1_FILIAL", "C1_NUM", "C1_EMISSAO", "C1_ITEM", "C1_PRODUTO", "C1_DATPRF", "C1_LOCAL", "C1_CC", "NOME_CENTRO_CUSTO",
      "C1_ITEMCTA", "NOME_PROJETO", "NOME_SOLICITANTE", "C1_PEDIDO", "C1_RESIDUO", "C1_APROV", "QTD_PENDENTE_RESIDUADA",
      "SITUACAO", "FINALIDADE_", "MODALIDADE", "DEMANDA",
    ],
  });
  const SC = { fil: 0, num: 1, emi: 2, item: 3, prod: 4, prf: 5, loc: 6, cc: 7, ncc: 8, prj: 9, nprj: 10, sol: 11, ped: 12, res: 13, apr: 14, pend: 15, sit: 16, fin: 17, mod: 18, dem: 19 };

  // ---------- Pedidos
  log("Lendo PEDIDOS EMITIDOS...");
  const tPed = lerTabela(files.pedidos, {
    aba: "Plan1",
    ancora: "filial",
    colunas: [
      "filial", "dt_emissao", "numero_pc", "cod_fornece", "razao_social", "cnpj", "item", "produto", "quantidade", "prc_unitario",
      "dt_entrega", "armazem", "nome_projeto", "loja", "fil_fat_ent", "qtd_entregue", "resid_elim", "controle_ap",
    ],
  });
  const PD = { fil: 0, emi: 1, pc: 2, forn: 3, razao: 4, cnpj: 5, item: 6, prod: 7, qtd: 8, preco: 9, ent: 10, arm: 11, nprj: 12, loja: 13, filEnt: 14, entregue: 15, res: 16, ctl: 17 };
  const ped = tPed.linhas.filter((r) => s(r[PD.fil]));

  // ---------- Mapa
  log("Lendo MAPA_PEDIDO_COMPRA...");
  const tMap = lerTabela(files.mapa, {
    aba: "sheet1",
    colunas: ["FILIAL_ENTREGA", "PC NUM", "ITEM_NUM_NO_PEDIDO", "ITEM_COD_PRD", "DT EMISSAO PC", "NF", "NF_DT_DIGITACAO", "NF_ITM_QTD"],
  });
  const MP = { fil: 0, pc: 1, item: 2, prod: 3, emi: 4, nf: 5, dig: 6, qtd: 7 };

  // ---------- ZZF
  const tZzf = lerTabela(files.zzf, {
    colunas: ["ZZF_REF", "ZZF_FILRES", "ZZF_CNPJ", "ZZF_LOCENT", "ZZF_DESCLE", "ZZF_PROJET", "ZZF_CC", "ZZF_OBSENT", "ZZF_CEP"],
  });

  // ---------- Data-base e janela
  let base = opts.base;
  if (!base) {
    let mx = "";
    for (const r of ped) { const d = serialParaIso(r[PD.emi]); if (d && d > mx) mx = d; }
    for (const r of tSc.linhas) { const d = serialParaIso(r[SC.emi]); if (d && d > mx) mx = d; }
    base = mx;
  }
  const meses = janelaMeses(base);
  const mesIdx = new Map(meses.map((m, i) => [m, i]));
  const dtMin = meses[0] + "-01";
  const mesMax = meses[meses.length - 1];
  const naJanela = (d: string) => d >= dtMin && d.slice(0, 7) <= mesMax;

  // ---------- Referências (para produtos bloqueados que ainda têm movimento)
  log("Montando produtos...");
  const referenciados = new Set<string>();
  for (const r of tCus.linhas) referenciados.add(s(r[3]));
  for (const r of ped) if (s(r[PD.ctl]) === "L") referenciados.add(s(r[PD.prod]));
  for (const r of tSc.linhas) {
    if (s(r[SC.apr]) === "L" && !s(r[SC.ped]) && !s(r[SC.res]) && num(r[SC.pend]) > 1e-9) referenciados.add(s(r[SC.prod]));
  }

  const produtos: SpecProduto[] = [];
  const servicos: SpecServico[] = [];
  for (const r of tCad.linhas) {
    const cod = s(r[0]);
    if (!cod) continue;
    const tipo = s(r[2]);
    const bloqueado = s(r[5]) === "1";
    const grupo = s(r[4]);
    if (tipo === "SV" && !bloqueado) servicos.push({ cod, descricao: s(r[1]), um: s(r[3]), grupo });
    const mov = gMov.has(grupo) ? gMov.get(grupo)! : s(r[6]) === "S";
    if (mov && (!bloqueado || referenciados.has(cod))) produtos.push({ cod, descricao: s(r[1]), tipo, um: s(r[3]), grupo });
  }
  const ehProd = new Set(produtos.map((p) => p.cod));
  const ehServ = new Set(servicos.map((p) => p.cod));

  // ---------- Saldos e armazéns
  const saldos: SpecSaldo[] = [];
  const nomesArm = new Map<string, string>();
  for (const r of tCus.linhas) {
    const f = s(r[0]), l = s(r[1]);
    if (!f || l === "0000") continue;
    const k = f + "|" + l;
    if (!nomesArm.has(k)) nomesArm.set(k, s(r[2]));
    const cod = s(r[3]);
    if (!ehProd.has(cod)) continue;
    saldos.push({ filial: f, local: l, produto: cod, qtd: num(r[4]), valor: num(r[5]), custo_medio: num(r[6]) });
  }

  // ---------- Recebimentos: aloca a quantidade entregue de cada item de pedido nas NFs do mapa
  log("Calculando recebimentos...");
  const mapaPorItem = new Map<string, number[]>(); // chave -> índices de linhas do mapa
  const mapaRows = tMap.linhas;
  for (let i = 0; i < mapaRows.length; i++) {
    const r = mapaRows[i];
    const f = s(r[MP.fil]);
    if (!f) continue;
    const k = f + "|" + s(r[MP.pc]) + "|" + s(r[MP.item]);
    const l = mapaPorItem.get(k);
    if (l) l.push(i); else mapaPorItem.set(k, [i]);
  }

  const consumo = new Map<string, SpecConsumo>();
  const ultRec = new Map<string, { d: string; pc: string; idx: number }>();
  const ultRecOut: SpecUltimoRecebimento[] = [];
  const addAloc = (fil: string, loc: string, prod: string, pc: string, data: string, qtd: number, idx: number) => {
    if (!ehProd.has(prod) || !naJanela(data)) return;
    const mes = data.slice(0, 7);
    const kc = fil + "|" + loc + "|" + prod + "|" + mes;
    const c = consumo.get(kc);
    if (c) c.qtd += qtd; else consumo.set(kc, { filial: fil, local: loc, produto: prod, mes, qtd });
    const ku = prod + "|" + fil + "|" + loc;
    const u = ultRec.get(ku);
    // maior data; empate: pedido mais abaixo no arquivo
    if (!u || data > u.d || (data === u.d && idx >= u.idx)) ultRec.set(ku, { d: data, pc, idx });
  };
  for (let i = 0; i < ped.length; i++) {
    const r = ped[i];
    if (s(r[PD.ctl]) !== "L") continue;
    const entregue = num(r[PD.entregue]);
    if (!(entregue > 0)) continue;
    const fil = s(r[PD.filEnt]), pc = s(r[PD.pc]), item = s(r[PD.item]), prod = s(r[PD.prod]), loc = s(r[PD.arm]);
    let resta = entregue;
    const ix = mapaPorItem.get(fil + "|" + pc + "|" + item);
    if (ix) {
      // uma linha por NF (as demais são repetições por parcela financeira), ordenadas pela digitação
      const porNf = new Map<string, { dig: string; qtd: number }>();
      for (const j of ix) {
        const m = mapaRows[j];
        const dig = ymd(m[MP.dig]);
        const q = num(m[MP.qtd]);
        if (!dig || !(q > 0)) continue;
        const nk = s(m[MP.nf]) + "|" + dig;
        if (!porNf.has(nk)) porNf.set(nk, { dig, qtd: q });
      }
      const lista = [...porNf.values()].sort((a, b) => (a.dig < b.dig ? -1 : a.dig > b.dig ? 1 : 0));
      for (const nf of lista) {
        const u = Math.min(nf.qtd, resta);
        if (u > 0) { addAloc(fil, loc, prod, pc, nf.dig, u, i); resta -= u; }
      }
    }
    if (resta > 1e-9) {
      // sem NF (ou NF não cobre tudo): data de entrega prevista; se for absurda (< 2020), a emissão
      let d = serialParaIso(r[PD.ent]);
      if (!d || d < "2020") d = serialParaIso(r[PD.emi]);
      if (d) addAloc(fil, loc, prod, pc, d, resta, i);
    }
  }
  const consumo_mensal = [...consumo.values()].map((c) => ({ ...c, qtd: Math.round(c.qtd * 1e6) / 1e6 }));
  for (const [k, u] of ultRec) {
    const [produto, filial, local] = k.split("|");
    ultRecOut.push({ produto, filial, local, data: u.d, pc: u.pc });
  }

  // ---------- Armazéns = armazéns do arquivo de custo + armazéns com consumo
  for (const c of consumo.values()) {
    if (c.local === "0000") continue;
    const k = c.filial + "|" + c.local;
    if (!nomesArm.has(k)) nomesArm.set(k, "");
  }
  const armazens: SpecArmazem[] = [...nomesArm.entries()]
    .map(([k, nome]) => { const [filial, local] = k.split("|"); return { filial, local, nome }; })
    .sort((a, b) => (a.filial + a.local < b.filial + b.local ? -1 : 1));

  // ---------- Lead time: um registro por item de pedido com NF (menor data de digitação)
  log("Calculando lead time...");
  const lead = new Map<string, SpecLeadTime>();
  for (let i = 0; i < mapaRows.length; i++) {
    const m = mapaRows[i];
    if (!s(m[MP.nf])) continue;
    const dig = ymd(m[MP.dig]);
    const prod = s(m[MP.prod]);
    const emi = serialParaIso(m[MP.emi]);
    if (!dig || !emi || !ehProd.has(prod)) continue;
    const k = s(m[MP.fil]) + "|" + s(m[MP.pc]) + "|" + s(m[MP.item]);
    const a = lead.get(k);
    if (!a) lead.set(k, { produto: prod, filial: s(m[MP.fil]), pc: s(m[MP.pc]), item: s(m[MP.item]), emissao: emi, nf_digitacao: dig });
    else if (dig < a.nf_digitacao) a.nf_digitacao = dig;
  }

  // ---------- PCs abertos e último preço
  log("Calculando PCs abertos e preços...");
  const pcs_abertos: SpecPcAberto[] = [];
  const melhorPreco = new Map<string, { k: (string | number)[]; reg: SpecUltimoPreco }>();
  for (let i = 0; i < ped.length; i++) {
    const r = ped[i];
    if (s(r[PD.ctl]) !== "L") continue;
    const prod = s(r[PD.prod]);
    const prodOk = ehProd.has(prod);
    if (!prodOk && !ehServ.has(prod)) continue;
    const emi = serialParaIso(r[PD.emi]);
    if (emi) {
      const k = [emi, serialParaIso(r[PD.ent]) ?? "", s(r[PD.item]), s(r[PD.pc])];
      const a = melhorPreco.get(prod);
      let troca = !a;
      if (a) for (let z = 0; z < 4; z++) { if (k[z] !== a.k[z]) { troca = k[z] > a.k[z]; break; } if (z === 3) troca = true; }
      if (troca) melhorPreco.set(prod, { k, reg: { produto: prod, preco: num(r[PD.preco]), data: emi, pc: s(r[PD.pc]), filial: s(r[PD.fil]) } });
    }
    if (!prodOk || s(r[PD.res]) === "S") continue;
    const pend = num(r[PD.qtd]) - num(r[PD.entregue]);
    if (!(pend > 1e-9)) continue;
    pcs_abertos.push({
      produto: prod, filial: s(r[PD.filEnt]), local: s(r[PD.arm]), pc: s(r[PD.pc]), item: s(r[PD.item]), qtd_pendente: r2(pend),
      entrega_prevista: serialParaIso(r[PD.ent]), emissao: emi, fornecedor_nome: s(r[PD.razao]), projeto_nome: s(r[PD.nprj]),
    });
  }
  const ultimo_preco = [...melhorPreco.values()].map((x) => x.reg);

  // ---------- Fornecedores: PCs distintos aprovados por fornecedor + loja
  const forn = new Map<string, { reg: SpecFornecedor; pcs: Set<string> }>();
  for (const r of ped) {
    if (s(r[PD.ctl]) !== "L") continue;
    const k = s(r[PD.forn]) + "|" + s(r[PD.loja]);
    let e = forn.get(k);
    if (!e) forn.set(k, (e = { reg: { cod: s(r[PD.forn]), loja: s(r[PD.loja]), nome: s(r[PD.razao]), cnpj: s(r[PD.cnpj]), qtd_pedidos: 0 }, pcs: new Set() }));
    e.pcs.add(s(r[PD.pc]));
  }
  const fornecedores = [...forn.values()].map((e) => ({ ...e.reg, qtd_pedidos: e.pcs.size }));

  // ---------- SCs: abertas, projetos, centros de custo, domínios
  log("Processando SCs...");
  const scs_abertas: SpecScAberta[] = [];
  const projNomes = new Map<string, string>();
  const projLocais = new Map<string, SpecProjetoLocal>();
  const ccs = new Map<string, SpecCentroCusto>();
  const freq = { fin: new Map<string, number>(), mod: new Map<string, number>(), dem: new Map<string, number>() };
  const inc = (m: Map<string, number>, v: string) => { if (v) m.set(v, (m.get(v) ?? 0) + 1); };
  for (const r of tSc.linhas) {
    if (!s(r[SC.fil])) continue;
    inc(freq.fin, s(r[SC.fin])); inc(freq.mod, s(r[SC.mod])); inc(freq.dem, s(r[SC.dem]));
    if (s(r[SC.apr]) !== "L") continue;
    const fil = s(r[SC.fil]);
    const cc = s(r[SC.cc]);
    const prj = s(r[SC.prj]);
    if (cc) {
      const k = fil + "|" + cc;
      const e = ccs.get(k);
      if (e) e.qtd_itens++; else ccs.set(k, { filial: fil, cc, nome: s(r[SC.ncc]), qtd_itens: 1 });
      if (prj) {
        if (!projNomes.has(prj)) projNomes.set(prj, s(r[SC.nprj]));
        const kl = prj + "|" + fil + "|" + s(r[SC.loc]);
        const l = projLocais.get(kl);
        if (l) l.qtd_itens++; else projLocais.set(kl, { projeto: prj, filial: fil, local: s(r[SC.loc]), qtd_itens: 1 });
      }
    }
    const prod = s(r[SC.prod]);
    const pend = num(r[SC.pend]);
    if (!s(r[SC.ped]) && !s(r[SC.res]) && pend > 1e-9 && ehProd.has(prod)) {
      scs_abertas.push({
        produto: prod, filial: fil, local: s(r[SC.loc]), sc: s(r[SC.num]), item: s(r[SC.item]), qtd_pendente: r2(pend),
        emissao: serialParaIso(r[SC.emi]), necessidade: serialParaIso(r[SC.prf]), solicitante: s(r[SC.sol]),
        situacao: s(r[SC.sit]), projeto_nome: s(r[SC.nprj]),
      });
    }
  }
  const projetos: SpecProjeto[] = [...projNomes.entries()].map(([codigo, nome]) => ({ codigo, nome }));
  const ordFreq = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);

  const locais_entrega = tZzf.linhas
    .filter((r) => s(r[0]) || s(r[1]))
    .map((r) => ({
      ref: s(r[0]), filial: s(r[1]), cnpj: s(r[2]), local: sp(r[3]), descricao: sp(r[4]),
      projeto: s(r[5]), cc: s(r[6]), obs_entrega: sp(r[7]), cep: s(r[8]),
    }));

  return {
    meta: { gerado_em: new Date().toISOString(), base, meses },
    grupos, produtos, servicos, armazens, saldos, consumo_mensal,
    lead_time: [...lead.values()],
    ultimo_recebimento: ultRecOut,
    pcs_abertos, scs_abertas, ultimo_preco, projetos,
    projeto_locais: [...projLocais.values()],
    centros_custo_filial: [...ccs.values()],
    fornecedores, locais_entrega,
    dominios: { finalidades: ordFreq(freq.fin), modalidades: ordFreq(freq.mod), demandas: ordFreq(freq.dem) },
  };
}
