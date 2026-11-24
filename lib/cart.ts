/** Tipos da SC em montagem (carrinho). Persistida em localStorage. */
export interface CartHead {
  pj?: string; // projeto (código)
  cc?: string; // centro de custo
  fin?: string;
  dem?: string;
  mod?: string;
  forn?: string; // código-loja (modalidade Direta)
  local?: string; // código ZZF
  localZ?: number | null;
  xobs1?: string; // motivo da SC
}

export interface CartItem {
  key: string;
  srv?: boolean;
  a?: number; // índice do armazém
  f: string;
  l: string;
  an: string;
  p?: number; // índice do produto
  sp?: number; // índice do serviço
  c: string;
  d: string;
  u: string;
  q: number;
  need: string; // data de necessidade
  local: string;
  preco: number;
  xobs2: string;
  special: boolean;
  just: string;
  exc?: number;
  // análise de estoque (itens de material)
  win?: number; cobm?: number; abatOn?: number;
  cmm?: number; cmd?: number; tot?: number; es?: number; pp?: number; mx?: number; pos?: number;
  esL?: string; trig?: number;
  memo?: [string, string, string][];
  saldo?: number; othSaldo?: number; othDisp?: number;
  othList?: [string, number, number, number][];
  pc?: number; sc?: number; prev?: number; cobAt?: number | null; lt?: number; ltsrc?: string;
  pcList?: [string, string, number, string][];
  scList?: [string, string, number, string][];
  otherF?: number;
}

export interface Cart {
  f: string;
  items: CartItem[];
  head: CartHead;
  done: { num: string; at: string } | null;
}

export const EMPTY_CART: Cart = { f: "", items: [], head: {}, done: null };

export interface Att {
  name: string;
  size: number;
  type: string;
  url: string | null;
}
