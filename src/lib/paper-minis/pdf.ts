import {
  PDFDocument,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  StandardFonts,
  rgb,
  pushGraphicsState,
  popGraphicsState,
  concatTransformationMatrix,
  moveTo,
  lineTo,
  stroke,
  setLineWidth,
  setStrokingGrayscaleColor,
} from 'pdf-lib';
import type { PreparedArtwork, Entry } from './types';
import type { PackResult } from './packing.ts';
import {
  CUT_MARK_ARM_MM,
  CUT_MARK_STROKE_MM,
  PAGE_SIZES_MM,
  SCALE_BAR_BAND_MM,
  printerScale,
  type BackFace,
  type PackOptions,
  type PackedMini,
  type PageSizeKey,
} from './geometry.ts';

export type { PageSizeKey };

const MM_TO_PT = 72 / 25.4;
const mm = (v: number) => v * MM_TO_PT;

const MARK_GREY = 0.5;

// The scale check occupies a reserved band above the packed layout. A print
// dialog shrinks the whole sheet by a few per cent, which no amount of care in
// the layout can undo, so the sheet has to let the user see it happen.
// 100 mm makes a 3% shrink a 3 mm shortfall, visible against any ruler.
export const SCALE_BAR_MM = 100;
const SCALE_BAR_Y_FROM_TOP_MM = 5.5;
const SCALE_BAR_THICKNESS_MM = 0.4;
const SCALE_TICK_MM = 1.5;
const SCALE_MAJOR_TICK_MM = 2.5;
const SCALE_TICK_WIDTH_MM = 0.3;
const SCALE_TEXT_PT = 7;
export const SCALE_BAR_NOTE = 'Print with Scale to Fit. Measure again if this is not 100 mm.';
const TEST_SHEET_INSTRUCTION =
  'Print with Scale to Fit, measure the ruler, then enter the measured length.';
const TEST_SHEET_TICK_WIDTH_MM = 0.2;

export type GenerateOptions = PackOptions;

export async function generatePDF(
  entries: readonly Entry[],
  layout: PackResult,
  opts: GenerateOptions,
): Promise<Uint8Array> {
  if (layout.pages.length === 0) throw new Error('Nothing fits on a page.');
  const pdf = await PDFDocument.create();
  pdf.setTitle('Paper Minis');
  pdf.setCreator('Paper Mini Generator');
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const noteFont = await pdf.embedFont(StandardFonts.Helvetica);

  // Embed only artwork used by a placement. Rows the layout left out must not
  // add their image bytes to the document.
  const faces = new Map<number, FaceImages>();
  const cache = new Map<PreparedArtwork, PDFImage>();
  const embed = async (artwork: PreparedArtwork) => {
    let img = cache.get(artwork);
    if (!img) {
      img = await (artwork.format === 'jpg'
        ? pdf.embedJpg(artwork.bytes)
        : pdf.embedPng(artwork.bytes));
      cache.set(artwork, img);
    }
    return img;
  };
  const placedEntryIndices = new Set(
    layout.pages.flatMap((page) => page.placements.map(({ mini }) => mini.entryIndex)),
  );
  for (const entryIndex of placedEntryIndices) {
    const entry = entries[entryIndex];
    if (!entry?.artwork) throw new Error('Layout refers to an entry without prepared artwork.');
    faces.set(entryIndex, {
      front: await embed(entry.artwork),
      back: entry.backArtwork ? await embed(entry.backArtwork) : undefined,
    });
  }

  const { w: pageWmm, h: pageHmm } = PAGE_SIZES_MM[opts.pageSize];
  const scale = printerScale(opts);
  const scaledPageHmm = pageHmm * scale;
  for (const page of layout.pages) {
    const pdfPage = pdf.addPage([mm(pageWmm), mm(pageHmm)]);
    pdfPage.pushOperators(pushGraphicsState(), concatTransformationMatrix(1 / scale, 0, 0, 1 / scale, 0, 0));
    for (const { mini, xMm, yMm, rotated } of page.placements) {
      if (rotated) {
        // Turn the whole local drawing clockwise about the footprint's top-left.
        pdfPage.pushOperators(
          pushGraphicsState(),
          concatTransformationMatrix(
            0,
            -1,
            1,
            0,
            mm(xMm),
            mm(scaledPageHmm - SCALE_BAR_BAND_MM - yMm),
          ),
        );
        drawMini(pdfPage, mini, faces.get(mini.entryIndex)!, 0, mini.totalHeightMm, font);
        pdfPage.pushOperators(popGraphicsState());
        continue;
      }
      drawMini(
        pdfPage,
        mini,
        faces.get(mini.entryIndex)!,
        xMm,
        scaledPageHmm - SCALE_BAR_BAND_MM - yMm,
        font,
      );
    }
    drawScaleBar(pdfPage, scaledPageHmm, noteFont);
    pdfPage.pushOperators(popGraphicsState());
  }

  return pdf.save();
}

