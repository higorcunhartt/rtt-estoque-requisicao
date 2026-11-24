import { authorized } from "@/lib/auth";
import { readDatasetText } from "@/lib/store";

export const maxDuration = 60;

export async function GET() {
  const { text, seed } = await readDatasetText();
  return new Response(text, {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-seed": seed ? "1" : "0" },
  });
}

/** Recebe dados prontos (formato interno ou do consultor), em JSON ou gzip. Usado pelo upload de Excel e pelo n8n. */
export async function PUT(req: Request) {
  if (!authorized(req)) return Response.json({ erro: "Não autorizado." }, { status: 401 });
  try {
    const { normalizeSource, parseBody, saveDataset } = await import("@/lib/refresh");
    const ds = normalizeSource(parseBody(Buffer.from(await req.arrayBuffer())));
    const origem = req.headers.get("x-origem") === "sistema" ? "sistema" : "excel";
    const st = await saveDataset(ds, origem, decodeURIComponent(req.headers.get("x-detalhe") || "") || undefined);
    return Response.json(st);
  } catch (e) {
    return Response.json({ erro: e instanceof Error ? e.message : "Dados inválidos." }, { status: 400 });
  }
}
