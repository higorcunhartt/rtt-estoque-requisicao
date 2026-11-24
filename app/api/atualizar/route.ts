import { handle, json } from "@/lib/server/http";
import { requireWriter } from "@/lib/server/session";
import { refreshFromSource, sourceConfigured } from "@/lib/refresh";
import { readStatus, writeStatus } from "@/lib/store";

export const maxDuration = 60;

/** Botão "Atualizar do sistema": busca os dados na fonte configurada (SOURCE_URL). Só administrador logado ou token. */
export const POST = handle(async (req: Request) => {
  await requireWriter(req);
  if (!sourceConfigured()) {
    return json({ erro: "A fonte de dados do sistema ainda não foi configurada (SOURCE_URL). Use a atualização por Excel enquanto isso." }, 409);
  }
  // Na Netlify o trabalho roda em função em segundo plano (até 15 min); o painel acompanha pelo /api/status.
  const bg = process.env.URL && process.env.NETLIFY && process.env.CRON_SECRET;
  if (bg) {
    const prev = await readStatus();
    await writeStatus({ ...prev, emAndamento: true, iniciadoEm: new Date().toISOString(), erro: undefined });
    await fetch(`${process.env.URL}/.netlify/functions/atualizar-background`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}`, "x-origem": "sistema" },
    });
    return json({ emAndamento: true }, 202);
  }
  try {
    return json(await refreshFromSource("sistema"));
  } catch (e) {
    return json({ erro: e instanceof Error ? e.message : "Falha ao atualizar." }, 502);
  }
});
