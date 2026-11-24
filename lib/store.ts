import { promises as fs } from "node:fs";
import path from "node:path";
import { getStore } from "@netlify/blobs";
import type { Status } from "./types";

/**
 * Armazenamento dos dados atuais.
 *  - Na Netlify: Netlify Blobs (persistente, compartilhado entre funções).
 *  - Local: pasta `.data/` (ignorada pelo git).
 *  - Sem nada gravado ainda: cai no `data/seed.json` (dados de 03/11/2026 vindos do HTML original).
 */
const onNetlify = () => !!process.env.NETLIFY || !!process.env.NETLIFY_BLOBS_CONTEXT || !!process.env.DEPLOY_ID;
const LOCAL_DIR = path.join(process.cwd(), ".data");
const blobs = () => getStore({ name: "rtt-estoque" });

/** O Blobs pode demorar ou travar fora do contexto esperado: nunca deixa a rota esperar mais que `ms`. */
const limite = <T,>(p: Promise<T>, ms = 4000): Promise<T> =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Blobs demorou demais")), ms))]);

export async function readDatasetText(): Promise<{ text: string; seed: boolean }> {
  try {
    if (onNetlify()) {
      const t = await limite(blobs().get("dataset.json", { type: "text" }), 8000);
      if (t) return { text: t, seed: false };
    } else {
      return { text: await fs.readFile(path.join(LOCAL_DIR, "dataset.json"), "utf8"), seed: false };
    }
  } catch {
    /* sem dados gravados: usa a semente */
  }
  return { text: await fs.readFile(path.join(process.cwd(), "data", "seed.json"), "utf8"), seed: true };
}

export async function writeDatasetText(text: string): Promise<void> {
  if (onNetlify()) {
    await limite(blobs().set("dataset.json", text), 20000);
    return;
  }
  await fs.mkdir(LOCAL_DIR, { recursive: true });
  await fs.writeFile(path.join(LOCAL_DIR, "dataset.json"), text, "utf8");
}

export interface StatusFull extends Status {
  emAndamento?: boolean;
  iniciadoEm?: string;
}

const SEED_STATUS: StatusFull = { atualizadoEm: "2026-11-03T06:00:00-03:00", origem: "seed", detalhe: "Dados iniciais do HTML original (base de 03/11/2026)" };

export async function readStatus(): Promise<StatusFull> {
  try {
    if (onNetlify()) {
      const t = await limite(blobs().get("status.json", { type: "json" }));
      if (t) return t as StatusFull;
    } else {
      return JSON.parse(await fs.readFile(path.join(LOCAL_DIR, "status.json"), "utf8"));
    }
  } catch {
    /* ignora */
  }
  return SEED_STATUS;
}

export async function writeStatus(s: StatusFull): Promise<void> {
  if (onNetlify()) {
    await limite(blobs().setJSON("status.json", s));
    return;
  }
  await fs.mkdir(LOCAL_DIR, { recursive: true });
  await fs.writeFile(path.join(LOCAL_DIR, "status.json"), JSON.stringify(s), "utf8");
}
