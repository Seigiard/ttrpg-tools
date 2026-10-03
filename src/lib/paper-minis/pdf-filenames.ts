import type { PageSizeKey } from './geometry';

const pad = (n: number) => n.toString().padStart(2, '0');

export function buildFilename(): string {
  const d = new Date();
  return `paper-minis-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.pdf`;
}

export function buildPrinterScaleTestSheetFilename(pageSize: PageSizeKey): string {
  return `paper-minis-printer-scale-test-${pageSize}.pdf`;
}
