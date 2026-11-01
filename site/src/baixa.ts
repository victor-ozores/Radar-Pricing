import type { Foto } from "./tipos";

/** Entrega um arquivo para a pessoa baixar. O endereço temporário é liberado logo depois. */
export function baixaArquivo(conteudo: BlobPart, nome: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Gera o .xlsx da foto no navegador (o gerador só é baixado quando alguém pede o Excel). */
export async function baixaExcel(foto: Foto) {
  const { excelDaFoto, nomeDoArquivo } = await import("../js/excel.js");
  baixaArquivo(excelDaFoto(foto), nomeDoArquivo(foto), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
