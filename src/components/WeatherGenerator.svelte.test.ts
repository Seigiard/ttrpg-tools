import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { mausritterWeather } from '@/data/mausritter/weather';
import { mockCrypto } from '@/test-utils/mock-crypto';
import WeatherGenerator from './WeatherGenerator.svelte';

describe('WeatherGenerator (presentation)', () => {
  let restoreCrypto: (() => void) | null = null;

  beforeEach(cleanup);

  afterEach(() => {
    if (restoreCrypto) {
      restoreCrypto();
      restoreCrypto = null;
    }
    cleanup();
  });

  test('сразу после монтирования показан результат текущего сезона', () => {
    // #given сумма 2 → строка 0; весна → «Буря с дождём»
    restoreCrypto = mockCrypto([0, 0]);
    // #when the generator mounts
    render(WeatherGenerator, { table: mausritterWeather });
    // #then the current season result is visible
    expect(screen.getByTestId('result-card')).toBeDefined();
    expect(screen.getByTestId('result-weather').textContent).toContain(
      mausritterWeather.rows[0].cells.spring.ru,
    );
  });

  test('суровая погода помечает результат флагом и показывает примечание', () => {
    // #given harsh weather
    restoreCrypto = mockCrypto([0, 0]);
    // #when the generator mounts
    render(WeatherGenerator, { table: mausritterWeather });
    // #then the harsh flag and note are present
    const weather = screen.getByTestId('result-weather');
    expect(weather.getAttribute('data-harsh')).toBe('true');
    expect(weather.textContent).toContain('Изнурён');
  });

  test('мягкая погода не показывает примечание об изнурении', () => {
    // #given сумма 12 → строка 4 «Тепло и ясно» (не суровая)
    restoreCrypto = mockCrypto([5, 5]);
    // #when the generator mounts
    render(WeatherGenerator, { table: mausritterWeather });
    // #then the exhaustion note is absent
    const weather = screen.getByTestId('result-weather');
    expect(weather.getAttribute('data-harsh')).toBeNull();
    expect(weather.textContent).not.toContain('Изнурён');
  });

  test('клик «Бросить погоду» обновляет результат', async () => {
    // #given two deterministic rolls
    restoreCrypto = mockCrypto([0, 0, 5, 5]);
    render(WeatherGenerator, { table: mausritterWeather });
    // #when weather is rerolled
    await fireEvent.click(screen.getByTestId('roll-button'));
    // #then the result changes to the second roll
    expect(screen.getByTestId('result-weather').textContent).toContain(
      mausritterWeather.rows[4].cells.spring.ru,
    );
  });

  test('смена сезона читает ту же строку в новой колонке (без переброса)', async () => {
    // #given сумма 2 → строка 0; смена на зиму → «Метель» (та же строка)
    restoreCrypto = mockCrypto([0, 0]);
    render(WeatherGenerator, { table: mausritterWeather });
    // #when the season tab changes
    await fireEvent.click(screen.getByRole('tab', { name: 'Зима' }));
    // #then the same row is read from the new column
    expect(screen.getByTestId('result-weather').textContent).toContain(
      mausritterWeather.rows[0].cells.winter.ru,
    );
  });

  test('result-карточка обёрнута Skeleton и присутствует в DOM (защита от layout-shift)', () => {
    // #given a mounted generator
    restoreCrypto = mockCrypto([0, 0]);
    render(WeatherGenerator, { table: mausritterWeather });
    // #then skeleton wrappers remain but are not loading after the first roll
    const card = screen.getByTestId('result-card');
    expect(card.querySelector('[data-slot="skeleton"]')).not.toBeNull();
    expect(card.querySelector('[data-loading="true"]')).toBeNull();
  });

  test('подсветка в справочной таблице соответствует строке и сезону', () => {
    // #given сумма 7 (4+3) → строка 2, весна
    restoreCrypto = mockCrypto([3, 2]);
    // #when the generator mounts
    render(WeatherGenerator, { table: mausritterWeather });
    // #then exactly the matching season cell is marked
    const grid = screen.getByTestId('reference-weather');
    const hit = grid.querySelector('[data-hit="true"]');
    expect(hit?.closest('tr')?.getAttribute('data-row-index')).toBe('2');
    expect(hit?.getAttribute('data-season')).toBe('spring');
  });
});
