import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import { Skeleton } from './skeleton';

/**
 * Инвариант: один и тот же узел при loading true/false (меняется только
 * оформление, не наличие/тип) — отсюда нулевой layout-shift. Дети всегда в
 * DOM, потому что именно они задают высоту бокса.
 */
describe('Skeleton', () => {
  afterEach(cleanup);

  test('loading=false: дети читаемы, узел без маскирующих классов', () => {
    const { getByText } = render(<Skeleton loading={false}>Результат</Skeleton>);

    const node = getByText('Результат');
    expect(node.getAttribute('data-slot')).toBe('skeleton');
    expect(node.getAttribute('data-loading')).toBeNull();
    expect(node.getAttribute('aria-hidden')).toBeNull();
    expect(node.className).not.toContain('animate-pulse');
    expect(node.className).not.toContain('text-transparent');
  });

  test('loading=true: дети в DOM (задают высоту), узел маскирован и скрыт от a11y', () => {
    const { getByText } = render(<Skeleton loading>Плейсхолдер</Skeleton>);

    const node = getByText('Плейсхолдер');
    expect(node.getAttribute('data-loading')).toBe('true');
    expect(node.getAttribute('aria-hidden')).toBe('true');
    expect(node.className).toContain('animate-pulse');
    expect(node.className).toContain('text-transparent');
  });

  test('loading=true: интерактивность погашена', () => {
    const { getByText } = render(<Skeleton loading>x</Skeleton>);

    const node = getByText('x');
    expect(node.className).toContain('pointer-events-none');
    expect(node.className).toContain('select-none');
  });

  test('тип узла одинаков в обоих состояниях (инвариант нулевого сдвига)', () => {
    const loaded = render(<Skeleton loading={false}>x</Skeleton>);
    const loadedTag = loaded.getByText('x').tagName;
    cleanup();
    const loading = render(<Skeleton loading>x</Skeleton>);
    const loadingTag = loading.getByText('x').tagName;

    expect(loadingTag).toBe(loadedTag);
    expect(loadingTag).toBe('SPAN');
  });

  test('className от вызывающего домешивается, базовые классы сохранены', () => {
    const { getByText } = render(
      <Skeleton loading className="block">
        x
      </Skeleton>,
    );

    const node = getByText('x');
    expect(node.className).toContain('block');
    expect(node.className).toContain('animate-pulse');
  });
});
