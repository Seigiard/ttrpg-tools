import type { EditorHandle } from "../../../src/features/grimoire/adapters/editor";

export {};

declare global {
  interface PageInspection {
    pageCount: number;
    pageSizes: ReadonlyArray<{ width: number; height: number }>;
    positions: Record<string, { x?: number; y?: number; pageIndex: number | null }>;
  }

  /** One element's position on the page it landed on: the page's own index, the
   * element's offset from that page's top-left corner in CSS pixels, its own
   * height, and the height of the whole sheet it landed on. The last two are what
   * make a box anchored to the foot of the page measurable. */
  interface PageBox {
    pageIndex: number;
    x: number;
    y: number;
    height: number;
    pageHeight: number;
  }

  interface PageMeasurement {
    pageCount: number;
    /** Keyed `line-<data-line>` for a rendered block, `probe-<data-probe>` for an
     * element the book's own source marked. Absent when nothing carried the key. */
    boxes: Record<string, PageBox | undefined>;
  }

  interface HeaderInspection {
    pageIndex: number;
    header: string | undefined;
    pageNumber: string | undefined;
  }

  interface MarginBoxFontInspection {
    topCenter: string | undefined;
    bottomCenter: string | undefined;
  }

  interface ContainerAfterFailure {
    rejection: string | undefined;
    before?: string;
    after: string;
    attributesBefore?: string;
    attributesAfter: string;
  }

  interface Window {
    __paginateBook: (source: string) => Promise<number>;
    __paginateAndInspect: (source: string, extraThemeCss?: string) => Promise<PageInspection>;
    __paginateAndMeasure: (source: string) => Promise<PageMeasurement>;
    __paginateAndInspectHeaders: (source: string, extraThemeCss?: string) => Promise<HeaderInspection[]>;
    __editor?: EditorHandle;
    __repaintCount: number;
    __openedPreviewLinks: string[];
  }
}