export async function generatePrinterScaleTestSheet(pageSize: PageSizeKey): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Paper Minis printer scale test sheet');
  pdf.setCreator('Paper Mini Generator');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const { w: pageWmm, h: pageHmm } = PAGE_SIZES_MM[pageSize];
  const page = pdf.addPage([mm(pageWmm), mm(pageHmm)]);
  const xMm = (pageWmm - SCALE_BAR_MM) / 2;
  const yMm = pageHmm / 2;

  page.drawRectangle({
    x: mm(xMm),
    y: mm(yMm),
    width: mm(SCALE_BAR_MM),
    height: mm(SCALE_BAR_THICKNESS_MM),
    color: rgb(0, 0, 0),
  });
  for (let tickMm = 0; tickMm <= SCALE_BAR_MM; tickMm++) {
    const length = tickMm % 10 === 0 ? SCALE_MAJOR_TICK_MM * 2 : SCALE_TICK_MM;
    page.drawRectangle({
      x: mm(xMm + Math.min(Math.max(tickMm - TEST_SHEET_TICK_WIDTH_MM / 2, 0), SCALE_BAR_MM - TEST_SHEET_TICK_WIDTH_MM)),
      y: mm(yMm - length),
      width: mm(TEST_SHEET_TICK_WIDTH_MM),
      height: mm(length),
      color: rgb(0, 0, 0),
    });
  }
  const textWidth = font.widthOfTextAtSize(TEST_SHEET_INSTRUCTION, SCALE_TEXT_PT);
  page.drawText(TEST_SHEET_INSTRUCTION, {
    x: (mm(pageWmm) - textWidth) / 2,
    y: mm(yMm - SCALE_MAJOR_TICK_MM * 2 - 5),
    size: SCALE_TEXT_PT,
    font,
    color: rgb(0, 0, 0),
  });
  return pdf.save();
}

type FaceImages = { front: PDFImage; back?: PDFImage };

