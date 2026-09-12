import { paginate } from '../../../src/features/grimoire/adapters/pagination';
import { renderBook } from '../../../src/features/grimoire/core/render-book';
import { defaultRuTheme } from '../../../src/features/grimoire/core/themes/default-ru/theme';
import type { BookTestSurface } from './book';
import {
  observeAuthoredPageLayout,
  observeBookLayout,
  observeFlowingHeaders,
} from './private/vivliostyle-observer';
import {
  createObservationScheduler,
  type ObservationScheduler,
} from './private/observation-scheduler';

function renderWithAdversarialThemeCss(source: string, adversarialThemeCss?: string): string {
  const html = renderBook({ source });
  if (adversarialThemeCss === undefined) return html;

  const themeStart = html.indexOf(defaultRuTheme.css);
  if (themeStart === -1) throw new Error('the rendered book does not contain the default-ru Theme');
  const themeEnd = themeStart + defaultRuTheme.css.length;
  return `${html.slice(0, themeEnd)}\n${adversarialThemeCss}${html.slice(themeEnd)}`;
}

export function createBookTestSurface(
  container: HTMLElement,
  observe: ObservationScheduler = createObservationScheduler(),
): BookTestSurface {
  return {
    pageCount: ({ source }) =>
      observe(async () => {
        const result = await paginate(container, renderBook({ source }));
        return result.pageCount;
      }),
    layout: ({ source, adversarialThemeCss }) =>
      observe(async () => {
        const result = await paginate(
          container,
          renderWithAdversarialThemeCss(source, adversarialThemeCss),
        );
        return observeBookLayout(container, result);
      }),
    authoredPage: ({ source, adversarialThemeCss }) =>
      observe(async () => {
        const result = await paginate(
          container,
          renderWithAdversarialThemeCss(source, adversarialThemeCss),
        );
        return observeAuthoredPageLayout(container, result);
      }),
    flowingHeaders: ({ source, adversarialThemeCss }) =>
      observe(async () => {
        await paginate(container, renderWithAdversarialThemeCss(source, adversarialThemeCss));
        return observeFlowingHeaders(container);
      }),
  };
}
