import type { Dataset } from "./types";

export const SLOTS = [
  { key: "scs", label: "Base de SCs", dica: "BASE DE SCs…xlsx (aba RTT_SC1010)", re: /\bscs?\b/i },
  { key: "estoque", label: "Base de estoque", dica: "BaseDadosEstoque…xlsx (produtos, grupos e saldos)", re: /estoque/i },
  { key: "pedidos", label: "Pedidos emitidos", dica: "PEDIDOS EMITIDOS…xlsx", re: /pedidos/i },
  { key: "mapa", label: "Mapa de pedido de compra", dica: "COM_001_MAPA_PEDIDO_COMPRA…xlsx", re: /mapa/i },
  { key: "zzf", label: "Locais de entrega (ZZF)", dica: "TabelaZZF_LocaisEntrega…xlsx", re: /zzf|locais/i },
] as const;
export type SlotKey = (typeof SLOTS)[number]["key"];
export type SlotFiles = Partial<Record<SlotKey, File>>;

/** Descobre a que planilha cada arquivo corresponde, pelo nome. */
export function detectSlot(name: string): SlotKey | null {
  // ordem importa: "pedidos" e "mapa" antes de "scs" para não confundir
  for (const k of ["mapa", "pedidos", "zzf", "estoque", "scs"] as SlotKey[]) {
    const s = SLOTS.find((x) => x.key === k)!;
    if (s.re.test(name)) return k;
  }
  return null;
}

const ADMIN_KEY = "rtt-admin";
export const getAdminToken = () => {
  try { return localStorage.getItem(ADMIN_KEY) || ""; } catch { return ""; }
};
export const setAdminToken = (v: string) => {
  try { localStorage.setItem(ADMIN_KEY, v); } catch { /* ignora */ }
};
const authHeaders = (): Record<string, string> => {
  const t = getAdminToken();
  return t ? { "x-admin-token": t } : {};
};

async function gzip(text: string): Promise<ArrayBuffer> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

/** Publica os dados no servidor (todos os usuários passam a ver). */
export async function publishDataset(ds: Dataset, origem: "excel" | "sistema", detalhe: string) {
  const body = await gzip(JSON.stringify(ds));
  const r = await fetch("/api/dados", {
    method: "PUT",
    headers: { ...authHeaders(), "x-origem": origem, "x-detalhe": encodeURIComponent(detalhe), "content-type": "application/octet-stream" },
    body,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || `Falha ao publicar (HTTP ${r.status}).`);
}

/** Aciona a busca no sistema (consulta do ERP). */
export async function triggerSystemRefresh(): Promise<{ emAndamento?: boolean }> {
  const r = await fetch("/api/atualizar", { method: "POST", headers: authHeaders() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || `Falha ao atualizar (HTTP ${r.status}).`);
  return j;
}

/** Lê os Excel e monta o dataset em um Web Worker (não trava a tela). */
export function processExcel(files: SlotFiles, onStage: (s: string) => void): Promise<Dataset> {
  return new Promise(async (resolve, reject) => {
    try {
      onStage("Lendo os arquivos…");
      const buffers: Record<string, ArrayBuffer> = {};
      for (const s of SLOTS) {
        const f = files[s.key];
        if (!f) throw new Error(`Falta o arquivo: ${s.label}.`);
        buffers[s.key] = await f.arrayBuffer();
      }
      onStage("Processando as planilhas (pode levar alguns segundos)…");
      const w = new Worker(new URL("./etl-worker.ts", import.meta.url));
      w.onmessage = (e: MessageEvent<{ ok: boolean; ds?: Dataset; erro?: string }>) => {
        w.terminate();
        if (e.data.ok && e.data.ds) resolve(e.data.ds);
        else reject(new Error(e.data.erro || "Falha ao processar as planilhas."));
      };
      w.onerror = (e) => { w.terminate(); reject(new Error(e.message || "Erro no processamento.")); };
      w.postMessage(buffers, Object.values(buffers));
    } catch (e) {
      reject(e);
    }
  });
}
