import type {
  MarginBoxFontObservation,
  RenderedElementFontObservation,
} from '../theme';

const RENDERED_ELEMENT_SELECTORS = {
  document: 'body',
  heading: 'h1',
  body: 'p',
  emphasizedBody: 'p em',
} as const;

const MARGIN_BOX_SELECTORS = {
  runningHeader: '[data-vivliostyle-page-margin-box="top-center"]',
  pageNumber: '[data-vivliostyle-page-margin-box="bottom-center"]',
} as const;

function fontFamily(window: Window, element: Element | null): string | undefined {
  return element === null ? undefined : window.getComputedStyle(element).fontFamily;
}

export async function observeRenderedElementFonts(
  html: string,
): Promise<RenderedElementFontObservation> {
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  document.body.appendChild(iframe);

  try {
    await new Promise<void>((resolve) => {
      iframe.onload = () => resolve();
      iframe.srcdoc = html;
    });

    const contentDocument = iframe.contentDocument;
    const contentWindow = iframe.contentWindow;
    if (contentDocument === null || contentWindow === null) {
      throw new Error('Rendered-element font observer iframe did not load');
    }

    return {
      document: fontFamily(
        contentWindow,
        contentDocument.querySelector(RENDERED_ELEMENT_SELECTORS.document),
      ),
      heading: fontFamily(
        contentWindow,
        contentDocument.querySelector(RENDERED_ELEMENT_SELECTORS.heading),
      ),
      body: fontFamily(
        contentWindow,
        contentDocument.querySelector(RENDERED_ELEMENT_SELECTORS.body),
      ),
      emphasizedBody: fontFamily(
        contentWindow,
        contentDocument.querySelector(RENDERED_ELEMENT_SELECTORS.emphasizedBody),
      ),
    };
  } finally {
    iframe.remove();
  }
}

export function observeMarginBoxFonts(container: HTMLElement): MarginBoxFontObservation {
  return {
    runningHeader: fontFamily(
      window,
      container.querySelector(MARGIN_BOX_SELECTORS.runningHeader),
    ),
    pageNumber: fontFamily(
      window,
      container.querySelector(MARGIN_BOX_SELECTORS.pageNumber),
    ),
  };
}
