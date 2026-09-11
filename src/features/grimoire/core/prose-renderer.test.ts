import { describe, expect, test } from 'bun:test';

import { renderProse } from './prose-renderer';

describe('renderProse headings', () => {
  test('marks Markdown headings as structural without marking raw HTML headings', () => {
    const html = renderProse(
      ['## A book section', '', '<h2>A form caption</h2>'].join('\n'),
      4,
    );

    expect(html).toContain(
      '<h2 data-line="4" data-grimoire-structural-heading>A book section</h2>',
    );
    expect(html).toContain('<h2>A form caption</h2>');
    expect(html.match(/data-grimoire-structural-heading/g)).toHaveLength(1);
  });
});
