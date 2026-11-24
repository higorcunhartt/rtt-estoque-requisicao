// Função em segundo plano (sufixo -background): até 15 min de execução. Busca os dados no sistema e grava no Netlify Blobs.
import { authorized } from "../../lib/auth";
import { refreshFromSource } from "../../lib/refresh";

export default async (req: Request) => {
  if (!authorized(req)) return new Response("Não autorizado", { status: 401 });
  try {
    await refreshFromSource(req.headers.get("x-origem") === "sistema" ? "sistema" : "agendado");
  } catch (e) {
    console.error("Falha na atualização:", e);
  }
};