function drawMini(
  pdfPage: PDFPage,
  mini: PackedMini,
  images: FaceImages,
  xMm: number,
  yTopMm: number,
  font: PDFFont,
) {
  const yBottomMm = yTopMm - mini.totalHeightMm;
  const x = mm(xMm);
  const yBottom = mm(yBottomMm);
  const iw = mm(mini.imageWidthMm);
  const offX = mm(mini.imageOffsetXMm);
  const imgH = mm(mini.imageHeightMm);

  // Bottom-up: floor strip (two tabs deep), front tab, front face, margin,
  // fold, margin, back face, back tab. The figures stand straight on their
  // tabs, so a figure shorter than its face leaves paper by the fold instead.
  const frontBottom = yBottom + mm(mini.levels.frontTabTopMm);

  pdfPage.drawImage(images.front, {
    x: x + offX,
    y: frontBottom,
    width: iw,
    height: imgH,
  });

  // Either way the back image fills (x + backOffX, backTop - h) to
  // (x + backOffX + backW, backTop), right under the back tab, so the figure's
  // feet touch it.
  const backTop = yBottom + mm(mini.levels.backFaceTopMm);
  // Packing sets `mini.back` exactly when the entry has back artwork, and
  // `images.back` comes from the same artwork.
  const back: BackFace = mini.back ?? mini;
  const backW = mm(back.imageWidthMm);
  const backOffX = mm(back.imageOffsetXMm);
  pdfPage.pushOperators(pushGraphicsState());
  if (images.back) {
    // The back artwork is drawn as seen from behind. Fold plus walking round
    // the mini is a 180° rotation, so rotated it reads the right way round.
    // CTM [-1 0 0 -1 e f] maps (px,py) → (e-px, f-py).
    pdfPage.pushOperators(concatTransformationMatrix(-1, 0, 0, -1, x + backOffX + backW, backTop));
  } else {
    // The front reflected across the fold line, top to bottom only. Folding is
    // that same reflection, so the two outlines land on each other and cut as
    // one; a 180° rotation would land them mirrored left to right.
    // CTM [1 0 0 -1 e f] maps (px,py) → (e+px, f-py).
    pdfPage.pushOperators(concatTransformationMatrix(1, 0, 0, -1, x + backOffX, backTop));
  }
  pdfPage.drawImage(images.back ?? images.front, {
    x: 0,
    y: 0,
    width: backW,
    height: mm(back.imageHeightMm),
  });
  pdfPage.pushOperators(popGraphicsState());

  // The number sits on the back tab only: the front tab ends up under the
  // floor strip, glued out of sight. It is drawn under a 180° rotation rather
  // than the mirror, because text mirrored by the fold reads backwards. Fold
  // plus walking around the mini is a rotation, so rotated text reads upright
  // from behind, and face-local "below the image" is the back tab.
  // CTM [-1 0 0 -1 e f] maps (px,py) → (e-px, f-py) over the same rectangle.
  if (mini.label) {
    pdfPage.pushOperators(pushGraphicsState());
    pdfPage.pushOperators(concatTransformationMatrix(-1, 0, 0, -1, x + backOffX + backW, backTop));
    drawLabelBadge(
      pdfPage,
      mini.label,
      font,
      mini.baseWidthMm,
      mini.tabHeightMm,
      mm(mini.backBadgeOffsetXMm),
      0,
    );
    pdfPage.pushOperators(popGraphicsState());
  }

  drawCutMarks(pdfPage, mini, x, yBottom);
}

// Cut marks drawn on the piece's own edges, so neighbours can share a cut
// line with no gap between them. Each arm runs along a cut edge or a fold,
// where a line belongs anyway, so nothing stray is left once the piece is cut.
// The bottom and top corners get an inward corner; each fold between strips,
// and the fold between the faces, gets a tick on the edge with its arm
// pointing into the piece. All of it is one stroked path, drawn last, which is
// how pdf.test.ts finds where one mini ends.
function drawCutMarks(pdfPage: PDFPage, mini: PackedMini, x: number, yBottom: number) {
  const arm = mm(CUT_MARK_ARM_MM);
  const left = x;
  const right = x + mm(mini.totalWidthMm);
  const [bottom, top] = mini.levels.cutMarks.cornersMm.map((level) => yBottom + mm(level));
  const ticks = mini.levels.cutMarks.edgeTicksMm.map((level) => yBottom + mm(level));

  const ops = [
    pushGraphicsState(),
    setLineWidth(mm(CUT_MARK_STROKE_MM)),
    setStrokingGrayscaleColor(MARK_GREY),
  ];
  const segment = (x1: number, y1: number, x2: number, y2: number) =>
    ops.push(moveTo(x1, y1), lineTo(x2, y2));
  for (const edge of [left, right]) {
    const inward = edge === left ? arm : -arm;
    segment(edge + inward, bottom, edge, bottom);
    segment(edge, bottom, edge, bottom + arm);
    segment(edge + inward, top, edge, top);
    segment(edge, top, edge, top - arm);
    for (const y of ticks) {
      segment(edge, y, edge + inward, y);
      segment(edge, y - arm, edge, y + arm);
    }
  }
  ops.push(stroke(), popGraphicsState());
  pdfPage.pushOperators(...ops);
}

