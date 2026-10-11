import type { ReactNode } from 'react';

interface Props<Row> {
  title: string;
  testId: string;
  rows: readonly Row[];
  hitIndex: number | null;
  label: (row: Row, index: number) => ReactNode;
  children: (row: Row) => ReactNode;
}

export function referenceHitClass(isHit: boolean): string {
  return isHit ? 'border-s-2 border-primary bg-primary-subtle text-text' : 'text-text-muted';
}

export function ReferenceList<Row>({ title, testId, rows, hitIndex, label, children }: Props<Row>) {
  return (
    <section className="flex flex-col gap-3" data-testid={testId}>
      <h3 className="font-mono text-xs uppercase tracking-wider text-text-muted">{title}</h3>
      <ul className="grid grid-cols-[max-content_minmax(0,1fr)] divide-y divide-border">
        {rows.map((row, i) => (
          <li
            key={i}
            data-row-index={i}
            data-hit={i === hitIndex ? 'true' : undefined}
            className={`col-span-2 grid grid-cols-subgrid gap-3 px-2 py-1.5 ${referenceHitClass(i === hitIndex)}`}
          >
            <span className="font-mono text-xs tabular-nums">{label(row, i)}</span>
            <span className="text-sm">{children(row)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
