import { CoreViewer, type Payload } from '@vivliostyle/core';

import { EngineTimeoutError } from '../engine-timeout';
import type {
  OverflowingPage,
  PaginationOptions,
  PaginationResult,
} from '../pagination';
import type { Schedule, Scheduler } from './scheduler';

const PAGINATION_TIMEOUT_SECONDS = 30;

interface PaginationTarget {
  readonly viewportElement: HTMLElement;
  readonly viewerWindow?: Window;
  readonly fitToScreen: boolean;
  commit(): void;
  restore(): void;
}

interface ContainerSnapshot {
  readonly children: readonly ChildNode[];
  readonly attributes: ReadonlyArray<readonly [string, string]>;
}

export function createPagination(
  scheduler: Scheduler,
): (
  container: HTMLElement,
  html: string,
  options?: PaginationOptions,
) => Promise<PaginationResult> {
  return function paginate(
    container: HTMLElement,
    html: string,
    options: PaginationOptions = {},
  ): Promise<PaginationResult> {
    return new Promise((resolve, reject) => {
      const mode = options.mode ?? 'direct';
      const snapshot: ContainerSnapshot = {
        children: Array.from(container.childNodes),
        attributes: Array.from(
          container.attributes,
          (attribute) => [attribute.name, attribute.value] as const,
        ),
      };
      let target: PaginationTarget | undefined;
      let viewer: CoreViewer | undefined;
      let blobUrl: string | undefined;
      let timeout: Schedule | undefined;
      let settled = false;
      let latestEpageCount: number | undefined;

      const onNav = (payload: Payload): void => {
        if (settled) return;
        latestEpageCount = payload.epageCount;
        armTimeout();
      };
      const onLoaded = (payload: Payload): void => {
        if (settled || viewer === undefined) return;
        try {
          const pageSizes = viewer.getPageSizes();
          const overflowingPages = findOverflowingPages(
            target?.viewportElement ?? container,
          );
          target?.commit();
          settled = true;
          cleanup();
          resolve({
            pageCount: latestEpageCount ?? payload.epageCount,
            pageSizes,
            overflowingPages,
          });
        } catch (error) {
          fail(error);
        }
      };
      const onError = (payload: Payload): void => {
        fail(
          new Error(
            `Vivliostyle failed to paginate the book: ${JSON.stringify(payload.content)}`,
          ),
        );
      };
      const restoreLastGoodRender = (): void => {
        if (target !== undefined) {
          target.restore();
          return;
        }

        if (mode === 'direct') restoreContainer(container, snapshot);
      };
      const cleanup = (): void => {
        if (timeout !== undefined) scheduler.cancel(timeout);
        if (blobUrl !== undefined) URL.revokeObjectURL(blobUrl);
        viewer?.removeListener('nav', onNav);
        viewer?.removeListener('loaded', onLoaded);
        viewer?.removeListener('error', onError);
      };
      const fail = (error: unknown): void => {
        if (settled) return;
        settled = true;
        cleanup();
        restoreLastGoodRender();
        reject(error);
      };
      const armTimeout = (): void => {
        if (timeout !== undefined) scheduler.cancel(timeout);
        timeout = scheduler.schedule(
          () => fail(new EngineTimeoutError(PAGINATION_TIMEOUT_SECONDS)),
          PAGINATION_TIMEOUT_SECONDS * 1000,
        );
      };

      try {
        target = createPaginationTarget(container, snapshot, mode);
        viewer = new CoreViewer(
          { viewportElement: target.viewportElement, window: target.viewerWindow },
          {
            autoResize: false,
            fitToScreen: target.fitToScreen,
            allowScripts: false,
          },
        );
        blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
        viewer.addListener('nav', onNav);
        viewer.addListener('loaded', onLoaded);
        viewer.addListener('error', onError);
        armTimeout();
        viewer.loadDocument(blobUrl);
      } catch (error) {
        fail(error);
      }
    });
  };
}

function restoreAttributes(element: HTMLElement, snapshot: ContainerSnapshot): void {
  for (const { name } of Array.from(element.attributes)) element.removeAttribute(name);
  for (const [name, value] of snapshot.attributes) element.setAttribute(name, value);
}

