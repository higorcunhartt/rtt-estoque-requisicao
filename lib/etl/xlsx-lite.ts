/**
 * Leitor XLSX leve e rápido (só leitura de valores), usado pelo ETL.
 * Roda em Node e no navegador: recebe ArrayBuffer/Uint8Array, sem fs/path.
 *
 * Por que não `XLSX.read`? Em planilhas de ~5 milhões de células o SheetJS leva ~60 s.
 * Aqui só usamos o `CFB` do SheetJS para descompactar o zip e varremos o XML das
 * planilhas com indexOf, decodificando apenas as colunas pedidas (poucos segundos).
 */
import * as XLSX from "xlsx";

export type Cel = string | number | null;

export interface Tabela {
  /** Nomes das colunas pedidas, na ordem de `linhas[i]`. */
  colunas: string[];
  linhas: Cel[][];
}

export interface OpcoesTabela {
  /** Aba (nome). Se omitida, usa a primeira. */
  aba?: string;
  /** Nome de uma coluna que identifica a linha de cabeçalho (ex.: "C1_FILIAL"). Se omitido, a linha 1. */
  ancora?: string;
  /** Colunas desejadas (nomes do cabeçalho). Se omitido, todas. Colunas ausentes viram null. */
  colunas?: string[];
}

type Zip = { nomes: string[]; arquivos: Map<string, Uint8Array> };

function abrirZip(entrada: ArrayBuffer | Uint8Array): Map<string, Uint8Array> {
  const u8 = entrada instanceof Uint8Array ? entrada : new Uint8Array(entrada);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfb: any = (XLSX as any).CFB.read(u8, { type: "array" });
  const m = new Map<string, Uint8Array>();
  for (let i = 0; i < cfb.FullPaths.length; i++) {
    const nome = String(cfb.FullPaths[i]).replace(/^Root Entry\//, "");
    const c = cfb.FileIndex[i].content;
    if (c) m.set(nome, c instanceof Uint8Array ? c : Uint8Array.from(c));
  }
  return m;
}

const dec = new TextDecoder("utf-8");
const texto = (u8: Uint8Array) => dec.decode(u8);

function xmlDecode(s: string): string {
  if (s.indexOf("&") < 0 && s.indexOf("_x") < 0) return s;
  return s
    .replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e: string) => {
      if (e === "amp") return "&";
      if (e === "lt") return "<";
      if (e === "gt") return ">";
      if (e === "quot") return '"';
      if (e === "apos") return "'";
      return String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    })
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_, h: string) => {
      const c = parseInt(h, 16);
      return c === 0 ? "" : String.fromCharCode(c);
    });
}

function lerSharedStrings(xml: string): string[] {
  const out: string[] = [];
  let p = 0;
  for (;;) {
    const a = xml.indexOf("<si", p);
    if (a < 0) break;
    const ch = xml.charCodeAt(a + 3);
    if (ch !== 62 && ch !== 32 && ch !== 47) { p = a + 3; continue; } // não é <si>/<si ...>
    const b = xml.indexOf("</si>", a);
    if (b < 0) break;
    const bloco = xml.substring(a, b);
    let s = "";
    let q = 0;
    for (;;) {
      const t0 = bloco.indexOf("<t", q);
      if (t0 < 0) break;
      const c2 = bloco.charCodeAt(t0 + 2);
      if (c2 !== 62 && c2 !== 32) { q = t0 + 2; continue; } // <tr> etc.
      const gt = bloco.indexOf(">", t0);
      if (bloco.charCodeAt(gt - 1) === 47) { q = gt; continue; } // <t/>
      const t1 = bloco.indexOf("</t>", gt);
      s += bloco.substring(gt + 1, t1);
      q = t1 + 4;
    }
    out.push(xmlDecode(s));
    p = b + 5;
  }
  return out;
}

function caminhoDaAba(zip: Map<string, Uint8Array>, aba?: string): string {
  const wb = texto(zip.get("xl/workbook.xml")!);
  const rels = texto(zip.get("xl/_rels/workbook.xml.rels")!);
  const abas: { nome: string; rid: string }[] = [];
  const re = /<sheet\s[^>]*?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(wb))) {
    const nome = /name="([^"]*)"/.exec(m[0]);
    const rid = /r:id="([^"]*)"/.exec(m[0]);
    if (nome && rid) abas.push({ nome: xmlDecode(nome[1]), rid: rid[1] });
  }
  const alvo = aba ? abas.find((a) => a.nome === aba) : abas[0];
  if (!alvo) throw new Error(`Aba "${aba}" não encontrada. Abas disponíveis: ${abas.map((a) => a.nome).join(", ")}.`);
  const re2 = /<Relationship\s[^>]*?>/g;
  while ((m = re2.exec(rels))) {
    const id = /Id="([^"]*)"/.exec(m[0]);
    const tg = /Target="([^"]*)"/.exec(m[0]);
    if (id && tg && id[1] === alvo.rid) {
      const t = tg[1].replace(/^\/?(xl\/)?/, "");
      return "xl/" + t;
    }
  }
  throw new Error(`Não foi possível localizar o XML da aba "${alvo.nome}".`);
}

