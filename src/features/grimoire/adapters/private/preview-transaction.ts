import type { PaginationOptions } from '../pagination';
import type { PreviewTransaction, PreviewTransactionFactory } from './create-pagination';

const PREVIEW_DOCUMENT_MARKER = 'data-grimoire-preview-document';

interface ContainerSnapshot {
  readonly children: readonly ChildNode[];
  readonly attributes: ReadonlyArray<readonly [string, string]>;
}

export function createBrowserPreviewTransactionFactory(): PreviewTransactionFactory {
  return {
    create(container, options) {
      const mode = options.mode ?? modeFromCurrentPreview(container);
      return mode === 'isolated'
        ? createIsolatedTransaction(container)
        : createDirectTransaction(container);
    },
  };
}

function modeFromCurrentPreview(container: HTMLElement): NonNullable<PaginationOptions['mode']> {
  return container.querySelector(`:scope > iframe[${PREVIEW_DOCUMENT_MARKER}]`) === null
    ? 'direct'
    : 'isolated';
}

function snapshotContainer(container: HTMLElement): ContainerSnapshot {
  return {
    children: Array.from(container.childNodes),
    attributes: Array.from(
      container.attributes,
      (attribute) => [attribute.name, attribute.value] as const,
    ),
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

function createDirectTransaction(container: HTMLElement): PreviewTransaction {
  const snapshot = snapshotContainer(container);
  const candidate = container.ownerDocument.createElement('div');
  candidate.style.cssText = directCandidateStyle(container, snapshot);
  container.append(candidate);

  return {
    viewportElement: candidate,
    fitToScreen: false,
    commit() {
      const candidateAttributes = snapshotContainer(candidate).attributes.filter(([name]) =>
        name.startsWith('data-vivliostyle-'),
      );
      container.replaceChildren(...Array.from(candidate.childNodes));
      restoreAttributes(container, {
        children: [],
        attributes: [...snapshot.attributes, ...candidateAttributes],
      });
    },
    rollback() {
      if (candidate.isConnected) candidate.remove();
      restoreContainer(container, snapshot);
    },
  };
}

function directCandidateStyle(container: HTMLElement, snapshot: ContainerSnapshot): string {
  if (snapshot.children.length === 0) {
    return ['display:contents', 'pointer-events:none'].join(';');
  }

  const geometry = [
    `width:${previewWidth(container)}px`,
    `height:${previewHeight(container)}px`,
    'visibility:hidden',
    'pointer-events:none',
  ];
  return ['position:absolute', 'left:0', 'top:0', ...geometry].join(';');
}

function previewWidth(container: HTMLElement): number {
  return Math.max(
    container.clientWidth,
    container.getBoundingClientRect().width,
    container.ownerDocument.documentElement.clientWidth,
    container.ownerDocument.defaultView?.innerWidth ?? 0,
    1,
  );
}

function previewHeight(container: HTMLElement): number {
  return Math.max(
    container.clientHeight,
    container.getBoundingClientRect().height,
    container.ownerDocument.documentElement.clientHeight,
    container.ownerDocument.defaultView?.innerHeight ?? 0,
    1,
  );
}

function createIsolatedTransaction(container: HTMLElement): PreviewTransaction {
  const snapshot = snapshotContainer(container);
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
    commit() {
      installIsolatedInteractionGuards(container, frameDocument, frameWindow);
      frame.removeAttribute('aria-hidden');
      frame.removeAttribute('tabindex');
      frame.style.cssText = 'display:block;width:100%;height:100%;border:0';
      for (const child of snapshot.children) child.remove();
    },
    rollback() {
      frame.remove();
      restoreAttributes(container, snapshot);
    },
  };
}

function installIsolatedInteractionGuards(
  container: HTMLElement,
  frameDocument: Document,
  frameWindow: Window,
): void {
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
}
