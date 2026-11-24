// Agendador: dispara a atualização nos horários abaixo (cron em UTC; BRT = UTC-3).
// 10:00, 15:00 e 20:00 UTC = 07:00, 12:00 e 17:00 em Brasília, de segunda a sábado.
import type { Config } from "@netlify/functions";

export default async () => {
  const base = process.env.URL;
  if (!base || !process.env.CRON_SECRET || !process.env.SOURCE_URL) {
    console.log("Agenda ignorada: defina URL, CRON_SECRET e SOURCE_URL.");
    return;
  }
  const r = await fetch(`${base}/.netlify/functions/atualizar-background`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}`, "x-origem": "agendado" },
  });
  console.log("Atualização agendada disparada:", r.status);
};

export const config: Config = { schedule: "0 10,15,20 * * 1-6" };