// Filled shapes only, drawn after the minis: a stroke would read as a cut mark.
function drawScaleBar(pdfPage: PDFPage, pageHmm: number, font: PDFFont) {
  const barY = pageHmm - SCALE_BAR_Y_FROM_TOP_MM;
  const color = rgb(0, 0, 0);
  pdfPage.drawRectangle({
    x: 0,
    y: mm(barY - SCALE_BAR_THICKNESS_MM / 2),
    width: mm(SCALE_BAR_MM),
    height: mm(SCALE_BAR_THICKNESS_MM),
    color,
  });
  for (let tickMm = 0; tickMm <= SCALE_BAR_MM; tickMm += 10) {
    const length = tickMm % 50 === 0 ? SCALE_MAJOR_TICK_MM : SCALE_TICK_MM;
    // The end ticks sit inside the bar's ends, so the bar's own length is the
    // measurement and the ticks never add to it.
  const x = Math.min(
    Math.max(tickMm - SCALE_TICK_WIDTH_MM / 2, 0),
    SCALE_BAR_MM - SCALE_TICK_WIDTH_MM,
  );
    pdfPage.drawRectangle({
      x: mm(x),
      y: mm(barY - length),
      width: mm(SCALE_TICK_WIDTH_MM),
      height: mm(length),
      color,
    });
  }
  pdfPage.drawText(SCALE_BAR_NOTE, {
    x: mm(SCALE_BAR_MM + 3),
    y: mm(barY - SCALE_MAJOR_TICK_MM),
    size: SCALE_TEXT_PT,
    font,
    color,
  });
}

// Draws a white number badge below the base's right edge. boxX is the base's
// left edge and boxY is the image's bottom, in pt and face-local coordinates.
// `roomMm` is the tab below the image, and the badge shrinks to stay inside it,
// clear of the cut edge at both ends — Gargantuan's tab is only 6.5 mm. The
// clearance yields with the room for the same reason: held at a flat 0.8 mm it
// eats too much of a shallow tab, and the digit inside drops below the 6 pt
// this file's tests treat as the floor for a readable number.
function drawLabelBadge(
  pdfPage: PDFPage,
  label: string,
  font: PDFFont,
  widthMm: number,
  roomMm: number,
  boxX: number,
  boxY: number,
) {
  const badgeWmm = clamp(widthMm * 0.22, 4, 7);
  const padMm = Math.min(0.8, widthMm * 0.04, roomMm * 0.1);
  const badgeHmm = Math.min(badgeWmm * 0.85, roomMm - padMm * 2);
  const fontSize = mm(badgeHmm * 0.65);

  const bw = mm(badgeWmm);
  const bh = mm(badgeHmm);
  const pad = mm(padMm);
  const bx = boxX + mm(widthMm) - bw - pad;
  const by = boxY - bh - pad;

  pdfPage.drawRectangle({
    x: bx,
    y: by,
    width: bw,
    height: bh,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.4, 0.4, 0.4),
    borderWidth: mm(0.2),
  });

  const textW = font.widthOfTextAtSize(label, fontSize);
  const textH = font.heightAtSize(fontSize, { descender: false });
  pdfPage.drawText(label, {
    x: bx + (bw - textW) / 2,
    y: by + (bh - textH) / 2,
    size: fontSize,
    font,
    color: rgb(0, 0, 0),
  });
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function buildFilename(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `paper-minis-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.pdf`;
}

export function buildPrinterScaleTestSheetFilename(pageSize: PageSizeKey): string {
  return `paper-minis-printer-scale-test-${pageSize}.pdf`;
}
