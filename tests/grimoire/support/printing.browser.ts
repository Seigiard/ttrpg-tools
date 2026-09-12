import { printBook } from '../../../src/features/grimoire/adapters/printing';
import { renderBook } from '../../../src/features/grimoire/core/render-book';
import type { PrintingTestSurface } from './printing';

export function createPrintingTestSurface(): PrintingTestSurface {
  return {
    sharedAttempt({ source }) {
      const html = renderBook({ source });
      const first = printBook(html);
      const second = printBook(html);
      return { firstJoinedSecond: first === second };
    },

    async sequentialAttempts({ source }) {
      const html = renderBook({ source });
      const first = printBook(html);
      await first;
      const second = printBook(html);
      return { firstJoinedSecond: first === second };
    },
  };
}
