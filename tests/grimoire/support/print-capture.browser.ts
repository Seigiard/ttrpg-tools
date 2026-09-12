import { printHTML } from '@vivliostyle/core';

import { renderBook } from '../../../src/features/grimoire/core/render-book';
import { mountBrowserTransport } from './browser-transport';
import type { PrintCaptureSurface } from './print-capture';

function serializeDocument(document: Document): string {
  const { doctype } = document;
  const doctypeHtml = doctype ? new XMLSerializer().serializeToString(doctype) : '';
  return doctypeHtml + document.documentElement.outerHTML;
}

function renderPrintReadyHtml(source: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const html = renderBook({ source });
    printHTML(html, {
      title: 'Grimoire Press',
      printCallback: (iframeWindow) => resolve(serializeDocument(iframeWindow.document)),
      errorCallback: (message) =>
        reject(new Error(`Vivliostyle failed to prepare the book for printing: ${message}`)),
      hideIframe: true,
      removeIframe: true,
    });
  });
}

mountBrowserTransport<PrintCaptureSurface>(() => ({
  renderPrintReadyHtml: ({ source }) => renderPrintReadyHtml(source),
}));