function colIdx(xml: string, ini: number, fim: number): number {
  let n = 0;
  for (let i = ini; i < fim; i++) {
    const c = xml.charCodeAt(i);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

/**
 * Lê uma aba como tabela. As linhas acima do cabeçalho são ignoradas; linhas totalmente vazias também.
 */
export function lerTabela(entrada: ArrayBuffer | Uint8Array, op: OpcoesTabela = {}): Tabela {
  const zip = abrirZip(entrada);
  const caminho = caminhoDaAba(zip, op.aba);
  const xmlBin = zip.get(caminho);
  if (!xmlBin) throw new Error(`Arquivo ${caminho} ausente no XLSX.`);
  const xml = texto(xmlBin);
  const ss = zip.has("xl/sharedStrings.xml") ? lerSharedStrings(texto(zip.get("xl/sharedStrings.xml")!)) : [];

  let p = xml.indexOf("<sheetData");
  if (p < 0) return { colunas: op.colunas ?? [], linhas: [] };
  p = xml.indexOf(">", p) + 1;

  // Estado de leitura
  let cabecalho: string[] | null = null;
  let querer: Int32Array | null = null; // coluna do arquivo -> posição na saída (-1 = ignorar)
  let saidaCols: string[] = [];
  const linhas: Cel[][] = [];
  let linhaAtual = -1;
  let buf: Cel[] | null = null; // linha em montagem (cabeçalho: todas colunas)
  let linhaCab: Cel[] = [];
  let cabLinhaNum = -1;

  const fechaLinha = () => {
    if (!buf) return;
    if (!cabecalho) {
      // candidata a cabeçalho
      const nomes = linhaCab.map((v) => (v == null ? "" : String(v).trim()));
      const ok = op.ancora ? nomes.includes(op.ancora) : true;
      if (ok) {
        cabecalho = nomes;
        const pedidas = op.colunas ?? nomes.filter((n) => n);
        saidaCols = pedidas;
        querer = new Int32Array(nomes.length + 1).fill(-1);
        pedidas.forEach((nm, k) => {
          const i = nomes.indexOf(nm);
          if (i >= 0) querer![i] = k;
        });
        cabLinhaNum = linhaAtual;
      }
      linhaCab = [];
    } else if (linhaAtual !== cabLinhaNum) {
      let vazia = true;
      for (let i = 0; i < buf.length; i++) if (buf[i] != null && buf[i] !== "") { vazia = false; break; }
      if (!vazia) linhas.push(buf);
    }
    buf = null;
  };

  const n = xml.length;
  let r0 = xml.indexOf("<row ", p);
  for (;;) {
    const c0 = xml.indexOf("<c ", p);
    // fecha a linha anterior se uma nova <row começa antes da próxima célula
    if (r0 >= 0 && (c0 < 0 || r0 < c0)) {
      fechaLinha();
      const gt = xml.indexOf(">", r0);
      const rm = xml.indexOf(' r="', r0);
      if (rm > 0 && rm < gt) {
        const e = xml.indexOf('"', rm + 4);
        linhaAtual = parseInt(xml.substring(rm + 4, e), 10);
      } else linhaAtual++;
      buf = cabecalho ? new Array(saidaCols.length).fill(null) : [];
      p = gt + 1;
      r0 = xml.indexOf("<row ", p);
      continue;
    }
    if (c0 < 0) break;
    if (!buf) { buf = cabecalho ? new Array(saidaCols.length).fill(null) : []; }
    const gt = xml.indexOf(">", c0);
    const auto = xml.charCodeAt(gt - 1) === 47;
    // atributos
    const rIni = xml.indexOf('r="', c0) + 3;
    const col = colIdx(xml, rIni, gt);
    if (auto) { p = gt + 1; continue; }
    const fimC = xml.indexOf("</c>", gt);
    const tIni = xml.indexOf(' t="', c0);
    const tipo = tIni > 0 && tIni < gt ? xml.charAt(tIni + 4) + (xml.charAt(tIni + 5) !== '"' ? xml.charAt(tIni + 5) : "") : "n";
    let destino = -2;
    if (!cabecalho) destino = col; // montando candidata a cabeçalho (todas colunas)
    else { const q = querer as Int32Array | null; if (q && col < q.length) destino = q[col]; }
    if (destino >= 0 || destino === -2) {
      let v: Cel = null;
      if (tipo === "inlineStr") {
        const a = xml.indexOf("<t", gt);
        if (a >= 0 && a < fimC) {
          const a2 = xml.indexOf(">", a);
          const b = xml.indexOf("</t>", a2);
          v = xmlDecode(xml.substring(a2 + 1, b));
        }
      } else {
        const a = xml.indexOf("<v>", gt);
        if (a >= 0 && a < fimC) {
          const b = xml.indexOf("</v>", a);
          const bruto = xml.substring(a + 3, b);
          if (tipo === "s") v = ss[+bruto] ?? null;
          else if (tipo === "str") v = xmlDecode(bruto);
          else if (tipo === "b") v = bruto === "1" ? 1 : 0;
          else if (tipo === "e") v = null;
          else v = +bruto;
        }
      }
      if (cabecalho) { if (destino >= 0) buf[destino] = v; }
      else linhaCab[col] = v;
    }
    p = fimC + 4;
    if (p >= n) break;
  }
  // última linha: se estava montando cabeçalho precisa de buf
  if (!buf && !cabecalho) buf = [];
  fechaLinha();
  if (!cabecalho) {
    throw new Error(op.ancora ? `Cabeçalho com a coluna "${op.ancora}" não encontrado na aba.` : "Aba vazia.");
  }
  return { colunas: saidaCols, linhas };
}

/** Converte data serial do Excel (dias desde 1899-12-30) em "AAAA-MM-DD". Nulo se inválido. */
export function serialParaIso(n: Cel): string | null {
  if (typeof n !== "number" || !(n > 0)) return null;
  return new Date(Math.round((n - 25569) * 864e5)).toISOString().slice(0, 10);
}
