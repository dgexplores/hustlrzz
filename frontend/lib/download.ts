export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  triggerDownload(filename, blob);
}

export function downloadMarkdown(filename: string, md: string) {
  const blob = new Blob([md], { type: "text/markdown" });
  triggerDownload(filename, blob);
}

function triggerDownload(filename: string, blob: Blob) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(href);
}
