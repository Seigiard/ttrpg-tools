import { paginate } from '../../../src/features/grimoire/adapters/pagination';
import { renderBook } from '../../../src/features/grimoire/core/render-book';
import { defaultRuTheme } from '../../../src/features/grimoire/core/themes/default-ru/theme';
import type { BookTestSurface } from './book';
import { observeBookLayout, observeFlowingHeaders } from './private/vivliostyle-observer';

function renderWithExtraThemeCss(source: string, extraThemeCss?: string): string {
  const html = renderBook({ source });
  if (extraThemeCss === undefined) return html;

  const themeStart = html.indexOf(defaultRuTheme.css);
  if (themeStart === -1) throw new Error('the rendered book does not contain the default-ru Theme');
  const themeEnd = themeStart + defaultRuTheme.css.length;
  return `${html.slice(0, themeEnd)}\n${extraThemeCss}${html.slice(themeEnd)}`;
}

export function createBookTestSurface(container: HTMLElement): BookTestSurface {
  let previousObservation = Promise.resolve();

  const observe = <Result>(operation: () => Promise<Result>): Promise<Result> => {
    const result = previousObservation.then(operation, operation);
    previousObservation = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  return {
    pageCount: ({ source }) =>
      observe(async () => {
        const result = await paginate(container, renderBook({ source }));
        return result.pageCount;
      }),
    layout: ({ source, extraThemeCss }) =>
      observe(async () => {
        const result = await paginate(container, renderWithExtraThemeCss(source, extraThemeCss));
        return observeBookLayout(container, result);
      }),
    flowingHeaders: ({ source, extraThemeCss }) =>
      observe(async () => {
        await paginate(container, renderWithExtraThemeCss(source, extraThemeCss));
        return observeFlowingHeaders(container);
      }),
  };
}
