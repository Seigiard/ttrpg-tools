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
  FLAT_TONGUE_DEPTH_MM,
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

// The first sheet's scale check occupies a reserved band above the packed layout.
// A print dialog shrinks the whole sheet by a few per cent, which no amount of
// care in the layout can undo, so the sheet has to let the user see it happen.
// 100 mm makes a 3% shrink a 3 mm shortfall, visible against any ruler.
export const SCALE_BAR_MM = 100;

const SCALE_BAR_Y_FROM_TOP_MM = 5.5;

const SCALE_BAR_THICKNESS_MM = 0.4;

const SCALE_TICK_MM = 1.5;

const SCALE_MAJOR_TICK_MM = 2.5;

const SCALE_TICK_WIDTH_MM = 0.3;

const SCALE_TEXT_PT = 7;

const SCALE_NOTE_GAP_MM = 1.5;

export const SCALE_BAR_NOTE =
  'Print with Scale to Fit. This bar should be 100 mm; if not, reprint the printer test sheet.';

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
      // oxlint-disable-next-line no-await-in-loop -- Keep embedding sequential to cap image memory while writing one PDF document.
      front: await embed(entry.artwork),
      // oxlint-disable-next-line no-await-in-loop -- Keep embedding sequential to cap image memory while writing one PDF document.
      back: entry.backArtwork ? await embed(entry.backArtwork) : undefined,
    });
  }

  const { w: pageWmm, h: pageHmm } = PAGE_SIZES_MM[opts.pageSize];
  const scale = printerScale(opts);
  const scaledPageWmm = pageWmm * scale;
  const scaledPageHmm = pageHmm * scale;

  for (const [pageIndex, page] of layout.pages.entries()) {
    const pdfPage = pdf.addPage([mm(pageWmm), mm(pageHmm)]);
    const foamboard = opts.baseStyle === 'foamboard';
    const backSheet = foamboard && pageIndex % 2 === 1;
    const hasScaleBarBand = pageIndex === 0 || (foamboard && pageIndex === 1);
    pdfPage.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(1 / scale, 0, 0, 1 / scale, 0, 0),
    );
    const layoutTopMm = scaledPageHmm - (hasScaleBarBand ? SCALE_BAR_BAND_MM : 0);

    for (const { mini, xMm, yMm, rotated } of page.placements) {
      const images = faces.get(mini.entryIndex);

      if (!images) throw new Error('Layout refers to an entry without prepared artwork.');

      if (rotated) {
        // Turn the whole local drawing clockwise about the footprint's top-left.
        // A Back sheet turns it counter-clockwise so the Tongue moves to the
        // reflected side without mirroring supplied artwork or badge text.
        const transform = backSheet
          ? concatTransformationMatrix(
              0,
              1,
              -1,
              0,
              mm(xMm + mini.totalHeightMm),
              mm(layoutTopMm - yMm - mini.totalWidthMm),
            )
          : concatTransformationMatrix(0, -1, 1, 0, mm(xMm), mm(layoutTopMm - yMm));

        pdfPage.pushOperators(pushGraphicsState(), transform);
        drawMini(pdfPage, mini, images, 0, mini.totalHeightMm, font, backSheet);
        pdfPage.pushOperators(popGraphicsState());
        continue;
      }

      drawMini(pdfPage, mini, images, xMm, layoutTopMm - yMm, font, backSheet);
    }

    if (pageIndex === 0) drawScaleBar(pdfPage, scaledPageHmm, noteFont);

    if (foamboard) drawRegistrationMarks(pdfPage, scaledPageWmm, scaledPageHmm);

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
      x: mm(
        xMm +
          Math.min(
            Math.max(tickMm - TEST_SHEET_TICK_WIDTH_MM / 2, 0),
            SCALE_BAR_MM - TEST_SHEET_TICK_WIDTH_MM,
          ),
      ),
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
  backSheet: boolean,
) {
  if (mini.baseStyle === 'foamboard') {
    drawFoamboardMini(pdfPage, mini, images, xMm, yTopMm, font, backSheet);

    return;
  }

  const yBottomMm = yTopMm - mini.totalHeightMm;
  const x = mm(xMm);
  const yBottom = mm(yBottomMm);
  const iw = mm(mini.imageWidthMm);
  const offX = mm(mini.imageOffsetXMm);
  const imgH = mm(mini.imageHeightMm);

  // Bottom-up: floor strip (two tabs deep), front tab, front face, margin,
  // fold, margin, back face, back tab. The figures stand straight on their
  // tabs, so a figure shorter than its face leaves paper by the fold instead.
  const frontTopMm =
    mini.baseStyle === 'flat' ? mini.levels.frontTongueTopMm : mini.levels.frontTabTopMm;

  const frontBottom = yBottom + mm(frontTopMm);

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

    const badgeWidthMm = mini.baseStyle === 'flat' ? mini.tongueWidthMm : mini.baseWidthMm;

    const badgeOffsetXMm = mini.backBadgeOffsetXMm;

    drawLabelBadge(
      pdfPage,
      mini.label,
      font,
      badgeWidthMm,
      mini.baseStyle === 'flat' ? FLAT_TONGUE_DEPTH_MM : mini.tabHeightMm,
      mm(badgeOffsetXMm),
      0,
    );
    pdfPage.pushOperators(popGraphicsState());
  }

  drawCutMarks(pdfPage, mini, x, yBottom);
}

