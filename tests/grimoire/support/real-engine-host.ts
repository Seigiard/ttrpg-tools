import type { BookTestSurface } from './book';
import { mountBrowserTransport } from './browser-transport';
import { createObservationScheduler } from './private/observation-scheduler';
import type { PrintingTestSurface } from './printing';
import type { ThemeTestSurface } from './theme';

type RealEngineTestSurface = BookTestSurface & ThemeTestSurface & PrintingTestSurface;

mountBrowserTransport<RealEngineTestSurface>(async () => {
  const { createBookTestSurface } = await import('./book.browser');
  const { createPrintingTestSurface } = await import('./printing.browser');
  const { createThemeTestSurface } = await import('./theme.browser');
  const container = document.querySelector<HTMLElement>('#real-engine-host');
  if (container === null) throw new Error('Real-engine host container is missing');
  const observe = createObservationScheduler();
  return {
    ...createBookTestSurface(container, observe),
    ...createThemeTestSurface(container, observe),
    ...createPrintingTestSurface(),
  };
});
