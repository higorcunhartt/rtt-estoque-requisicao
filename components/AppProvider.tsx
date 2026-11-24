"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { Dataset } from "@/lib/types";
import { DEFAULT_SETTINGS, buildModel, computeAll, sanitizeSettings, type Calc, type Model, type Settings } from "@/lib/calc";
import { EMPTY_CART, type Att, type Cart } from "@/lib/cart";

export interface StatusInfo {
  atualizadoEm: string | null;
  origem: string | null;
  detalhe?: string;
  erro?: string;
  emAndamento?: boolean;
  config?: { sistema: boolean; protegido: boolean; agenda: string };
}

/** Estado do formulário de requisição (mantido ao trocar de aba). */
export interface ReqState {
  mode: "mat" | "srv";
  f: string;
  a: number | null;
  p: number | null;
  sp: number | null;
  q: string;
  d: string;
}
const EMPTY_REQ: ReqState = { mode: "mat", f: "", a: null, p: null, sp: null, q: "", d: "" };

interface Ctx {
  R: ReqState;
  setR: Dispatch<SetStateAction<ReqState>>;
  ds: Dataset | null;
  model: Model | null;
  RES: Calc[];
  loadError: string;
  status: StatusInfo | null;
  S: Settings;
  setS: (p: Partial<Settings>) => void;
  PJ: string;
  setPJ: (v: string) => void;
  cart: Cart;
  setCart: Dispatch<SetStateAction<Cart>>;
  atts: Att[];
  setAtts: Dispatch<SetStateAction<Att[]>>;
  toast: (msg: string) => void;
  toastMsg: string;
  applyDataset: (ds: Dataset) => void;
  reloadData: () => Promise<void>;
  refreshStatus: () => Promise<StatusInfo | null>;
  panelOpen: boolean;
  setPanelOpen: (v: boolean) => void;
}

const C = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(C);
  if (!c) throw new Error("useApp fora do AppProvider");
  return c;
};

const lsGet = (k: string) => {
  try { return localStorage.getItem(k); } catch { return null; }
};
const lsSet = (k: string, v: string) => {
  try { localStorage.setItem(k, v); } catch { /* ignora */ }
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [ds, setDs] = useState<Dataset | null>(null);
  const [loadError, setLoadError] = useState("");
  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [S, setSState] = useState<Settings>(DEFAULT_SETTINGS);
  const [PJ, setPJState] = useState("");
  const [cart, setCart] = useState<Cart>(EMPTY_CART);
  const [atts, setAtts] = useState<Att[]>([]);
  const [R, setR] = useState<ReqState>(EMPTY_REQ);
  const [toastMsg, setToastMsg] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const hydrated = useRef(false);
  const tt = useRef<ReturnType<typeof setTimeout> | null>(null);

  // preferências salvas no navegador
  useEffect(() => {
    try { setSState(sanitizeSettings(JSON.parse(lsGet("rtt-param2") || "{}"))); } catch { /* padrão */ }
    setPJState(lsGet("rtt-prj") || "");
    try {
      const c = JSON.parse(lsGet("rtt-cart2") || "null");
      if (c && Array.isArray(c.items)) setCart(c);
    } catch { /* vazio */ }
    hydrated.current = true;
  }, []);
  useEffect(() => { if (hydrated.current) lsSet("rtt-cart2", JSON.stringify(cart)); }, [cart]);

  const setS = useCallback((p: Partial<Settings>) => {
    setSState((s) => {
      const n = sanitizeSettings({ ...s, ...p });
      lsSet("rtt-param2", JSON.stringify(n));
      return n;
    });
  }, []);
  const setPJ = useCallback((v: string) => { setPJState(v); lsSet("rtt-prj", v); }, []);

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    if (tt.current) clearTimeout(tt.current);
    tt.current = setTimeout(() => setToastMsg(""), 3200);
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/status", { cache: "no-store" });
      const j = (await r.json()) as StatusInfo;
      setStatus(j);
      return j;
    } catch { return null; }
  }, []);

  const reloadData = useCallback(async () => {
    try {
      setLoadError("");
      const r = await fetch("/api/dados", { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      setDs((await r.json()) as Dataset);
    } catch (e) {
      setLoadError("Não foi possível carregar os dados. " + (e instanceof Error ? e.message : ""));
    }
    await refreshStatus();
  }, [refreshStatus]);

  useEffect(() => { void reloadData(); }, [reloadData]);

  const applyDataset = useCallback((d: Dataset) => setDs(d), []);

  const model = useMemo(() => (ds ? buildModel(ds) : null), [ds]);
  const RES = useMemo(() => (model ? computeAll(model, S) : []), [model, S]);

  // projeto salvo que não existe mais na base atual
  useEffect(() => {
    if (model && PJ && !model.prjBy.has(PJ)) setPJ("");
  }, [model, PJ, setPJ]);

  const value: Ctx = { R, setR, ds, model, RES, loadError, status, S, setS, PJ, setPJ, cart, setCart, atts, setAtts, toast, toastMsg, applyDataset, reloadData, refreshStatus, panelOpen, setPanelOpen };
  return <C.Provider value={value}>{children}</C.Provider>;
}
