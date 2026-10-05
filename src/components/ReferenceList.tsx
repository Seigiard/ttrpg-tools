import type { ComponentChildren } from 'preact';

interface Props<Row> {
  title: string;
  testId: string;
  rows: readonly Row[];
  hitIndex: number | null;
  label: (row: Row, index: number) => ComponentChildren;
  children: (row: Row) => ComponentChildren;
}

export function referenceHitClass(isHit: boolean): string {
  return isHit ? 'border-l-2 border-primary bg-primary/10 text-text' : 'text-text-muted';
}

export function ReferenceList<Row>({ title, testId, rows, hitIndex, label, children }: Props<Row>) {
  return (
    <section data-testid={testId}>
      <h3 className="font-mono text-xs uppercase tracking-wider text-text-muted">{title}</h3>
      <ul className="mt-3 grid grid-cols-[max-content_1fr] divide-y divide-border">
        {rows.map((row, i) => (
          <li
            key={i}
            data-row-index={i}
            data-hit={i === hitIndex ? 'true' : undefined}
            className={`col-span-2 grid grid-cols-subgrid gap-3 px-2 py-1.5 ${referenceHitClass(i === hitIndex)}`}
          >
            <span className="font-mono text-xs">{label(row, i)}</span>
            <span className="text-sm">{children(row)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
