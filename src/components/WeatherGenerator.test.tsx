import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { mausritterWeather } from '@/data/mausritter/weather';
import { mockCrypto } from '@/test-utils/mock-crypto';
import { WeatherGenerator } from './WeatherGenerator';

/**
 * Тесты компонента — только presentation-слой: рендер, data-testid,
 * маршрутизация кликов в store. Логика броска покрыта в weather-store.test.ts.
 */

describe('WeatherGenerator (presentation)', () => {
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

  test('сразу после монтирования показан результат текущего сезона', () => {
    // #given сумма 2 → строка 0; весна → «Буря с дождём»
    restoreCrypto = mockCrypto([0, 0]);
    render(<WeatherGenerator table={mausritterWeather} />);

    expect(screen.getByTestId('result-card')).toBeDefined();
    expect(screen.getByTestId('result-weather').textContent).toContain(
      mausritterWeather.rows[0].cells.spring.ru,
    );
  });

  test('суровая погода помечает результат флагом и показывает примечание', () => {
    restoreCrypto = mockCrypto([0, 0]);
    render(<WeatherGenerator table={mausritterWeather} />);

    const weather = screen.getByTestId('result-weather');
    expect(weather.getAttribute('data-harsh')).toBe('true');
    expect(weather.textContent).toContain('Изнурён');
  });

  test('мягкая погода не показывает примечание об изнурении', () => {
    // #given сумма 12 → строка 4 «Тепло и ясно» (не суровая)
    restoreCrypto = mockCrypto([5, 5]);
    render(<WeatherGenerator table={mausritterWeather} />);

    const weather = screen.getByTestId('result-weather');
    expect(weather.getAttribute('data-harsh')).toBeNull();
    expect(weather.textContent).not.toContain('Изнурён');
  });

  test('клик «Бросить погоду» обновляет результат', () => {
    restoreCrypto = mockCrypto([0, 0, 5, 5]);
    render(<WeatherGenerator table={mausritterWeather} />);

    fireEvent.click(screen.getByTestId('roll-button'));

    expect(screen.getByTestId('result-weather').textContent).toContain(
      mausritterWeather.rows[4].cells.spring.ru,
    );
  });

  test('смена сезона читает ту же строку в новой колонке (без переброса)', () => {
    // #given сумма 2 → строка 0; смена на зиму → «Метель» (та же строка)
    restoreCrypto = mockCrypto([0, 0]);
    render(<WeatherGenerator table={mausritterWeather} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Зима' }));

    expect(screen.getByTestId('result-weather').textContent).toContain(
      mausritterWeather.rows[0].cells.winter.ru,
    );
  });

  test('result-карточка обёрнута Skeleton и присутствует в DOM (защита от layout-shift)', () => {
    restoreCrypto = mockCrypto([0, 0]);
    render(<WeatherGenerator table={mausritterWeather} />);

    const card = screen.getByTestId('result-card');
    expect(card.querySelector('[data-slot="skeleton"]')).not.toBeNull();
    expect(card.querySelector('[data-loading="true"]')).toBeNull();
  });

  test('подсветка в справочной таблице соответствует строке и сезону', () => {
    // #given сумма 7 (4+3) → строка 2, весна
    restoreCrypto = mockCrypto([3, 2]);
    render(<WeatherGenerator table={mausritterWeather} />);

    const grid = screen.getByTestId('reference-weather');
    const hit = grid.querySelector('[data-hit="true"]');
    expect(hit?.closest('tr')?.getAttribute('data-row-index')).toBe('2');
    expect(hit?.getAttribute('data-season')).toBe('spring');
  });
});
