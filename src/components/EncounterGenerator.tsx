import { useStore } from '@nanostores/react';
import { useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type {
  EncounterCheckOutcome,
  EncounterCheckRow,
  EncounterTable,
  ReactionRow,
} from '@/data/types';
import { createEncounterStore, type RangeRoll } from '@/stores/encounter-store';

interface Props {
  table: EncounterTable;
}

const outcomeTone: Record<EncounterCheckOutcome, string> = {
  encounter: 'text-secondary',
  omen: 'text-warning',
  clear: 'text-text-muted',
};

export function EncounterGenerator({ table }: Props) {
  // useMemo гарантирует, что стор создаётся один раз на жизнь компонента.
  const store = useMemo(() => createEncounterStore(table), [table]);
  const check = useStore(store.$check);
  const reaction = useStore(store.$reaction);

  // Первый автоматический бросок на клиенте — не в store-init, иначе SSR-снепшот
  // и клиент разойдутся и hydration сломается.
  useEffect(() => {
    if (store.$check.get() === null) store.rollCheck();
    if (store.$reaction.get() === null) store.rollReaction();
  }, [store]);

  return (
    <div className="space-y-12">
      <CheckSection table={table} roll={check} onRoll={store.rollCheck} />
      <ReactionSection table={table} roll={reaction} onRoll={store.rollReaction} />
    </div>
  );
}

interface SectionProps {
  table: EncounterTable;
  roll: RangeRoll | null;
  onRoll: () => void;
}

function CheckSection({ table, roll, onRoll }: SectionProps) {
  const rows = table.check.rows;
  const row = roll ? rows[roll.rowIndex] : null;
  const loading = !row;
  return (
    <section className="space-y-6">
      <h2 className="font-display text-2xl text-text">Проверка столкновения</h2>
      <Button size="lg" onClick={onRoll} data-testid="check-roll-button">
        Проверить (d6)
      </Button>

      <Card data-testid="check-result-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-text-muted">
              Проверка
            </span>
            <span className="font-mono text-xs text-text-muted">
              d6 = <Skeleton loading={loading}>{roll ? roll.sum : 0}</Skeleton>
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div data-testid="check-result" data-outcome={row?.outcome}>
            <p
              className={`font-display text-3xl ${row ? outcomeTone[row.outcome] : 'text-text-muted'}`}
            >
              <Skeleton loading={loading}>{row ? row.ru : 'Проверка'}</Skeleton>
            </p>
            <p className="mt-2 text-sm text-text-muted">
              <Skeleton loading={loading}>
                {row ? row.hint : 'Бросаем кубик столкновения этой зоны…'}
              </Skeleton>
            </p>
          </div>
        </CardContent>
      </Card>

      <CheckReference rows={rows} hitRow={roll ? roll.rowIndex : null} />
    </section>
  );
}

function ReactionSection({ table, roll, onRoll }: SectionProps) {
  const rows = table.reactions.rows;
  const row = roll ? rows[roll.rowIndex] : null;
  const loading = !row;
  return (
    <section className="space-y-6">
      <h2 className="font-display text-2xl text-text">Реакция</h2>
      <Button size="lg" onClick={onRoll} data-testid="reaction-roll-button">
        Бросить реакцию (2d6)
      </Button>

      <Card data-testid="reaction-result-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-text-muted">
              Реакция
            </span>
            <span className="font-mono text-xs text-text-muted">
              2d6 = <Skeleton loading={loading}>{roll ? roll.sum : 0}</Skeleton>
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div data-testid="reaction-result">
            <p className="font-display text-3xl">
              <Skeleton loading={loading}>{row ? row.ru : 'Реакция'}</Skeleton>
            </p>
            <p className="mt-1 text-sm italic text-text-muted">
              <Skeleton loading={loading}>
                <em>{row ? row.question : 'Как существо относится к мышам?'}</em>
              </Skeleton>
            </p>
          </div>
        </CardContent>
      </Card>

      <ReactionReference rows={rows} hitRow={roll ? roll.rowIndex : null} />
    </section>
  );
}

interface CheckReferenceProps {
  rows: readonly EncounterCheckRow[];
  hitRow: number | null;
}

function CheckReference({ rows, hitRow }: CheckReferenceProps) {
  return (
    <section data-testid="check-reference">
      <h3 className="font-mono text-xs uppercase tracking-wider text-text-muted">Исходы · d6</h3>
      <ul className="mt-3 divide-y divide-border">
        {rows.map((row, i) => {
          const label = row.min === row.max ? String(row.min) : `${row.min}–${row.max}`;
          const isHit = i === hitRow;
          return (
            <li
              key={label}
              data-row-index={i}
              data-hit={isHit ? 'true' : undefined}
              className={`flex gap-3 px-2 py-1.5 ${
                isHit ? 'border-l-2 border-primary bg-primary/10 text-text' : 'text-text-muted'
              }`}
            >
              <span className="w-8 font-mono text-xs">{label}</span>
              <span className="flex-1 text-sm">
                <span className="font-semibold text-text">{row.ru}.</span> {row.hint}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

interface ReactionReferenceProps {
  rows: readonly ReactionRow[];
  hitRow: number | null;
}

function ReactionReference({ rows, hitRow }: ReactionReferenceProps) {
  return (
    <section data-testid="reaction-reference">
      <h3 className="font-mono text-xs uppercase tracking-wider text-text-muted">Отношение · 2d6</h3>
      <ul className="mt-3 divide-y divide-border">
        {rows.map((row, i) => {
          const label = row.min === row.max ? String(row.min) : `${row.min}–${row.max}`;
          const isHit = i === hitRow;
          return (
            <li
              key={label}
              data-row-index={i}
              data-hit={isHit ? 'true' : undefined}
              className={`flex gap-3 px-2 py-1.5 ${
                isHit ? 'border-l-2 border-primary bg-primary/10 text-text' : 'text-text-muted'
              }`}
            >
              <span className="w-12 font-mono text-xs">{label}</span>
              <span className="flex-1 text-sm">
                <span className="font-semibold text-text">{row.ru}.</span>{' '}
                <span className="italic">{row.question}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
