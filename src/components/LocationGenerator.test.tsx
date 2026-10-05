import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { mausritterLocations } from '@/data/mausritter/locations';
import { mockCrypto } from '@/test-utils/mock-crypto';
import { LocationGenerator } from './LocationGenerator';

/**
 * Тесты компонента — только presentation-слой:
 * рендер, доступность по data-testid и aria-label, маршрутизация кликов в store.
 * Бизнес-логика state-машины бросков покрыта в src/stores/location-store.test.ts.
 */

describe('LocationGenerator (Preact presentation)', () => {
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

  test('сразу после монтирования показан результат с обеими частями', async () => {
    restoreCrypto = mockCrypto([0, 2]);
    render(<LocationGenerator table={mausritterLocations} />);

    expect(screen.getByTestId('result-card')).toBeDefined();
    await waitFor(() => {
      expect(screen.getByTestId('result-landmark').textContent).toContain(
        mausritterLocations.landmarks.countryside.rows[0].ru,
      );
      expect(screen.getByTestId('result-detail').textContent).toContain(
        mausritterLocations.details.rows[2].ru,
      );
    });
  });

  test('кнопки переброса частей имеют доступные подписи', async () => {
    restoreCrypto = mockCrypto([0, 0]);
    render(<LocationGenerator table={mausritterLocations} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /перебросить ориентир/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /перебросить деталь/i })).toBeDefined();
    });
  });

  test('подсветка строки в справочной таблице соответствует индексу из стора', async () => {
    restoreCrypto = mockCrypto([4, 11]);
    render(<LocationGenerator table={mausritterLocations} />);

    await waitFor(() => {
      const landmarkTable = screen.getByTestId('reference-landmarks');
      expect(landmarkTable.querySelector('[data-hit="true"]')?.getAttribute('data-row-index')).toBe(
        '4',
      );

      const detailTable = screen.getByTestId('reference-details');
      expect(detailTable.querySelector('[data-hit="true"]')?.getAttribute('data-row-index')).toBe(
        '11',
      );
    });
  });

  test('detail.question рендерится italic под основным значением', async () => {
    restoreCrypto = mockCrypto([0, 0]);
    render(<LocationGenerator table={mausritterLocations} />);
    await waitFor(() => {
      const detail = screen.getByTestId('result-detail');
      const em = detail.querySelector('em');
      expect(em?.textContent).toBe(mausritterLocations.details.rows[0].question);
    });
  });

  test('клик «Бросить локацию» дёргает rollAll стора (UI обновляется)', async () => {
    restoreCrypto = mockCrypto([0, 0, 5, 7]);
    render(<LocationGenerator table={mausritterLocations} />);

    await waitFor(() => {
      expect(screen.getByTestId('result-landmark').textContent).toContain(
        mausritterLocations.landmarks.countryside.rows[0].ru,
      );
    });
    fireEvent.click(screen.getByTestId('roll-button'));

    await waitFor(() => {
      expect(screen.getByTestId('result-landmark').textContent).toContain(
        mausritterLocations.landmarks.countryside.rows[5].ru,
      );
      expect(screen.getByTestId('result-detail').textContent).toContain(
        mausritterLocations.details.rows[7].ru,
      );
    });
  });

  test('result-карточка обёрнута Skeleton и присутствует в DOM (защита от layout-shift)', async () => {
    restoreCrypto = mockCrypto([0, 0]);
    render(<LocationGenerator table={mausritterLocations} />);

    const card = screen.getByTestId('result-card');
    expect(card.querySelector('[data-slot="skeleton"]')).not.toBeNull();
    await waitFor(() => {
      expect(card.querySelector('[data-loading="true"]')).toBeNull();
    });
  });

  test('смена биома в Tabs обновляет UI до результата нового биома', async () => {
    restoreCrypto = mockCrypto([0, 0, 11, 4]);
    render(<LocationGenerator table={mausritterLocations} />);

    await waitFor(() => {
      expect(screen.getByTestId('result-landmark').textContent).toContain(
        mausritterLocations.landmarks.countryside.rows[0].ru,
      );
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Лес' }));

    await waitFor(() => {
      expect(screen.getByTestId('result-landmark').textContent).toContain(
        mausritterLocations.landmarks.forest.rows[11].ru,
      );
    });
  });
});
