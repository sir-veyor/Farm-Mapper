export const canShareFiles = (file: File): boolean => !!navigator.canShare?.({ files: [file] });

/** Phones: native share sheet (AirDrop, Messages, Drive...). Returns false if the user cancelled. */
export async function shareFile(file: File): Promise<boolean> {
  try { await navigator.share({ files: [file], title: file.name }); return true; }
  catch (e) { if ((e as Error).name === 'AbortError') return false; throw e; }
}

export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
