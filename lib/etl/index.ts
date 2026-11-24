import { excelToSpec, type ArquivosExcel, type OpcoesExcel } from "./excel";
import { assemble, type OpcoesAssemble } from "./assemble";
import type { Dataset } from "../types";

export * from "./spec";
export { excelToSpec, janelaMeses } from "./excel";
export type { ArquivosExcel, OpcoesExcel } from "./excel";
export { assemble } from "./assemble";
export type { OpcoesAssemble } from "./assemble";

/** Atalho: planilhas Excel -> Dataset pronto para a interface. */
export function buildFromExcel(files: ArquivosExcel, opts: OpcoesExcel & OpcoesAssemble = {}): Dataset {
  return assemble(excelToSpec(files, opts), opts);
}
