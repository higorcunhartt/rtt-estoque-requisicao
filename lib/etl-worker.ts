/// <reference lib="webworker" />
import { buildFromExcel } from "./etl";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<Record<string, ArrayBuffer>>) => {
  try {
    const f = e.data;
    const ds = buildFromExcel({ scs: f.scs, estoque: f.estoque, pedidos: f.pedidos, zzf: f.zzf, mapa: f.mapa });
    ctx.postMessage({ ok: true, ds });
  } catch (err) {
    ctx.postMessage({ ok: false, erro: err instanceof Error ? err.message : String(err) });
  }
};
