import { describe, expect, test } from 'bun:test';

import { MarkupError } from './markup-error';
import { renderBook } from './render-book';

describe('Grimoire standalone book renderer', () => {
  test('reports an unknown Theme at its source line', () => {
    const source = '\n<Book theme="missing">\nText.\n</Book>';

    try {
      renderBook({ source });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(MarkupError);
      expect(error).toMatchObject({
        message: '<Book theme="missing"> on line 2 names an unknown theme',
        line: 2,
      });
    }
  });
});