function drawFoamboardMini(
  pdfPage: PDFPage,
  mini: Extract<PackedMini, { baseStyle: 'foamboard' }>,
  images: FaceImages,
  xMm: number,
  yTopMm: number,
  font: PDFFont,
  backSheet: boolean,
) {
  const yBottomMm = yTopMm - mini.totalHeightMm;
  const x = mm(xMm);
  const yBottom = mm(yBottomMm);

  const imageWidthMm = backSheet
    ? (mini.back?.imageWidthMm ?? mini.imageWidthMm)
    : mini.imageWidthMm;

  const imageHeightMm = backSheet
    ? (mini.back?.imageHeightMm ?? mini.imageHeightMm)
    : mini.imageHeightMm;

  const imageOffsetXMm = backSheet
    ? (mini.back?.imageOffsetXMm ?? mini.imageOffsetXMm)
    : mini.imageOffsetXMm;

  const imageBottomMm = yBottomMm + mini.levels.frontTongueTopMm + mini.marginMm;
  const image = backSheet ? (images.back ?? images.front) : images.front;

  pdfPage.pushOperators(pushGraphicsState());

  if (backSheet && !images.back) {
    pdfPage.pushOperators(
      concatTransformationMatrix(
        -1,
        0,
        0,
        1,
        x + mm(imageOffsetXMm + imageWidthMm),
        mm(imageBottomMm),
      ),
    );
    pdfPage.drawImage(image, {
      x: 0,
      y: 0,
      width: mm(imageWidthMm),
      height: mm(imageHeightMm),
    });
  } else {
    pdfPage.drawImage(image, {
      x: x + mm(imageOffsetXMm),
      y: mm(imageBottomMm),
      width: mm(imageWidthMm),
      height: mm(imageHeightMm),
    });
  }

  pdfPage.pushOperators(popGraphicsState());

  if (backSheet && mini.label) {
    drawLabelBadge(
      pdfPage,
      mini.label,
      font,
      mini.tongueWidthMm,
      FLAT_TONGUE_DEPTH_MM,
      x + mm(mini.tongueOffsetXMm),
      yBottom + mm(mini.levels.frontTongueTopMm),
    );
  }

  if (!backSheet) drawCutMarks(pdfPage, mini, x, yBottom);
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
  const corners = mini.levels.cutMarks.cornersMm.map((level) => yBottom + mm(level));
  const bottom = corners[0];
  const top = corners[corners.length - 1];
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

  if (mini.baseStyle === 'flat') {
    const tongueLeft = x + mm(mini.tongueOffsetXMm);
    const tongueRight = tongueLeft + mm(mini.tongueWidthMm);
    const lowerShoulder = yBottom + mm(mini.levels.frontTongueTopMm);
    const upperShoulder = yBottom + mm(mini.levels.backFaceTopMm);

    for (const [shoulder, direction] of [
      [tongueLeft, -1],
      [tongueRight, 1],
    ] as const) {
      segment(shoulder, lowerShoulder, shoulder + direction * arm, lowerShoulder);
      segment(shoulder, lowerShoulder, shoulder, lowerShoulder - arm);
      segment(shoulder, upperShoulder, shoulder + direction * arm, upperShoulder);
      segment(shoulder, upperShoulder, shoulder, upperShoulder + arm);
    }
  } else if (mini.baseStyle === 'foamboard') {
    const tongueLeft = x + mm(mini.tongueOffsetXMm);
    const tongueRight = tongueLeft + mm(mini.tongueWidthMm);
    const tongueTop = yBottom + mm(mini.levels.frontTongueTopMm);

    for (const [shoulder, direction] of [
      [tongueLeft, -1],
      [tongueRight, 1],
    ] as const) {
      segment(shoulder, tongueTop, shoulder + direction * arm, tongueTop);
      segment(shoulder, tongueTop, shoulder, tongueTop - arm);
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

  // Above the bar: the ticks hang below it, and the note is too long to sit
  // beside a 100 mm bar on a scaled A4 or Letter width.
  pdfPage.drawText(SCALE_BAR_NOTE, {
    x: 0,
    y: mm(barY + SCALE_NOTE_GAP_MM),
    size: SCALE_TEXT_PT,
    font,
    color,
  });
}

function drawRegistrationMarks(pdfPage: PDFPage, pageWmm: number, pageHmm: number) {
  const corners = [
    [0, 0, 1, 1],
    [pageWmm, 0, -1, 1],
    [0, pageHmm, 1, -1],
    [pageWmm, pageHmm, -1, -1],
  ] as const;

  for (const [xMm, yMm, xDirection, yDirection] of corners) {
    pdfPage.pushOperators(
      pushGraphicsState(),
      setLineWidth(mm(CUT_MARK_STROKE_MM)),
      setStrokingGrayscaleColor(MARK_GREY),
      moveTo(mm(xMm), mm(yMm)),
      lineTo(mm(xMm + xDirection * 3), mm(yMm)),
      moveTo(mm(xMm), mm(yMm)),
      lineTo(mm(xMm), mm(yMm + yDirection * 3)),
      stroke(),
      popGraphicsState(),
    );
  }
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

export { buildFilename, buildPrinterScaleTestSheetFilename } from './pdf-filenames';
