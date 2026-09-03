/**
 * Descarga en el navegador un .xlsx que el servidor devolvió en base64.
 * Vive aparte porque lo usan DOS flujos: la exportación normal desde
 * Configuración y el último respaldo dentro del borrado de cuenta (#82).
 */
export function downloadBase64Xlsx(filename: string, base64: string): void {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
