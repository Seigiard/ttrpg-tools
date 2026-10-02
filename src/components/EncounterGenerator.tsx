import { useStore } from '@nanostores/preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { ReferenceList } from '@/components/ReferenceList';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatRangeLabel, type RangePick } from '@/data/range-table';
import type { EncounterCheckOutcome, EncounterTable } from '@/data/types';
import { createEncounterStore } from '@/stores/encounter-store';

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
  roll: RangePick | null;
  onRoll: () => void;
}

function CheckSection({ table, roll, onRoll }: SectionProps) {
  const rows = table.check.rows;
  const row = roll ? rows[roll.rowIndex] : null;
  const loading = !row;
  const [history, setHistory] = useState<Array<{ sum: number; label: string }>>([]);

  useEffect(() => {
    if (!roll || !row) return;

    setHistory((items) => [{ sum: roll.sum, label: row.ru }, ...items].slice(0, 5));
  }, [roll, row]);

  return (
    <section className="space-y-6">
      <h2 className="font-display text-2xl text-text">Проверка столкновения</h2>
      <Button size="lg" onClick={onRoll} data-testid="check-roll-button">
        Проверить (d6)
      </Button>

      <Card data-testid="check-result-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-text-muted">Проверка</span>
            <span className="font-mono text-xs text-text-muted">
              d6 = <Skeleton loading={loading}>{roll ? roll.sum : 0}</Skeleton>
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div data-testid="check-result" data-outcome={row?.outcome}>
            <p className={`font-display text-3xl ${row ? outcomeTone[row.outcome] : 'text-text-muted'}`}>
              <Skeleton loading={loading}>{row ? row.ru : 'Проверка'}</Skeleton>
            </p>
            <p className="mt-2 text-sm text-text-muted">
              <Skeleton loading={loading}>{row ? row.hint : 'Бросаем кубик столкновения этой зоны…'}</Skeleton>
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg text-text">Последние проверки</h3>
          <Button variant="outline" size="sm" onClick={() => setHistory([])} data-testid="check-history-clear">
            Очистить
          </Button>
        </div>
        <ul className="space-y-2" data-testid="check-history">
          {history.map((item, index) => (
            <li key={`${item.sum}-${item.label}-${index}`} className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-sm">
              <span className="font-mono text-xs text-text-muted">d6 = {item.sum}</span>
              <span className="font-semibold text-text">{item.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <ReferenceList title="Исходы · d6" testId="check-reference" rows={rows} hitIndex={roll ? roll.rowIndex : null} label={formatRangeLabel}>
        {(referenceRow) => (
          <>
            <span className="font-semibold text-text">{referenceRow.ru}.</span> {referenceRow.hint}
          </>
        )}
      </ReferenceList>
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
            <span className="font-mono text-xs uppercase tracking-wider text-text-muted">Реакция</span>
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

      <ReferenceList title="Отношение · 2d6" testId="reaction-reference" rows={rows} hitIndex={roll ? roll.rowIndex : null} label={formatRangeLabel}>
        {(referenceRow) => (
          <>
            <span className="font-semibold text-text">{referenceRow.ru}.</span>{' '}
            <span className="italic">{referenceRow.question}</span>
          </>
        )}
      </ReferenceList>
    </section>
  );
}
