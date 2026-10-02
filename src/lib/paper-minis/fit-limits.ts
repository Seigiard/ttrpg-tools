import type { FigureFitLimit } from './sizes';

const fitLimitLabels: Record<FigureFitLimit, string> = {
  height: 'лимит высоты 2×',
  width: 'лимит ширины',
  page: 'размер листа',
};

export function fitLimitWarning(limits: readonly FigureFitLimit[]): string | undefined {
  if (!limits.length) return undefined;
  return `Миниатюра уменьшена: ${limits.map((limit) => fitLimitLabels[limit]).join(', ')}.`;
}
