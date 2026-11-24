export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "cross-origin-resource-policy": "same-origin",
      "referrer-policy": "no-referrer",
      ...headers,
    },
  });
}

export async function readJson(req: Request, maxChars = 20_000): Promise<Record<string, unknown>> {
  if (!(req.headers.get("content-type") || "").includes("application/json")) {
    throw new HttpError(415, "Content-Type deve ser application/json");
  }
  const text = await req.text();
  if (text.length > maxChars) throw new HttpError(413, "Corpo da requisição muito grande");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new HttpError(400, "JSON inválido");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "JSON inválido");
  return value as Record<string, unknown>;
}

/** Defesa extra contra CSRF (além de SameSite=Strict): requisições que alteram algo precisam vir do próprio site. */
export function sameOrigin(req: Request): void {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  if (!origin) return; // clientes que não são navegador (n8n, agendador) não enviam Origin
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  let ok = false;
  try {
    ok = new URL(origin).host === host;
  } catch {
    ok = false;
  }
  if (!ok) throw new HttpError(403, "Origem não permitida");
}

/** Converte exceções em resposta JSON sem vazar detalhes internos. */
export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      sameOrigin(req);
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ erro: e.message, codigo: e.code }, e.status);
      console.error("Erro na rota:", e);
      return json({ erro: "Erro interno. Tente novamente." }, 500);
    }
  };
}
