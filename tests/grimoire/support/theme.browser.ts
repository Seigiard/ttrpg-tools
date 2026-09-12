import { paginate } from '../../../src/features/grimoire/adapters/pagination';
import { renderBook } from '../../../src/features/grimoire/core/render-book';
import type { ThemeTestSurface } from './theme';
import {
  createObservationScheduler,
  type ObservationScheduler,
} from './private/observation-scheduler';
import {
  observeMarginBoxFonts,
  observeRenderedElementFonts,
} from './private/theme-observer';

export function createThemeTestSurface(
  container: HTMLElement,
  observe: ObservationScheduler = createObservationScheduler(),
): ThemeTestSurface {
  return {
    renderedElementFonts: ({ source }) =>
      observe(async () => observeRenderedElementFonts(renderBook({ source }))),
    marginBoxFonts: ({ source }) =>
      observe(async () => {
        await paginate(container, renderBook({ source }));
        return observeMarginBoxFonts(container);
      }),
  };
}
