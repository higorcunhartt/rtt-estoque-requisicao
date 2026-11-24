/**
 * SpecDados: formato normalizado e legível (sem índices empacotados) que é o CONTRATO
 * entre a origem (planilhas Excel hoje, consulta SQL ao Protheus amanhã) e a aplicação.
 * Descrição completa em docs/especificacao_dados_consultor.md.
 *
 * Convenções: textos sem espaços nas pontas; códigos sempre string (zeros à esquerda);
 * datas "AAAA-MM-DD" (ou null); números como number.
 */

export interface SpecMeta {
  /** Data/hora da extração (ISO). */
  gerado_em: string;
  /** Data-base da extração, "AAAA-MM-DD". */
  base: string;
  /** Janela de consumo: os 22 meses fechados anteriores à base, "AAAA-MM", em ordem crescente. */
  meses: string[];
}

export interface SpecGrupo { grupo: string; descricao: string; movimenta_estoque: "S" | "N" }
export interface SpecProduto { cod: string; descricao: string; tipo: string; um: string; grupo: string }
export interface SpecServico { cod: string; descricao: string; um: string; grupo: string }
export interface SpecArmazem { filial: string; local: string; nome: string }
export interface SpecSaldo { filial: string; local: string; produto: string; qtd: number; valor: number; custo_medio: number }
export interface SpecConsumo { filial: string; local: string; produto: string; mes: string; qtd: number }
/** Um registro por item de pedido recebido (primeira digitação de NF). O lead time é derivado na montagem. */
export interface SpecLeadTime { produto: string; filial: string; pc: string; item: string; emissao: string; nf_digitacao: string }
/** Último recebimento por filial + armazém + produto (inclui armazém 0000). */
export interface SpecUltimoRecebimento { produto: string; filial: string; local: string; data: string; pc: string }
export interface SpecPcAberto {
  produto: string; filial: string; local: string; pc: string; item: string; qtd_pendente: number;
  entrega_prevista: string | null; emissao: string | null; fornecedor_nome: string; projeto_nome: string;
}
export interface SpecScAberta {
  produto: string; filial: string; local: string; sc: string; item: string; qtd_pendente: number;
  emissao: string | null; necessidade: string | null; solicitante: string; situacao: string; projeto_nome: string;
}
/** Último preço por produto OU serviço (um registro por código). */
export interface SpecUltimoPreco { produto: string; preco: number; data: string; pc: string; filial: string }
export interface SpecProjeto { codigo: string; nome: string }
export interface SpecProjetoLocal { projeto: string; filial: string; local: string; qtd_itens: number }
export interface SpecCentroCusto { filial: string; cc: string; nome: string; qtd_itens: number }
export interface SpecFornecedor { cod: string; loja: string; nome: string; cnpj: string; qtd_pedidos: number }
export interface SpecLocalEntrega {
  ref: string; filial: string; cnpj: string; local: string; descricao: string;
  projeto: string; cc: string; obs_entrega: string; cep: string;
}
export interface SpecDominios { finalidades: string[]; modalidades: string[]; demandas: string[] }

export interface SpecDados {
  meta: SpecMeta;
  grupos: SpecGrupo[];
  produtos: SpecProduto[];
  servicos: SpecServico[];
  armazens: SpecArmazem[];
  saldos: SpecSaldo[];
  consumo_mensal: SpecConsumo[];
  lead_time: SpecLeadTime[];
  ultimo_recebimento: SpecUltimoRecebimento[];
  pcs_abertos: SpecPcAberto[];
  scs_abertas: SpecScAberta[];
  ultimo_preco: SpecUltimoPreco[];
  projetos: SpecProjeto[];
  projeto_locais: SpecProjetoLocal[];
  centros_custo_filial: SpecCentroCusto[];
  fornecedores: SpecFornecedor[];
  locais_entrega: SpecLocalEntrega[];
  dominios: SpecDominios;
}

