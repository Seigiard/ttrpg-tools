import { CoreViewer, type Payload } from '@vivliostyle/core';

import type { PaginationSession } from './create-pagination';

export function createVivliostylePaginationSession(): PaginationSession {
  return {
    start(html, target, observer) {
      const viewer = new CoreViewer(
        { viewportElement: target.viewportElement, window: target.viewerWindow },
        {
          autoResize: false,
          fitToScreen: target.fitToScreen,
          allowScripts: false,
        },
      );
      const blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));

      const onNav = (payload: Payload): void => {
        observer.progress(payload.epageCount);
      };
      const onLoaded = (payload: Payload): void => {
        observer.loaded({
          pageCount: payload.epageCount,
          pageSizes: viewer.getPageSizes(),
        });
      };
      const onError = (payload: Payload): void => {
        observer.failed(
          new Error(
            `Vivliostyle failed to paginate the book: ${JSON.stringify(payload.content)}`,
          ),
        );
      };

      viewer.addListener('nav', onNav);
      viewer.addListener('loaded', onLoaded);
      viewer.addListener('error', onError);
      viewer.loadDocument(blobUrl);

      return () => {
        URL.revokeObjectURL(blobUrl);
        viewer.removeListener('nav', onNav);
        viewer.removeListener('loaded', onLoaded);
        viewer.removeListener('error', onError);
      };
    },
  };
}
