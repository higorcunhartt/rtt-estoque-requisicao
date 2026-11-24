import { sql } from "./db";

/**
 * IP do cliente. Na Netlify, `x-nf-client-connection-ip` não é forjável pelo cliente;
 * o fallback para `x-forwarded-for` serve só para desenvolvimento local e testes.
 */
export function clientIp(req: Request): string {
  return (
    req.headers.get("x-nf-client-connection-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "unknown"
  );
}

/** Registra uma tentativa e devolve o total na janela atual (um único upsert, logo atômico). */
export async function hit(key: string, windowSeconds: number): Promise<number> {
  const interval = `${Math.floor(windowSeconds)} seconds`;
  const [r] = await sql`
    insert into rate_limits (key, count, reset_at)
    values (${key}, 1, now() + ${interval}::interval)
    on conflict (key) do update set
      count = case when rate_limits.reset_at <= now() then 1 else rate_limits.count + 1 end,
      reset_at = case when rate_limits.reset_at <= now() then now() + ${interval}::interval else rate_limits.reset_at end
    returning count`;
  return r.count;
}

export async function refund(key: string): Promise<void> {
  await sql`update rate_limits set count = greatest(count - 1, 0) where key = ${key}`;
}

export async function clearKey(key: string): Promise<void> {
  await sql`delete from rate_limits where key = ${key}`;
}

export async function purgeExpired(): Promise<void> {
  await sql`delete from rate_limits where reset_at < now() - interval '1 day'`;
}
