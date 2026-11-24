import { gunzipSync } from "node:zlib";
import type { Dataset } from "./types";
import { assemble, validateSpec, type SpecDados } from "./etl";
import { readStatus, writeDatasetText, writeStatus, type StatusFull } from "./store";

/** Aceita o formato interno (Dataset) ou o formato normalizado do consultor (SpecDados). */
export function normalizeSource(json: unknown): Dataset {
  const o = json as Record<string, unknown>;
  if (o && Array.isArray(o.rows) && Array.isArray(o.alm) && Array.isArray(o.prod)) {
    return o as unknown as Dataset;
  }
  const v = validateSpec(json);
  if (!v.ok) throw new Error("Dados inválidos: " + v.erros.slice(0, 5).join(" | "));
  return assemble(json as SpecDados);
}

/** Interpreta bytes recebidos (JSON puro ou gzip). */
export function parseBody(buf: Buffer): unknown {
  const raw = buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf;
  return JSON.parse(raw.toString("utf8"));
}

export async function saveDataset(ds: Dataset, origem: StatusFull["origem"], detalhe?: string): Promise<StatusFull> {
  if (!ds.meta) throw new Error("Dados sem o bloco 'meta'.");
  ds.meta.geradoEm = new Date().toISOString();
  await writeDatasetText(JSON.stringify(ds));
  const st: StatusFull = { atualizadoEm: new Date().toISOString(), origem, detalhe, linhas: ds.rows.length };
  await writeStatus(st);
  return st;
}

export const sourceConfigured = () => !!process.env.SOURCE_URL;

/** Busca os dados no sistema (consulta do consultor / fluxo n8n) e grava. */
export async function refreshFromSource(origem: "sistema" | "agendado"): Promise<StatusFull> {
  const url = process.env.SOURCE_URL;
  if (!url) throw new Error("Fonte do sistema não configurada (variável SOURCE_URL).");
  const prev = await readStatus();
  await writeStatus({ ...prev, emAndamento: true, iniciadoEm: new Date().toISOString() });
  try {
    const headers: Record<string, string> = { accept: "application/json" };
    if (process.env.SOURCE_TOKEN) headers.authorization = `Bearer ${process.env.SOURCE_TOKEN}`;
    const res = await fetch(url, { method: process.env.SOURCE_METHOD || "GET", headers, cache: "no-store" });
    if (!res.ok) throw new Error(`A fonte respondeu HTTP ${res.status}.`);
    const ds = normalizeSource(parseBody(Buffer.from(await res.arrayBuffer())));
    return await saveDataset(ds, origem, new URL(url).host);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await writeStatus({ ...prev, emAndamento: false, erro: msg });
    throw e;
  }
}
