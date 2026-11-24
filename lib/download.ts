/** Baixa um arquivo gerado no navegador. */
export function saveBlob(name: string, data: Blob) {
  const u = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}
