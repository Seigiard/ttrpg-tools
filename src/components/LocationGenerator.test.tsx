import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { mausritterLocations } from '@/data/mausritter/locations';
import { LocationGenerator } from './LocationGenerator';

/**
 * Тесты компонента — только presentation-слой:
 * рендер, доступность по data-testid и aria-label, маршрутизация кликов в store.
 * Бизнес-логика state-машины бросков покрыта в src/stores/location-store.test.ts.
 *
 * Для детерминизма мокаем crypto.getRandomValues — value % sides + 1 даёт
 * индекс на 1 больше mock-значения; используем mock=0 чтобы получить index=0.
 */
function mockCrypto(sequence: number[]) {
  const original = crypto.getRandomValues.bind(crypto);
  let i = 0;
  crypto.getRandomValues = ((buf: Uint32Array) => {
    const value = sequence[i++];
    if (value === undefined) throw new Error('тестовая последовательность исчерпана');
    buf[0] = value;
    return buf;
  }) as typeof crypto.getRandomValues;
  return () => {
    crypto.getRandomValues = original;
  };
}

describe('LocationGenerator (presentation)', () => {
  let restoreCrypto: (() => void) | null = null;

  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    if (restoreCrypto) {
      restoreCrypto();
      restoreCrypto = null;
    }
  });

  test('сразу после монтирования показан результат с обеими частями', () => {
    restoreCrypto = mockCrypto([0, 2]);
    render(<LocationGenerator table={mausritterLocations} />);

    expect(screen.getByTestId('result-card')).toBeDefined();
    expect(screen.getByTestId('result-landmark').textContent).toContain(
      mausritterLocations.landmarks.countryside[0].ru,
    );
    expect(screen.getByTestId('result-detail').textContent).toContain(
      mausritterLocations.details[2].ru,
    );
  });

  test('кнопки переброса частей имеют доступные подписи', () => {
    restoreCrypto = mockCrypto([0, 0]);
    render(<LocationGenerator table={mausritterLocations} />);
    expect(screen.getByRole('button', { name: /перебросить ориентир/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /перебросить деталь/i })).toBeDefined();
  });

  test('подсветка строки в справочной таблице соответствует индексу из стора', () => {
    restoreCrypto = mockCrypto([4, 11]);
    render(<LocationGenerator table={mausritterLocations} />);

    const landmarkTable = screen.getByTestId('reference-landmarks');
    expect(
      landmarkTable.querySelector('[data-hit="true"]')?.getAttribute('data-row-index'),
    ).toBe('4');

    const detailTable = screen.getByTestId('reference-details');
    expect(
      detailTable.querySelector('[data-hit="true"]')?.getAttribute('data-row-index'),
    ).toBe('11');
  });

  test('detail.question рендерится italic под основным значением', () => {
    restoreCrypto = mockCrypto([0, 0]);
    render(<LocationGenerator table={mausritterLocations} />);
    const detail = screen.getByTestId('result-detail');
    const em = detail.querySelector('em');
    expect(em?.textContent).toBe(mausritterLocations.details[0].question);
  });

  test('клик «Бросить локацию» дёргает rollAll стора (UI обновляется)', () => {
    restoreCrypto = mockCrypto([0, 0, 5, 7]);
    render(<LocationGenerator table={mausritterLocations} />);

    fireEvent.click(screen.getByTestId('roll-button'));

    expect(screen.getByTestId('result-landmark').textContent).toContain(
      mausritterLocations.landmarks.countryside[5].ru,
    );
    expect(screen.getByTestId('result-detail').textContent).toContain(
      mausritterLocations.details[7].ru,
    );
  });

  test('смена биома в Tabs обновляет UI до результата нового биома', () => {
    restoreCrypto = mockCrypto([0, 0, 11, 4]);
    render(<LocationGenerator table={mausritterLocations} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Лес' }));

    expect(screen.getByTestId('result-landmark').textContent).toContain(
      mausritterLocations.landmarks.forest[11].ru,
    );
  });
});
