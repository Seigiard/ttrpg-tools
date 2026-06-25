import { useStore } from '@nanostores/react';
import { useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Season, WeatherTable } from '@/data/types';
import { createWeatherStore, type WeatherRoll } from '@/stores/weather-store';

interface Props {
  table: WeatherTable;
}

export function WeatherGenerator({ table }: Props) {
  // useMemo гарантирует, что стор создаётся один раз на жизнь компонента.
  const store = useMemo(() => createWeatherStore(table), [table]);
  const season = useStore(store.$season);
  const roll = useStore(store.$roll);

  // Первый автоматический бросок на клиенте — не в store-init, иначе SSR-снепшот
  // и клиент разойдутся и hydration сломается.
  useEffect(() => {
    if (store.$roll.get() === null) {
      store.rollWeather();
    }
  }, [store]);

  const handleSeasonChange = (next: string | number | null) => {
    if (next === null) return;
    store.setSeason(next as Season);
  };

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <span className="font-mono text-xs uppercase tracking-wider text-text-muted">Сезон</span>
        <Tabs value={season} onValueChange={handleSeasonChange}>
          <TabsList>
            {table.seasons.map((s) => (
              <TabsTrigger key={s} value={s}>
                {table.seasonLabels[s]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <Button size="lg" onClick={store.rollWeather} data-testid="roll-button">
        Бросить погоду
      </Button>

      {roll ? <ResultCard table={table} season={season} roll={roll} /> : null}

      <ReferenceTable table={table} season={season} roll={roll} />
    </div>
  );
}

interface ResultCardProps {
  table: WeatherTable;
  season: Season;
  roll: WeatherRoll;
}

function ResultCard({ table, season, roll }: ResultCardProps) {
  const row = table.rows[roll.rowIndex];
  const cell = row?.cells[season];
  if (!cell) return null;

  return (
    <Card data-testid="result-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs uppercase tracking-wider text-text-muted">
            Погода · {table.seasonLabels[season]}
          </span>
          <span className="font-mono text-xs text-text-muted">2d6 = {roll.sum}</span>
        </div>
      </CardHeader>
      <CardContent>
        <div data-testid="result-weather" data-harsh={cell.harsh ? 'true' : undefined}>
          <p className="font-display text-3xl">{cell.ru}</p>
          {cell.harsh ? (
            <p className="mt-3 text-sm text-warning">
              Не подходит для путешествия. За каждую вахту в пути каждая мышь проходит спасбросок
              силы или получает карточку состояния «Изнурён».
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

interface ReferenceTableProps {
  table: WeatherTable;
  season: Season;
  roll: WeatherRoll | null;
}

function ReferenceTable({ table, season, roll }: ReferenceTableProps) {
  const hitRow = roll ? roll.rowIndex : null;
  return (
    <section data-testid="reference-weather">
      <h3 className="font-mono text-xs uppercase tracking-wider text-text-muted">
        Таблица погоды · 2d6
      </h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-2 py-2 text-left font-mono text-xs font-medium uppercase tracking-wider text-text-muted">
                2d6
              </th>
              {table.seasons.map((s) => (
                <th
                  key={s}
                  data-season={s}
                  className={`px-2 py-2 text-left font-mono text-xs font-medium uppercase tracking-wider ${
                    s === season ? 'text-primary' : 'text-text-muted'
                  }`}
                >
                  {table.seasonLabels[s]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => {
              const rangeLabel = row.min === row.max ? String(row.min) : `${row.min}–${row.max}`;
              const isHitRow = i === hitRow;
              return (
                <tr
                  key={rangeLabel}
                  data-row-index={i}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-2 py-1.5 font-mono text-xs text-text-muted">{rangeLabel}</td>
                  {table.seasons.map((s) => {
                    const c = row.cells[s];
                    const isHit = isHitRow && s === season;
                    const tone = isHit
                      ? 'border-l-2 border-primary bg-primary/10 text-text'
                      : s === season
                        ? 'text-text'
                        : 'text-text-muted';
                    return (
                      <td
                        key={s}
                        data-season={s}
                        data-hit={isHit ? 'true' : undefined}
                        className={`px-2 py-1.5 ${c.harsh ? 'font-semibold' : ''} ${tone}`}
                      >
                        {c.ru}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-text-muted">
        <span className="font-semibold text-text">Жирным</span> — погода, не подходящая для
        путешествия.
      </p>
    </section>
  );
}