function restoreContainer(element: HTMLElement, snapshot: ContainerSnapshot): void {
  element.replaceChildren(...snapshot.children);
  restoreAttributes(element, snapshot);
}

function createPaginationTarget(
  container: HTMLElement,
  snapshot: ContainerSnapshot,
  mode: NonNullable<PaginationOptions['mode']>,
): PaginationTarget {
  if (mode === 'direct') {
    container.replaceChildren();
    return {
      viewportElement: container,
      fitToScreen: false,
      commit: () => {},
      restore: () => {
        restoreContainer(container, snapshot);
      },
    };
  }

  const frame = container.ownerDocument.createElement('iframe');
  frame.dataset.grimoirePreviewDocument = '';
  frame.title = 'Paginated book preview';
  frame.tabIndex = -1;
  frame.setAttribute('sandbox', 'allow-same-origin');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = [
    'position:fixed',
    'left:-10000px',
    'top:0',
    `width:${Math.max(container.clientWidth, 1)}px`,
    `height:${Math.max(container.clientHeight, 1)}px`,
    'border:0',
    'visibility:hidden',
  ].join(';');
  container.append(frame);

  const frameDocument = frame.contentDocument;
  const frameWindow = frame.contentWindow;
  if (frameDocument === null || frameWindow === null) {
    frame.remove();
    throw new Error('Could not create an isolated preview document');
  }

  frameDocument.documentElement.style.height = '100%';
  frameDocument.body.style.cssText = 'height:100%;margin:0';
  const viewportElement = frameDocument.createElement('div');
  viewportElement.style.cssText = 'width:100%;height:100%';
  frameDocument.body.replaceChildren(viewportElement);

  return {
    viewportElement,
    viewerWindow: frameWindow,
    fitToScreen: true,
    commit: () => {
      const parentWindow = container.ownerDocument.defaultView;
      const frameGlobal = frameWindow as Window & typeof globalThis;
      frameDocument.addEventListener(
        'click',
        (event) => {
          const eventTarget = event.target;
          if (!(eventTarget instanceof frameGlobal.Element)) return;

          const anchor = eventTarget.closest('a[href]');
          const href = anchor?.getAttribute('href')?.trim();
          if (href === undefined || href.startsWith('#')) return;

          event.preventDefault();
          if (parentWindow === null) return;

          let destination: URL;
          try {
            destination = new URL(href, parentWindow.location.href);
          } catch {
            return;
          }
          if (!['http:', 'https:', 'mailto:', 'tel:'].includes(destination.protocol)) return;
          parentWindow.open(destination.href, '_blank', 'noopener,noreferrer');
        },
        true,
      );
      frameDocument.addEventListener('submit', (event) => event.preventDefault(), true);

      frame.removeAttribute('aria-hidden');
      frame.removeAttribute('tabindex');
      frame.style.cssText = 'display:block;width:100%;height:100%;border:0';
      for (const child of snapshot.children) child.remove();
    },
    restore: () => {
      frame.remove();
    },
  };
}

function findOverflowingPages(container: HTMLElement): OverflowingPage[] {
  const physicalPagesByLine = new Map<number, Set<number>>();

  for (const element of container.querySelectorAll('[data-grimoire-page][data-line]')) {
    const line = Number(element.getAttribute('data-line'));
    const physicalPage = element.closest('[data-vivliostyle-page-index]');
    if (!Number.isInteger(line) || physicalPage === null) continue;

    const index = Number(physicalPage.getAttribute('data-vivliostyle-page-index'));
    if (!Number.isInteger(index)) continue;

    const indices = physicalPagesByLine.get(line) ?? new Set<number>();
    indices.add(index);
    physicalPagesByLine.set(line, indices);
  }

  return Array.from(physicalPagesByLine)
    .filter(([, indices]) => indices.size > 1)
    .map(([line, indices]) => ({ line, pages: indices.size }))
    .toSorted((left, right) => left.line - right.line);
}
