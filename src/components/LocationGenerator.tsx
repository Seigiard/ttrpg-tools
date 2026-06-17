import { useStore } from '@nanostores/react';
import { RefreshCw } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { LocationTable, LocationTableD20 } from '@/data/types';
import { createLocationStore, type Roll } from '@/stores/location-store';

interface Props<Biome extends string> {
  table: LocationTable<Biome>;
}

export function LocationGenerator<Biome extends string>({ table }: Props<Biome>) {
  // useMemo гарантирует, что стор создаётся один раз на жизнь компонента.
  // Если когда-то таблица будет приходить «горячей» (live-обновление перевода) — поменять на key.
  const store = useMemo(() => createLocationStore(table), [table]);
  const biome = useStore(store.$biome);
  const roll = useStore(store.$roll);

  // Первый автоматический бросок на клиенте. Не в useState/store-init —
  // иначе SSR-снепшот и клиент дадут разные значения и hydration сломается.
  useEffect(() => {
    if (store.$roll.get() === null) {
      store.rollAll();
    }
  }, [store]);

  const handleBiomeChange = (next: string | number | null) => {
    if (next === null) return;
    store.setBiome(next as Biome);
  };

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <span className="font-mono text-xs uppercase tracking-wider text-text-muted">Биом</span>
        <Tabs value={biome} onValueChange={handleBiomeChange}>
          <TabsList>
            {table.biomes.map((b) => (
              <TabsTrigger key={b} value={b}>
                {table.biomeLabels[b]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <Button size="lg" onClick={store.rollAll} data-testid="roll-button">
        Бросить локацию
      </Button>

      {roll ? (
        <ResultCard
          table={table}
          roll={roll}
          onRerollLandmark={store.rerollLandmark}
          onRerollDetail={store.rerollDetail}
        />
      ) : null}

      <ReferenceTables table={table} biome={biome} roll={roll} />
    </div>
  );
}

interface ResultCardProps<Biome extends string> {
  table: LocationTable<Biome>;
  roll: Roll<Biome>;
  onRerollLandmark: () => void;
  onRerollDetail: () => void;
}

function ResultCard<Biome extends string>({
  table,
  roll,
  onRerollLandmark,
  onRerollDetail,
}: ResultCardProps<Biome>) {
  const landmark = table.landmarks[roll.biome][roll.landmarkIndex] as
    | LocationTableD20[number]
    | undefined;
  const detail = table.details[roll.detailIndex] as LocationTableD20[number] | undefined;
  if (!landmark || !detail) return null;

  return (
    <Card data-testid="result-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs uppercase tracking-wider text-text-muted">
            Локация · {table.biomeLabels[roll.biome]}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <ResultRow
          label="Ориентир"
          rollLabel={`d20 = ${roll.landmarkIndex + 1}`}
          ru={landmark.ru}
          question={landmark.question}
          onReroll={onRerollLandmark}
          rerollLabel="Перебросить ориентир"
          testId="result-landmark"
        />
        <ResultRow
          label="Деталь"
          rollLabel={`d20 = ${roll.detailIndex + 1}`}
          ru={detail.ru}
          question={detail.question}
          onReroll={onRerollDetail}
          rerollLabel="Перебросить деталь"
          testId="result-detail"
        />
      </CardContent>
    </Card>
  );
}

interface ResultRowProps {
  label: string;
  rollLabel: string;
  ru: string;
  question?: string;
  onReroll: () => void;
  rerollLabel: string;
  testId: string;
}

function ResultRow({
  label,
  rollLabel,
  ru,
  question,
  onReroll,
  rerollLabel,
  testId,
}: ResultRowProps) {
  return (
    <div className="flex items-start justify-between gap-4" data-testid={testId}>
      <div className="flex-1">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-xs uppercase tracking-wider text-text-muted">
            {label}
          </span>
          <span className="font-mono text-xs text-text-muted">{rollLabel}</span>
        </div>
        <p className="mt-2 font-display text-2xl">{ru}</p>
        {question ? (
          <p className="mt-1 italic text-sm text-text-muted">
            <em>{question}</em>
          </p>
        ) : null}
      </div>
      <Button
        variant="outline"
        size="icon"
        onClick={onReroll}
        aria-label={rerollLabel}
        title={rerollLabel}
      >
        <RefreshCw />
      </Button>
    </div>
  );
}

interface ReferenceTablesProps<Biome extends string> {
  table: LocationTable<Biome>;
  biome: Biome;
  roll: Roll<Biome> | null;
}

function ReferenceTables<Biome extends string>({
  table,
  biome,
  roll,
}: ReferenceTablesProps<Biome>) {
  const highlightLandmark = roll && roll.biome === biome ? roll.landmarkIndex : null;
  const highlightDetail = roll ? roll.detailIndex : null;
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <ReferenceTable
        title={`Ориентир · ${table.biomeLabels[biome]}`}
        rows={table.landmarks[biome]}
        highlightIndex={highlightLandmark}
        testId="reference-landmarks"
      />
      <ReferenceTable
        title="Деталь локации"
        rows={table.details}
        highlightIndex={highlightDetail}
        testId="reference-details"
      />
    </div>
  );
}

interface ReferenceTableProps {
  title: string;
  rows: LocationTableD20;
  highlightIndex: number | null;
  testId: string;
}

function ReferenceTable({ title, rows, highlightIndex, testId }: ReferenceTableProps) {
  return (
    <section data-testid={testId}>
      <h3 className="font-mono text-xs uppercase tracking-wider text-text-muted">{title}</h3>
      <ul className="mt-3 divide-y divide-border">
        {rows.map((row, i) => {
          const isHit = i === highlightIndex;
          return (
            <li
              key={i}
              data-row-index={i}
              data-hit={isHit ? 'true' : undefined}
              className={`flex gap-3 px-2 py-1.5 ${
                isHit
                  ? 'border-l-2 border-primary bg-primary/10 font-semibold text-text'
                  : 'text-text-muted'
              }`}
            >
              <span className="w-6 font-mono text-xs">{i + 1}</span>
              <span className="flex-1 text-sm">{row.ru}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
