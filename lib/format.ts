export const nf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
export const nf0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
export const nf2 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
export const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
export const brl2 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmt = (v: number | null | undefined) => (v == null ? "—" : nf.format(v));
export const fmt0 = (v: number | null | undefined) => (v == null ? "—" : nf0.format(v));

export const MN = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-11-03" -> "03/11/2026"; datas vazias ou 1900 viram "—" */
export const dbr = (s: string | null | undefined) => {
  if (!s || s.startsWith("1900")) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
};

export const mes = (n: number) => (n === 1 ? "1 mês" : n + " meses");

export const fmtSize = (b: number) =>
  b < 1024 ? b + " B" : b < 1048576 ? nf.format(b / 1024) + " KB" : nf.format(b / 1048576) + " MB";

export const fmtCNPJ = (c: string) =>
  /^\d{14}$/.test(c) ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c || "—";

/** "dd/mm/aaaa" -> Date ao meio-dia */
export const parseBase = (s: string) => {
  const [d, m, y] = s.split("/").map(Number);
  return new Date(y, m - 1, d, 12);
};

export const isoDate = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const fmtDateTime = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(+d)) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
