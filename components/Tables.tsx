"use client";

import { useApp } from "./AppProvider";
import { days, memo, type Calc } from "@/lib/calc";
import { dbr, fmt, mes } from "@/lib/format";

export function PcTable({ p, f, l }: { p: number; f: string; l: string }) {
  const { ds, model } = useApp();
  if (!ds || !model) return null;
  const L = (ds.pcs[p] || []).slice().sort((a, b) => Number(b[0] === f && b[1] === l) - Number(a[0] === f && a[1] === l) || Number(b[0] === f) - Number(a[0] === f));
  if (!L.length) return <p className="empty">Nenhum pedido em aberto para este produto.</p>;
  return (
    <>
      <div className="tablewrap">
        <table className="mini">
          <thead><tr><th className="t">PC</th><th className="t">Filial / armazém</th><th>Pendente</th><th className="t">Entrega</th><th className="t">Projeto</th><th className="t">Fornecedor</th></tr></thead>
          <tbody>
            {L.slice(0, 12).map((x, i) => {
              const late = days(model, x[5]) < 0;
              return (
                <tr key={i} style={{ cursor: "default" }}>
                  <td className="t">{x[2]}-{x[3]}</td>
                  <td className="t">{x[0]} / {x[1]}{x[0] === f && x[1] === l && <> <span className="pill p-blue">este almox.</span></>}</td>
                  <td>{fmt(x[4])}</td>
                  <td className="t">{dbr(x[5])}{late && <> <span className="flag">atrasado</span></>}</td>
                  <td className="t prj">{x[8] || "—"}</td>
                  <td className="t">{x[6]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {L.length > 12 && <p className="note">e mais {L.length - 12} pedidos.</p>}
    </>
  );
}

export function ScTable({ p, f, l }: { p: number; f: string; l: string }) {
  const { ds, model } = useApp();
  if (!ds || !model) return null;
  const L = (ds.scs[p] || []).slice().sort((a, b) => Number(b[0] === f && b[1] === l) - Number(a[0] === f && a[1] === l));
  if (!L.length) return <p className="empty">Nenhuma SC aberta sem pedido para este produto.</p>;
  return (
    <div className="tablewrap">
      <table className="mini">
        <thead><tr><th className="t">SC (filial + C1_NUM)</th><th className="t">Armazém</th><th>Pendente</th><th className="t">Emissão</th><th className="t">Projeto</th><th className="t">Solicitante</th><th className="t">Situação</th></tr></thead>
        <tbody>
          {L.slice(0, 12).map((x, i) => {
            const age = -days(model, x[5]);
            return (
              <tr key={i} style={{ cursor: "default" }}>
                <td className="t">{x[0]} – {x[2]}-{x[3]}</td>
                <td className="t">{x[1]}{x[0] === f && x[1] === l && <> <span className="pill p-red">este almox.</span></>}</td>
                <td>{fmt(x[4])}</td>
                <td className="t">{dbr(x[5])}{age > 180 && <> <span className="flag">{age} dias</span></>}</td>
                <td className="t prj">{x[9] || "—"}</td>
                <td className="t">{x[7]}</td>
                <td className="t">{x[8]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function MemoTable({ x }: { x: Calc }) {
  const { S } = useApp();
  const r = memo(x, S);
  const hl = (i: number) => i === r.length - 1 || i === 4;
  return (
    <>
      <table className="calc">
        <tbody>
          {r.map((z, i) => (
            <tr key={i} style={hl(i) ? { background: "var(--wash)" } : undefined}>
              <td>{hl(i) ? <b>{z[0]}</b> : z[0]}</td>
              <td className="f">{z[1]}</td>
              <td className="r">{z[2]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {x.cmm === 0 && <p className="pmiss">Sem recebimento na janela de {mes(S.win)}: sem consumo não há ponto de pedido nem necessidade prevista. Qualquer compra deste item exige aprovação especial.</p>}
    </>
  );
}