export const CONJUNTOS: (keyof SpecDados)[] = [
  "grupos", "produtos", "servicos", "armazens", "saldos", "consumo_mensal", "lead_time", "ultimo_recebimento",
  "pcs_abertos", "scs_abertas", "ultimo_preco", "projetos", "projeto_locais", "centros_custo_filial",
  "fornecedores", "locais_entrega",
];

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MES = /^\d{4}-\d{2}$/;

/** Campos obrigatórios por conjunto: [nome, tipo]. "d" = data AAAA-MM-DD, "n" = número, "s" = texto, "m" = mês. */
const CAMPOS: Record<string, [string, "s" | "n" | "d" | "m"][]> = {
  grupos: [["grupo", "s"], ["descricao", "s"], ["movimenta_estoque", "s"]],
  produtos: [["cod", "s"], ["descricao", "s"], ["tipo", "s"], ["um", "s"], ["grupo", "s"]],
  servicos: [["cod", "s"], ["descricao", "s"], ["um", "s"], ["grupo", "s"]],
  armazens: [["filial", "s"], ["local", "s"], ["nome", "s"]],
  saldos: [["filial", "s"], ["local", "s"], ["produto", "s"], ["qtd", "n"], ["valor", "n"], ["custo_medio", "n"]],
  consumo_mensal: [["filial", "s"], ["local", "s"], ["produto", "s"], ["mes", "m"], ["qtd", "n"]],
  lead_time: [["produto", "s"], ["filial", "s"], ["pc", "s"], ["item", "s"], ["emissao", "d"], ["nf_digitacao", "d"]],
  ultimo_recebimento: [["produto", "s"], ["filial", "s"], ["local", "s"], ["data", "d"], ["pc", "s"]],
  pcs_abertos: [["produto", "s"], ["filial", "s"], ["local", "s"], ["pc", "s"], ["item", "s"], ["qtd_pendente", "n"]],
  scs_abertas: [["produto", "s"], ["filial", "s"], ["local", "s"], ["sc", "s"], ["item", "s"], ["qtd_pendente", "n"]],
  ultimo_preco: [["produto", "s"], ["preco", "n"], ["data", "d"], ["pc", "s"], ["filial", "s"]],
  projetos: [["codigo", "s"], ["nome", "s"]],
  projeto_locais: [["projeto", "s"], ["filial", "s"], ["local", "s"], ["qtd_itens", "n"]],
  centros_custo_filial: [["filial", "s"], ["cc", "s"], ["nome", "s"], ["qtd_itens", "n"]],
  fornecedores: [["cod", "s"], ["loja", "s"], ["nome", "s"], ["cnpj", "s"], ["qtd_pedidos", "n"]],
  locais_entrega: [["ref", "s"], ["filial", "s"], ["cnpj", "s"], ["local", "s"], ["descricao", "s"], ["projeto", "s"], ["cc", "s"], ["obs_entrega", "s"], ["cep", "s"]],
};

export interface ResultadoValidacao { ok: boolean; erros: string[]; avisos: string[] }

