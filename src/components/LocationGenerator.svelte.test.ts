import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { mausritterLocations } from '@/data/mausritter/locations';
import { mockCrypto } from '@/test-utils/mock-crypto';
import LocationGenerator from './LocationGenerator.svelte';

describe('LocationGenerator (presentation)', () => {
  let restoreCrypto: (() => void) | null = null;

  beforeEach(cleanup);

  afterEach(() => {
    if (restoreCrypto) {
      restoreCrypto();
      restoreCrypto = null;
    }

    cleanup();
  });

  test('сразу после монтирования показан результат с обеими частями', () => {
    // #given deterministic landmark and detail rolls
    restoreCrypto = mockCrypto([0, 2]);
    // #when the generator mounts
    render(LocationGenerator, { table: mausritterLocations });
    // #then both parts are visible
    expect(screen.getByTestId('result-card')).toBeDefined();
    expect(screen.getByTestId('result-landmark').textContent).toContain(
      mausritterLocations.landmarks.countryside.rows[0].ru,
    );
    expect(screen.getByTestId('result-detail').textContent).toContain(
      mausritterLocations.details.rows[2].ru,
    );
  });

  test('кнопки переброса частей имеют доступные подписи', () => {
    // #given a mounted generator
    restoreCrypto = mockCrypto([0, 0]);
    render(LocationGenerator, { table: mausritterLocations });
    // #then part reroll buttons are accessible by name
    expect(screen.getByRole('button', { name: /перебросить ориентир/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /перебросить деталь/i })).toBeDefined();
  });

  test('подсветка строки в справочной таблице соответствует индексу из стора', () => {
    // #given deterministic row indexes
    restoreCrypto = mockCrypto([4, 11]);
    // #when the generator mounts
    render(LocationGenerator, { table: mausritterLocations });
    // #then both reference tables mark matching rows
    const landmarkTable = screen.getByTestId('reference-landmarks');
    expect(landmarkTable.querySelector('[data-hit="true"]')?.getAttribute('data-row-index')).toBe(
      '4',
    );

    const detailTable = screen.getByTestId('reference-details');
    expect(detailTable.querySelector('[data-hit="true"]')?.getAttribute('data-row-index')).toBe(
      '11',
    );
  });

  test('detail.question рендерится italic под основным значением', () => {
    // #given a detail with a question
    restoreCrypto = mockCrypto([0, 0]);
    // #when the generator mounts
    render(LocationGenerator, { table: mausritterLocations });
    // #then the question is rendered in an italic element
    const detail = screen.getByTestId('result-detail');
    const em = detail.querySelector('em');
    expect(em?.textContent).toBe(mausritterLocations.details.rows[0].question);
  });

  test('клик «Бросить локацию» дёргает rollAll стора (UI обновляется)', async () => {
    // #given two deterministic full rolls
    restoreCrypto = mockCrypto([0, 0, 5, 7]);
    render(LocationGenerator, { table: mausritterLocations });
    // #when the full location rerolls
    await fireEvent.click(screen.getByTestId('roll-button'));
    // #then both parts update
    expect(screen.getByTestId('result-landmark').textContent).toContain(
      mausritterLocations.landmarks.countryside.rows[5].ru,
    );
    expect(screen.getByTestId('result-detail').textContent).toContain(
      mausritterLocations.details.rows[7].ru,
    );
  });

  test('result-карточка обёрнута Skeleton и присутствует в DOM (защита от layout-shift)', () => {
    // #given a mounted generator
    restoreCrypto = mockCrypto([0, 0]);
    render(LocationGenerator, { table: mausritterLocations });
    // #then skeleton wrappers remain but are not loading after the first roll
    const card = screen.getByTestId('result-card');
    expect(card.querySelector('[data-slot="skeleton"]')).not.toBeNull();
    expect(card.querySelector('[data-loading="true"]')).toBeNull();
  });

  test('смена биома в Tabs обновляет UI до результата нового биома', async () => {
    // #given initial roll and a forest reroll
    restoreCrypto = mockCrypto([0, 0, 11, 4]);
    render(LocationGenerator, { table: mausritterLocations });
    // #when the biome changes
    await fireEvent.click(screen.getByRole('tab', { name: 'Лес' }));
    // #then the landmark comes from the forest table
    expect(screen.getByTestId('result-landmark').textContent).toContain(
      mausritterLocations.landmarks.forest.rows[11].ru,
    );
  });
});
