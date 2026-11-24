import { handle, json } from "@/lib/server/http";
import { requireUser, requireWriter } from "@/lib/server/session";
import { readDatasetText } from "@/lib/store";

export const maxDuration = 60;

/** Os dados são internos da empresa: só com sessão válida. */
export const GET = handle(async (req: Request) => {
  await requireUser(req);
  const { text, seed } = await readDatasetText();
  return new Response(text, {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-seed": seed ? "1" : "0" },
  });
});

/** Recebe dados prontos (formato interno ou do consultor), em JSON ou gzip. Administrador logado (upload de Excel) ou token (n8n). */
export const PUT = handle(async (req: Request) => {
  await requireWriter(req);
  try {
    const { normalizeSource, parseBody, saveDataset } = await import("@/lib/refresh");
    const ds = normalizeSource(parseBody(Buffer.from(await req.arrayBuffer())));
    const origem = req.headers.get("x-origem") === "sistema" ? "sistema" : "excel";
    const st = await saveDataset(ds, origem, decodeURIComponent(req.headers.get("x-detalhe") || "") || undefined);
    return json(st);
  } catch (e) {
    return json({ erro: e instanceof Error ? e.message : "Dados inválidos." }, 400);
  }
});
