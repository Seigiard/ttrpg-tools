import { describe, expect, test } from 'bun:test';

import { MarkupError, UnknownTagError } from './markup-error';
import { parseBook } from './parse-book';

describe('Grimoire book parser characterization', () => {
  test('keeps bare Markdown as an A5 single-column book', () => {
    expect(parseBook('# Title\n\nText')).toMatchObject({
      size: 'A5',
      theme: undefined,
      blocks: [{ kind: 'section', columns: 1, line: 1 }],
    });
  });

  test('preserves sections and pages in source order', () => {
    const source = [
      '<Book size="A5">',
      '<Section columns="2">',
      'Before.',
      '</Section>',
      '<Page orientation="landscape">',
      'Card.',
      '</Page>',
      '</Book>',
    ].join('\n');

    expect(parseBook(source).blocks).toEqual([
      {
        kind: 'section',
        columns: 2,
        line: 2,
        content: [{ kind: 'prose', source: 'Before.', line: 3 }],
      },
      {
        kind: 'page',
        orientation: 'landscape',
        line: 5,
        content: [{ kind: 'prose', source: 'Card.', line: 6 }],
      },
    ]);
  });

  test('keeps the authored theme declaration without materializing it', () => {
    const parsed = parseBook('<Book theme="default-ru">\nText.\n</Book>');

    expect(parsed.theme).toEqual({ name: 'default-ru', line: 1 });
    expect(parsed).not.toHaveProperty('lang');
  });

  test('reports malformed markup at its source line', () => {
    const source = '<Book>\n<Section>\n<Section>\n</Section>\n</Section>\n</Book>';

    expect(() => parseBook(source)).toThrow(MarkupError);
    try {
      parseBook(source);
    } catch (error) {
      expect((error as MarkupError).line).toBe(3);
    }
  });

  test('keeps unknown capitalized tags distinct from malformed markup', () => {
    try {
      parseBook('Text.\n<PageBrek />');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(UnknownTagError);
      expect(error).toMatchObject({ tag: 'PageBrek', line: 2 });
    }
  });

  test('rejects page-only attributes and breaks inside pages', () => {
    expect(() => parseBook('<Page columns="2">\nCard.\n</Page>')).toThrow(
      'a page has no columns',
    );
    expect(() => parseBook('<Page>\n<PageBreak />\n</Page>')).toThrow(
      'a page is already one page',
    );
  });

  test('keeps shorter fence runs inside a longer fenced block', () => {
    const source = ['````markdown', '```', '<PageBrek />', '````'].join('\n');

    expect(() => parseBook(source)).not.toThrow();
  });
});