/** Validação leve: estrutura, tipos dos campos, formatos de data/mês e integridade referencial básica. */
export function validateSpec(spec: unknown): ResultadoValidacao {
  const erros: string[] = [];
  const avisos: string[] = [];
  const MAX = 5; // erros detalhados por conjunto
  if (!spec || typeof spec !== "object") return { ok: false, erros: ["O conteúdo recebido não é um objeto JSON."], avisos };
  const s = spec as Record<string, unknown>;

  const meta = s.meta as Partial<SpecMeta> | undefined;
  if (!meta || typeof meta !== "object") erros.push('Falta o objeto "meta".');
  else {
    if (typeof meta.base !== "string" || !ISO.test(meta.base)) erros.push('meta.base deve ser uma data "AAAA-MM-DD".');
    if (!Array.isArray(meta.meses) || meta.meses.length === 0 || !meta.meses.every((m) => typeof m === "string" && MES.test(m)))
      erros.push('meta.meses deve ser uma lista de meses "AAAA-MM" (22 meses fechados antes da data-base).');
    else {
      if (meta.meses.length !== 22) avisos.push(`meta.meses tem ${meta.meses.length} meses (o esperado são 22).`);
      const ord = [...meta.meses].sort();
      if (ord.join() !== meta.meses.join()) erros.push("meta.meses deve estar em ordem crescente.");
    }
    if (typeof meta.gerado_em !== "string") avisos.push("meta.gerado_em ausente (data/hora da extração).");
  }

  for (const nome of CONJUNTOS) {
    const arr = s[nome];
    if (!Array.isArray(arr)) { erros.push(`O conjunto "${nome}" está ausente ou não é uma lista.`); continue; }
    if (arr.length === 0 && nome !== "scs_abertas" && nome !== "pcs_abertos") avisos.push(`O conjunto "${nome}" está vazio.`);
    let nErr = 0;
    for (let i = 0; i < arr.length && nErr < MAX; i++) {
      const reg = arr[i] as Record<string, unknown>;
      if (!reg || typeof reg !== "object") { erros.push(`${nome}[${i}]: registro inválido.`); nErr++; continue; }
      for (const [campo, tipo] of CAMPOS[nome]) {
        const v = reg[campo];
        let ok = true;
        if (tipo === "s") ok = typeof v === "string";
        else if (tipo === "n") ok = typeof v === "number" && Number.isFinite(v);
        else if (tipo === "d") ok = typeof v === "string" && ISO.test(v);
        else ok = typeof v === "string" && MES.test(v);
        if (!ok) {
          const esperado = { s: "texto", n: "número", d: 'data "AAAA-MM-DD"', m: 'mês "AAAA-MM"' }[tipo];
          erros.push(`${nome}[${i}].${campo}: esperado ${esperado}, recebido ${JSON.stringify(v)}.`);
          nErr++;
          if (nErr >= MAX) break;
        }
      }
    }
    if (nErr >= MAX) erros.push(`${nome}: há mais erros além dos ${MAX} mostrados.`);
  }

  const dom = s.dominios as Partial<SpecDominios> | undefined;
  if (!dom || typeof dom !== "object") erros.push('Falta o objeto "dominios".');
  else for (const k of ["finalidades", "modalidades", "demandas"] as const)
    if (!Array.isArray(dom[k]) || !dom[k]!.every((x) => typeof x === "string")) erros.push(`dominios.${k} deve ser uma lista de textos.`);

  // Integridade referencial (só se a estrutura básica estiver ok)
  if (erros.length === 0) {
    const sp = s as unknown as SpecDados;
    const cods = new Set(sp.produtos.map((p) => p.cod));
    if (cods.size !== sp.produtos.length) erros.push("produtos: há códigos duplicados.");
    const grupos = new Set(sp.grupos.map((g) => g.grupo));
    const semGrupo = sp.produtos.filter((p) => !grupos.has(p.grupo)).length;
    if (semGrupo) avisos.push(`${semGrupo} produto(s) com grupo inexistente em "grupos".`);
    const meses = new Set(sp.meta.meses);
    const foraJanela = sp.consumo_mensal.filter((c) => !meses.has(c.mes)).length;
    if (foraJanela) erros.push(`consumo_mensal: ${foraJanela} registro(s) com mês fora da janela meta.meses.`);
    const semProd = (nome: string, lista: { produto: string }[]) => {
      const n = lista.filter((r) => !cods.has(r.produto)).length;
      if (n) avisos.push(`${nome}: ${n} registro(s) de produto que não consta em "produtos" (serão ignorados na montagem).`);
    };
    semProd("saldos", sp.saldos); semProd("consumo_mensal", sp.consumo_mensal); semProd("pcs_abertos", sp.pcs_abertos);
    semProd("scs_abertas", sp.scs_abertas); semProd("lead_time", sp.lead_time); semProd("ultimo_recebimento", sp.ultimo_recebimento);
  }
  return { ok: erros.length === 0, erros, avisos };
}

/** Lança Error com todas as mensagens em português se a spec for inválida. */
export function assertSpec(spec: unknown): asserts spec is SpecDados {
  const r = validateSpec(spec);
  if (!r.ok) throw new Error("Spec de dados inválida:\n- " + r.erros.join("\n- "));
}
