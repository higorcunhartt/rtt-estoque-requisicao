/**
 * Formato interno dos dados ("D"): o mesmo JSON que estava embutido no HTML original.
 * Os arrays são "empacotados" por índice para manter o arquivo leve:
 *   - `alm[i]`  = armazém i; `prod[i]` = produto i; `rows[]` referencia esses índices.
 *   - `pcs` e `scs` são indexados pelo índice do produto (como string).
 * Todas as séries mensais (`dem`, `demf`, `demp`) têm um valor por mês de `meta.months`.
 */
export type Alm = [filial: string, local: string, nome: string];
export type Prod = [cod: string, descricao: string, um: string, grupo: string, tipo: string];
/** [almIdx, prodIdx, saldo (B2_QATU), valor (B2_VATU1), custoMedio (B2_CM1), consumoMensal[]] */
export type Row = [number, number, number, number, number, number[]];
/** [filial, local, pc, item, qtdPendente, entregaPrevista, fornecedor, emissao, projeto] */
export type PcItem = [string, string, string, string, number, string, string, string, string];
/** [filial, local, sc, item, qtdPendente, emissao, necessidade, solicitante, situacao, projeto] */
export type ScItem = [string, string, string, string, number, string, string, string, string, string];
export type Preco = [preco: number, data: string, pc: string, filial: string];
export type ProjetoLoc = [filial: string, local: string, qtdItens: number];
/** [codigo, nome, locais, totalItens] */
export type Projeto = [string, string, ProjetoLoc[], number];
/** [cod, loja, nome, cnpj, qtdPedidos] */
export type Fornecedor = [string, string, string, string, number];
/** [ref, filial, cnpj, local, descricao, projeto, cc, obsEntrega, cep] */
export type Zzf = [string, string, string, string, string, string, string, string, string];

export interface Dataset {
  meta: { base: string; months: string[]; ltglob: number; geradoEm?: string };
  alm: Alm[];
  prod: Prod[];
  grp: Record<string, string>;
  rows: Row[];
  pcs: Record<string, PcItem[]>;
  scs: Record<string, ScItem[]>;
  /** lead time por produto: [dias, nPedidos] */
  ltp: Record<string, [number, number]>;
  /** lead time por "prodIdx|filial" */
  ltpf: Record<string, [number, number]>;
  /** lead time por grupo */
  ltg: Record<string, [number, number]>;
  /** consumo mensal por "prodIdx|filial" */
  demf: Record<string, number[]>;
  /** consumo mensal por produto (todas as filiais) */
  demp: Record<string, number[]>;
  /** último recebimento por "prodIdx|filial|local": [data, "PC n"] */
  lasta: Record<string, [string, string]>;
  /** último recebimento por produto: [data, filial, "PC n"] */
  lastp: Record<string, [string, string, string]>;
  ccf: Record<string, [string, string, number][]>;
  prjf: Record<string, [string, string, number][]>;
  lpc: Record<string, Preco>;
  fins: string[];
  mods: string[];
  dems: string[];
  /** serviços: [cod, descricao, um, grupo] */
  serv: [string, string, string, string][];
  /** último preço por índice de serviço */
  lps: Record<string, Preco>;
  proj: Projeto[];
  forn: Fornecedor[];
  zzf: Zzf[];
}

export interface Status {
  atualizadoEm: string | null;
  origem: "seed" | "excel" | "sistema" | "agendado" | null;
  detalhe?: string;
  linhas?: number;
  erro?: string;
}
