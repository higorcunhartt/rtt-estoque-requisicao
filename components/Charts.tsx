"use client";

import { fmt, fmt0, MN } from "@/lib/format";
import { useApp } from "./AppProvider";

interface RulerProps { saldo: number; oth: number; pc: number; sc: number; pp: number; mx: number; q?: number }

/** Régua: posição contra ponto de pedido e máximo. */
export function Ruler({ saldo, oth, pc, sc, pp, mx, q }: RulerProps) {
  const W = 760, H = 100, y = 34, h = 22;
  const tot = saldo + oth + pc + sc;
  const max = Math.max(tot + (q || 0), mx || 0, 1) * 1.08;
  const X = (v: number) => Math.round((v / max) * W * 1000) / 1000;
  let x0 = 0;
  const segs: { x: number; w: number; fill: string }[] = [];
  const seg = (v: number, fill: string) => { if (v > 0) { segs.push({ x: x0, w: X(v), fill }); x0 += X(v); } };
  seg(saldo, "var(--ink)"); seg(oth, "var(--green)"); seg(pc, "var(--blue)"); seg(sc, "url(#hp)");
  const mk = (v: number, lab: string, col: string, up: boolean) => {
    const x = Math.min(X(v), W - 1), an = x > W - 110 ? "end" : x < 80 ? "start" : "middle";
    return (
      <g key={lab}>
        <line x1={x} x2={x} y1={y - 8} y2={y + h + 8} stroke={col} strokeWidth={2} />
        <text x={x} y={up ? y - 13 : y + h + 21} textAnchor={an} fontSize={12.5} fill={col}>{lab}</text>
      </g>
    );
  };
  const aria = `Saldo ${fmt(saldo)}, disponível em outros armazéns ${fmt(oth)}, pedidos ${fmt(pc)}, SCs ${fmt(sc)}, ponto de pedido ${fmt0(pp)}, máximo ${fmt0(mx)}${q ? ", compra solicitada " + fmt(q) : ""}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria}>
      <defs>
        <pattern id="hp" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="var(--gray-soft)" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--hatch)" strokeWidth={3} />
        </pattern>
      </defs>
      <rect x={0} y={y} width={W} height={h} fill="var(--wash2)" rx={2} />
      {segs.map((s, i) => <rect key={i} x={s.x} y={y} width={s.w} height={h} fill={s.fill} />)}
      {q && q > 0 ? (
        <>
          <rect x={x0 + 1} y={y + 1} width={Math.max(X(q) - 2, 1)} height={h - 2} fill="none" stroke="var(--amber)" strokeWidth={2} strokeDasharray="5 3" />
          <text x={Math.min(Math.max(x0 + X(q) / 2, 70), W - 70)} y={H - 4} textAnchor="middle" fontSize={12} fill="var(--amber)">Compra solicitada {fmt(q)}</text>
        </>
      ) : null}
      {mx > 0 && <>{mk(pp, "Ponto de pedido " + fmt0(pp), "var(--red)", true)}{mk(mx, "Máximo " + fmt0(mx), "var(--amber)", X(mx) - X(pp) >= 170)}</>}
    </svg>
  );
}

export function Legend() {
  return (
    <div className="legend">
      <span><i style={{ background: "var(--ink)" }} />Saldo do almoxarifado</span>
      <span><i style={{ background: "var(--green)" }} />Disponível em outros armazéns da filial</span>
      <span><i style={{ background: "var(--blue)" }} />PC aprovado a caminho</span>
      <span><i style={{ background: "repeating-linear-gradient(45deg,var(--hatch) 0 2px,var(--gray-soft) 2px 5px)" }} />SC aprovada sem pedido</span>
    </div>
  );
}

/** Quantidade recebida por mês. */
export function Bars({ dem }: { dem: number[] }) {
  const { S, ds } = useApp();
  if (!ds) return null;
  const months = ds.meta.months, N = months.length, w = S.win;
  const W = 600, H = 130, bw = W / N, max = Math.max(...dem, 1);
  return (
    <svg viewBox={`0 0 ${W} ${H + 20}`} role="img" aria-label="Quantidade recebida por mês">
      {dem.map((v, i) => {
        const h = (v / max) * H, inW = i >= N - w, m = months[i].split("-");
        const lab = MN[+m[1] - 1];
        return (
          <g key={i}>
            <rect x={i * bw + 6} y={H - h} width={bw - 12} height={Math.max(h, v > 0 ? 2 : 0)} fill={inW ? "var(--ink)" : "var(--hatch)"} rx={2}>
              <title>{lab}/{m[0].slice(2)}: {fmt(v)}</title>
            </rect>
            <text x={i * bw + bw / 2} y={H + 15} textAnchor="middle" fontSize={N > 12 ? 9.5 : 12} fill="var(--ink3)">{N > 12 ? lab[0].toUpperCase() : lab}</text>
            {v > 0 && <text x={i * bw + bw / 2} y={Math.max(H - h - 4, 11)} textAnchor="middle" fontSize={N > 12 ? 9.5 : 11.5} fill="var(--ink2)">{fmt0(v)}</text>}
          </g>
        );
      })}
    </svg>
  );
}
