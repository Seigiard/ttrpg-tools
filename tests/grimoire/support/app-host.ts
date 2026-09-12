import { mountBrowserTransport } from './browser-transport';
import type { AppTestSurface } from './private/app-session';

mountBrowserTransport<AppTestSurface>(async () => {
  const { mountAppHost } = await import('./private/app-mounting');
  return mountAppHost(new URLSearchParams(location.search).get('scenario'));
});
