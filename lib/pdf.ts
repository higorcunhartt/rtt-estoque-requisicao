import type { Model } from "./calc";
import { days } from "./calc";
import type { Att, Cart } from "./cart";
import { brl2, dbr, fmtCNPJ, fmtSize, nf, nf0 } from "./format";
import { headLabel, isDireta, curZ, optLabel, prjName } from "./sc";

type RGB = [number, number, number];

/** Texto compatível com a fonte padrão do PDF (sem aspas e travessões tipográficos). */
const T = (s: unknown) =>
  String(s ?? "").replace(/[–—]/g, "-").replace(/[“”]/g, '"').replace(/[’‘]/g, "'").replace(/−/g, "-").replace(/×/g, "x").replace(/…/g, "...");

export async function loadLogo(): Promise<{ url: string; w: number; h: number } | null> {
  try {
    const r = await fetch("/logo.png");
    const blob = await r.blob();
    const url = await new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.readAsDataURL(blob); });
    const dim = await new Promise<{ w: number; h: number }>((res) => { const i = new Image(); i.onload = () => res({ w: i.width, h: i.height }); i.src = url; });
    return { url, ...dim };
  } catch { return null; }
}

export async function buildPdf(o: { model: Model; cart: Cart; atts: Att[]; num: string; at: string; baseStr: string; logo: Awaited<ReturnType<typeof loadLogo>> }): Promise<Blob> {
  const { model, cart, atts, num, at, baseStr, logo } = o;
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const last = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const n = (v: number | null | undefined) => (v == null ? "-" : nf.format(v));
  const n0 = (v: number | null | undefined) => (v == null ? "-" : nf0.format(v));
  const m = (v: number | null | undefined) => (v == null ? "-" : brl2.format(v));
  const f = cart.f, h = cart.head, items = cart.items, sp = items.filter((z) => z.special);
  const INK: RGB = [17, 17, 17], RED: RGB = [226, 6, 19], GRN: RGB = [43, 122, 75], GR: RGB = [110, 107, 117], W = 297;
  const tot = items.reduce((s, z) => s + z.q * z.preco, 0);
  const excV = sp.reduce((s, z) => s + (z.exc || 0) * z.preco, 0);
  const hl = (k: Parameters<typeof headLabel>[3]) => headLabel(model, cart, f, k);

  doc.setFillColor(...RED); doc.rect(0, 0, W, 3, "F");
  let tx = 12;
  if (logo) { const hh = 14, ww = (logo.w / logo.h) * hh; doc.addImage(logo.url, "PNG", 12, 6, ww, hh); tx = 12 + ww + 4; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...INK);
  doc.text(T("Solicitação de compra - resumo da análise de estoque"), tx, 14);
  if (sp.length) {
    doc.setFillColor(...RED); doc.roundedRect(W - 62, 7.5, 50, 8, 1.5, 1.5, "F");
    doc.setTextColor(255, 255, 255); doc.setFontSize(9.5); doc.text("APROVAÇÃO ESPECIAL", W - 37, 12.8, { align: "center" });
  }
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(...GR);
  doc.text(T(`Filial ${f}   |   Número provisório ${num}   |   Emitido em ${at}   |   Dados do Protheus de ${baseStr}`), tx, 20);
  let y = 25;
  const nSrv = items.filter((z) => z.srv).length;
  const kp: [string, string][] = [
    ["Itens na SC", String(items.length) + (nSrv ? `  (${nSrv} serviço${nSrv > 1 ? "s" : ""})` : "")],
    ["Itens com aprovação especial", String(sp.length)],
    ["Valor acima da necessidade prevista", m(excV)],
    ["Orçamento total", m(tot)],
  ];
  kp.forEach((k, i) => {
    const x = 12 + i * 69;
    doc.setDrawColor(217, 216, 223); doc.setFillColor(246, 246, 248); doc.roundedRect(x, y, 65, 15, 1.5, 1.5, "FD");
    doc.setFontSize(8.5); doc.setTextColor(...GR); doc.text(T(k[0]), x + 4, y + 5.5);
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...(i === 1 && sp.length ? RED : INK)); doc.text(T(k[1]), x + 4, y + 12);
    doc.setFont("helvetica", "normal");
  });
  y += 21;
  const z = curZ(model, cart, f);
  autoTable(doc, {
    startY: y, theme: "grid", margin: { left: 12, right: 12 },
    styles: { fontSize: 9, cellPadding: 1.8, textColor: INK, lineColor: [217, 216, 223] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 48, fillColor: [246, 246, 248] }, 2: { fontStyle: "bold", cellWidth: 40, fillColor: [246, 246, 248] } },
    body: [
      ["Motivo da SC (C1_XOBS1)", { content: T(h.xobs1), colSpan: 3 }],
      ["Projeto (NOME_PROJETO)", { content: T(prjName(model, h.pj)), colSpan: 3 }],
      ["Centro de custo (C1_CC)", { content: T(optLabel(model, "cc", f, h.cc)), colSpan: 3 }],
      ["Finalidade", T(h.fin), "Tipo de demanda", T(h.dem)],
      ["Modalidade", T(h.mod), "Fornecedor", T(isDireta(h.mod) ? hl("forn") : "-")],
      ["Local de entrega (ZZF)", { content: T(hl("local")), colSpan: 3 }],
      ["CNPJ / endereço de entrega", { content: T(z ? `CNPJ ${fmtCNPJ(z.cnpj)}  |  ${z.end}` : "-"), colSpan: 3 }],
      ["Anexos", { content: atts.length ? T(atts.map((a) => a.name).join("; ")) : "nenhum", colSpan: 3 }],
    ],
  });
  y = last() + 6;
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...INK); doc.text("Resumo por item", 12, y); y += 2;
  const head = { fillColor: INK, textColor: [255, 255, 255] as RGB, fontStyle: "bold" as const, fontSize: 8, halign: "center" as const, valign: "middle" as const };
  autoTable(doc, {
    startY: y, theme: "grid", margin: { left: 12, right: 12 }, headStyles: head,
    styles: { fontSize: 8, cellPadding: 1.5, textColor: INK, lineColor: [217, 216, 223], valign: "middle" },
    head: [["#", "Produto", "Arm.", "Data nec.", "Consumo/ mês", "Lead time (d)", "Ponto de pedido", "Máximo", "Posição", "Necess. prevista", "Qtd. a comprar", "Aprovação", "Orç. unit.", "Total"]],
    body: items.map((it, i) => [
      i + 1, T(it.c + (it.srv ? " (serviço)" : "") + "\n" + it.d), it.l, dbr(it.need),
      ...(it.srv
        ? [{ content: "serviço: sem análise de estoque", colSpan: 5, styles: { halign: "center" as const, textColor: GR } }, "-"]
        : [n(it.cmm), n0(it.lt), n0(it.pp), n0(it.mx), n(it.pos), n0(it.prev)]),
      { content: n(it.q) + " " + it.u, styles: { fontStyle: "bold" as const } },
      { content: it.special ? "Especial" : "Normal", styles: { fontStyle: "bold" as const, textColor: it.special ? RED : GRN } },
      m(it.preco), m(it.q * it.preco),
    ]) as never,
    foot: [[{ content: "Total", colSpan: 13, styles: { halign: "right" as const } }, m(tot)]],
    footStyles: { fillColor: [246, 246, 248], textColor: INK, fontStyle: "bold", fontSize: 8.5, halign: "right" },
    columnStyles: { 0: { cellWidth: 7, halign: "center" }, 1: { cellWidth: 53 }, 2: { cellWidth: 10, halign: "center" }, 3: { cellWidth: 18, halign: "center" }, 4: { cellWidth: 16, halign: "right" }, 5: { cellWidth: 19, halign: "right" }, 6: { cellWidth: 16, halign: "right" }, 7: { cellWidth: 17, halign: "right" }, 8: { cellWidth: 17, halign: "right" }, 9: { cellWidth: 16, halign: "right" }, 10: { cellWidth: 20, halign: "right" }, 11: { cellWidth: 20, halign: "center" }, 12: { cellWidth: 20, halign: "right" }, 13: { cellWidth: 24, halign: "right" } },
  });
  y = last() + 7;
  if (y > 170) { doc.addPage("a4", "landscape"); y = 16; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...INK); doc.text("Memória de cálculo por item", 12, y); y += 2;

  type Cell = string | { content: string; colSpan?: number; styles?: Record<string, unknown> };
  const det: Cell[][] = [];
  items.forEach((it, i) => {
    if (it.srv) {
      det.push([{ content: `${i + 1}. ${T(it.c)} - ${T(it.d)}  |  SERVIÇO  |  aprovação normal`, colSpan: 2, styles: { fontStyle: "bold", fillColor: [246, 246, 248], textColor: INK } }]);
      det.push(["Análise de estoque", "não se aplica: serviço (B1_TIPO = SV)"]);
      det.push(["Quantidade", T(`${n(it.q)} ${it.u}`)]);
      det.push(["Local de entrega / orçamento", T(`${hl("local")} / ${m(it.preco)} por ${it.u}, total ${m(it.q * it.preco)}`)]);
      if (it.xobs2) det.push(["Observação do item (C1_XOBS2)", T(it.xobs2)]);
      return;
    }
    det.push([{ content: `${i + 1}. ${T(it.c)} - ${T(it.d)}  |  armazém ${it.l}${it.an ? " - " + T(it.an) : ""}  |  ${it.special ? "APROVAÇÃO ESPECIAL" : "aprovação normal"}`, colSpan: 2, styles: { fontStyle: "bold", fillColor: [246, 246, 248], textColor: it.special ? RED : INK } }]);
    (it.memo || []).forEach((r, k, a) => {
      const b = k === a.length - 1 || k === 4;
      det.push([{ content: T(r[0]), styles: b ? { fontStyle: "bold", textColor: INK } : {} }, { content: T(`${r[2]}   (${r[1]})`).replace(/√/g, "raiz").replace(/≤/g, "<="), styles: b ? { fontStyle: "bold" } : {} }]);
    });
    const pl = it.pcList || [], sl = it.scList || [];
    det.push(["PCs e SCs aprovados em aberto", T(`PCs: ${pl.length ? pl.map((p) => `${p[0]}-${p[1]} ${n(p[2])}, entrega ${dbr(p[3])}${days(model, p[3]) < 0 ? " (atrasado)" : ""}`).join("; ") : "nenhum"}  |  SCs: ${sl.length ? sl.map((s) => `${s[0]}-${s[1]} ${n(s[2])}`).join("; ") : "nenhuma"}`)]);
    det.push([{ content: "Quantidade a comprar", styles: { fontStyle: "bold", textColor: INK } }, { content: T(`${n(it.q)} ${it.u}` + (it.special ? `  -  ${n(it.exc)} acima da necessidade prevista` : "")), styles: { fontStyle: "bold", textColor: it.special ? RED : INK } }]);
    det.push(["Cobertura atual e outras filiais", T(`cobertura atual ${it.cobAt == null ? "-" : n(it.cobAt) + " meses"}; saldo em outras filiais (não considerado): ${n(it.otherF)}`)]);
    det.push(["Local de entrega / orçamento", T(`${hl("local")} / ${m(it.preco)} por ${it.u}, total ${m(it.q * it.preco)}`)]);
    if (it.xobs2) det.push(["Observação do item (C1_XOBS2)", T(it.xobs2)]);
    if (it.just) det.push([{ content: "Justificativa (C1_XJUSTIF)", styles: { textColor: RED } }, T(it.just)]);
  });
  autoTable(doc, { startY: y, theme: "grid", margin: { left: 12, right: 12 }, styles: { fontSize: 8.2, cellPadding: 1.5, textColor: INK, lineColor: [217, 216, 223] }, columnStyles: { 0: { cellWidth: 56, textColor: GR } }, body: det as never });

  if (atts.length) {
    y = last() + 7;
    if (y > 175) { doc.addPage("a4", "landscape"); y = 16; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...INK); doc.text(`Anexos (${atts.length})`, 12, y); y += 2;
    autoTable(doc, {
      startY: y, theme: "grid", margin: { left: 12, right: 12 }, headStyles: head, styles: { fontSize: 8.2, cellPadding: 1.5, textColor: INK, lineColor: [217, 216, 223] },
      head: [["#", "Arquivo", "Tipo", "Tamanho", "No relatório"]],
      body: atts.map((a, i) => [i + 1, T(a.name), T(a.type || "-"), fmtSize(a.size), a.url ? "imagem nas páginas seguintes" : "listado apenas"]),
      columnStyles: { 0: { cellWidth: 8 }, 3: { cellWidth: 24 }, 4: { cellWidth: 50 } },
    });
    for (const a of atts.filter((a) => a.url)) {
      doc.addPage("a4", "landscape");
      doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...INK); doc.text(T("Anexo: " + a.name), 12, 14);
      try {
        const pr = doc.getImageProperties(a.url!), mw = 273, mh = 178, s = Math.min(mw / pr.width, mh / pr.height);
        doc.addImage(a.url!, /png$/i.test(a.type) ? "PNG" : "JPEG", 12, 20, pr.width * s, pr.height * s);
      } catch { doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text("Não foi possível incluir a imagem.", 12, 24); }
    }
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(...GR); doc.setFont("helvetica", "normal");
    doc.text(T("Simulação: nada foi enviado ao Protheus. Ponto de pedido = CMD x lead time + estoque de segurança; necessidade = máximo - posição. Saldo B2_QATU; só SCs e PCs aprovados."), 12, 203);
    doc.text(`Página ${i} de ${pages}`, W - 12, 203, { align: "right" });
  }
  return doc.output("blob");
}
