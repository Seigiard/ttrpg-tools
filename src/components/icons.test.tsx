import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, render } from '@testing-library/preact';
import { RefreshCw } from './icons';

describe('Preact icons', () => {
  afterEach(cleanup);

  test('RefreshCw renders as an inline SVG icon', () => {
    // #given the icon used by reroll buttons
    const { container } = render(<RefreshCw data-testid="refresh" />);

    // #when it renders in Preact
    const icon = container.querySelector('[data-testid="refresh"]');

    // #then the native lucide-preact seam provides an SVG without React compat
    expect(icon?.tagName).toBe('svg');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
  });
});
