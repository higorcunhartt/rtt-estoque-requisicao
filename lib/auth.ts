import { timingSafeEqual } from "node:crypto";

const eq = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function tokenFrom(req: Request): string {
  const h = req.headers.get("authorization");
  if (h?.toLowerCase().startsWith("bearer ")) return h.slice(7).trim();
  return (req.headers.get("x-admin-token") || "").trim();
}

/** Quem pode gravar dados: o token do administrador (interface) ou o segredo do agendador. */
export function authorized(req: Request): boolean {
  const admin = process.env.ADMIN_TOKEN, cron = process.env.CRON_SECRET;
  if (!admin && !cron) return process.env.NODE_ENV !== "production"; // em produção, sem token configurado, nega
  const t = tokenFrom(req);
  return !!t && ((!!admin && eq(t, admin)) || (!!cron && eq(t, cron)));
}
