import type { BookTestSurface } from './book';
import { mountBrowserTransport } from './browser-transport';

mountBrowserTransport<BookTestSurface>(async () => {
  const { createBookTestSurface } = await import('./book.browser');
  const container = document.querySelector<HTMLElement>('#real-engine-host');
  if (container === null) throw new Error('Real-engine host container is missing');
  return createBookTestSurface(container);
});
