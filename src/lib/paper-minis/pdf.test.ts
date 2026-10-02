import assert from 'node:assert/strict';
import {
  PDFDocument,
  PDFArray,
  PDFDict,
  PDFName,
  PDFRawStream,
  StandardFonts,
  decodePDFRawStream,
} from 'pdf-lib';
import { generatePDF as renderPDF, generatePrinterScaleTestSheet } from './pdf.ts';
import { packEntries } from './packing.ts';
import type { MiniLevels, PackOptions } from './geometry.ts';
import type { Entry } from './types.ts';

import { test as t } from 'bun:test';

const generatePDF = (entries: Entry[], options: PackOptions) => {
  const resolved = { ...options, printerScale: options.printerScale ?? 1 };
  return renderPDF(entries, packEntries(entries, resolved), resolved);
};
const generatePDFAtDefaultScale = (entries: Entry[], options: PackOptions) =>
  renderPDF(entries, packEntries(entries, options), options);

type Point = { x: number; y: number };
type Box = { left: number; bottom: number; right: number; top: number };
type Matrix = [number, number, number, number, number, number];
const identity: Matrix = [1, 0, 0, 1, 0, 0];
const point = (m: Matrix, x: number, y: number): Point => ({
  x: m[0] * x + m[2] * y + m[4],
  y: m[1] * x + m[3] * y + m[5],
});

const bounds = (points: Point[]): Box => ({
  left: Math.min(...points.map((p) => p.x)),
  right: Math.max(...points.map((p) => p.x)),
  bottom: Math.min(...points.map((p) => p.y)),
  top: Math.max(...points.map((p) => p.y)),
});

const PT_PER_MM = 72 / 25.4;
const asMm = (pt: number) => Math.round((pt / PT_PER_MM) * 1e6) / 1e6;
const widthMm = (box: Box) => asMm(box.right - box.left);
const inside = (inner: Box, outer: Box) =>
  inner.left > outer.left &&
  inner.right < outer.right &&
  inner.bottom > outer.bottom &&
  inner.top < outer.top;

// Every shape carries the role the PDF itself reveals: a stroked path is a
// mini's cut marks, a filled-and-stroked one a badge, and a negative vertical
// CTM marks the back face. Assertions name those roles. The scale bar is sheet
// furniture rather than part of any mini: it is the only fill-only path and the
// only text set in regular Helvetica, so it is read into its own list per page.
type Role = 'marks' | 'badge' | 'image' | 'text';
type Text = {
  label: string;
  size: number;
  direction: number;
  verticalDirection: number;
  position: Point;
};
type Mirror = { x: boolean; y: boolean };
type Segment = [Point, Point];
type Shape = {
  page: number;
  role: Role;
  flipped: boolean;
  box: Box;
  text?: Text;
  mirror?: Mirror;
  segments?: Segment[];
  xobject?: string;
  axes?: number[];
};
type ScaleBar = { page: number; marks: Box[]; notes: Text[] };

// `xobject` names the embedded image a face draws, so tests can tell artworks apart.
type Face = { image: Box; mirror: Mirror; xobject: string; badge?: Box; text?: Text };
// A level is a height where the cut marks name a line across the piece: a
// corner where the piece ends, a tick where a strip or the faces fold.
// `inward` says every arm stays on the piece, so neighbours can share an edge.
type Level = { y: number; kind: 'corner' | 'tick' };
type Mini = {
  page: number;
  extent: Box;
  marks: Box;
  levels: Level[];
  inward: boolean;
  fold: number;
  front: Face;
  back: Face;
};

// Read geometry from the saved PDF's graphics operators, not drawing helpers.
async function read(bytes: Uint8Array, readUprightMinis = true) {
  const pdf = await PDFDocument.load(bytes);
  const shapes: Shape[] = [];
  const scaleBars: ScaleBar[] = [];
  const pageSizes: { width: number; height: number }[] = [];
  // pdf-lib gives every draw its own random resource name, so an image is
  // known by the object its name points at, numbered in order of first use.
  const xobjects = new Map<string, string>();
  const xobject = (resources: PDFDict, name: string) => {
    const ref = String(resources.get(PDFName.of(name.slice(1))));
    if (!xobjects.has(ref)) xobjects.set(ref, `image-${xobjects.size}`);
    return xobjects.get(ref)!;
  };
  for (const [pageIndex, page] of pdf.getPages().entries()) {
    pageSizes.push(page.getSize());
    const scaleBar: ScaleBar = { page: pageIndex, marks: [], notes: [] };
    scaleBars.push(scaleBar);
    const fonts = page.node.Resources()!.lookup(PDFName.of('Font'), PDFDict);
    const images = page.node.Resources()!.lookup(PDFName.of('XObject'), PDFDict);
    let baseFont = '';
    const contents = page.node.Contents();
    assert.ok(contents instanceof PDFArray);
    let matrix: Matrix = [...identity];
    const stack: Matrix[] = [];
    let path: Point[] = [];
    let segments: Segment[] = [];
    let textMatrix: Matrix = [...identity];
    let size = 0;
    for (let i = 0; i < contents.size(); i++) {
      const stream = contents.lookup(i, PDFRawStream);
      const source = new TextDecoder().decode(decodePDFRawStream(stream).decode());
      for (const line of source.trim().split('\n')) {
        const tokens = line.trim().split(/\s+/);
        const op = tokens.pop();
        const n = tokens.map(Number);
        const flipped = matrix[3] < 0;
        if (op === 'q') stack.push([...matrix]);
        if (op === 'Q') matrix = stack.pop()!;
        if (op === 'cm') {
          const [a, b, c, d, e, f] = n;
          const [g, h, j, k] = matrix;
          const origin = point(matrix, e, f);
          matrix = [g * a + j * b, h * a + k * b, g * c + j * d, h * c + k * d, origin.x, origin.y];
        }
        if (op === 'm') path.push(point(matrix, n[0], n[1]));
        if (op === 'l') {
          const end = point(matrix, n[0], n[1]);
          segments.push([path[path.length - 1], end]);
          path.push(end);
        }
        if (op === 'f') scaleBar.marks.push(bounds(path));
        if (op === 'S')
          shapes.push({ page: pageIndex, role: 'marks', flipped, box: bounds(path), segments });
        if (op === 'B') shapes.push({ page: pageIndex, role: 'badge', flipped, box: bounds(path) });
        if (op === 'f' || op === 'S' || op === 'B') {
          path = [];
          segments = [];
        }
        if (op === 'Do')
          shapes.push({
            page: pageIndex,
            role: 'image',
            flipped,
            box: bounds([
              point(matrix, 0, 0),
              point(matrix, 1, 0),
              point(matrix, 0, 1),
              point(matrix, 1, 1),
            ]),
            mirror: { x: matrix[0] < 0, y: matrix[3] < 0 },
            xobject: xobject(images, tokens[0]),
            axes: matrix.slice(0, 4).map((v) => Math.sign(v) || 0),
          });
        if (op === 'Tf') {
          size = n[1];
          baseFont = fonts
            .lookup(PDFName.of(tokens[0].slice(1)), PDFDict)
            .lookup(PDFName.of('BaseFont'), PDFName)
            .asString();
        }
        if (op === 'Tm') textMatrix = n as Matrix;
        if (op === 'Tj') {
          const position = point(matrix, textMatrix[4], textMatrix[5]);
          const text = {
            label: Buffer.from(tokens[0].slice(1, -1), 'hex').toString(),
            size,
            direction: matrix[0] * textMatrix[0] + matrix[2] * textMatrix[1],
            verticalDirection: matrix[1] * textMatrix[0] + matrix[3] * textMatrix[1],
            position,
          };
          if (baseFont === '/Helvetica') scaleBar.notes.push(text);
          else shapes.push({ page: pageIndex, role: 'text', flipped, box: bounds([position]), text });
        }
      }
    }
  }
  return {
    shapes,
    minis: readUprightMinis ? minis(shapes) : [],
    texts: shapes.filter((s) => s.role === 'text').map((s) => s.text!),
    pages: pdf.getPageCount(),
    pageSizes,
    scaleBars,
    printScaling: pdf.catalog.getViewerPreferences()?.getPrintScaling(),
  };
}

// drawMini emits one mini's shapes in a run that its cut marks close, so the
// marks are the separator. Within a run, role and face place every shape.
function minis(shapes: Shape[]): Mini[] {
  const runs: Shape[][] = [];
  let run: Shape[] = [];
  for (const shape of shapes) {
    run.push(shape);
    if (shape.role === 'marks') {
      runs.push(run);
      run = [];
    }
  }
  return runs.map((group) => {
    const pick = (role: Role, flipped: boolean) =>
      group.find((s) => s.role === role && s.flipped === flipped);
    const marks = group.find((s) => s.role === 'marks')!;
    const segments = marks.segments!;
    // The piece's edges are where the vertical arms run.
    const xs = segments.filter(([a, b]) => a.x === b.x).map(([a]) => a.x);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const horizontal = segments
      .filter(([a, b]) => a.y === b.y)
      .map(([a, b]) => ({ y: a.y, from: Math.min(a.x, b.x), to: Math.max(a.x, b.x) }));
    const vertical = segments
      .filter(([a, b]) => a.x === b.x)
      .map(([a, b]) => ({ from: Math.min(a.y, b.y), to: Math.max(a.y, b.y) }));
    const ys = [...new Set(horizontal.map((h) => h.y))].sort((a, b) => a - b);
    // A tick's vertical arm runs both ways from its level; a corner's only one.
    const levels = ys.map(
      (y): Level => ({
        y,
        kind: vertical.some((v) => v.from < y && v.to > y) ? 'tick' : 'corner',
      }),
    );
    const inward =
      horizontal.every((h) => h.from >= left && h.to <= right) &&
      vertical.every((v) => v.from >= ys[0] && v.to <= ys[ys.length - 1]);
    const face = (flipped: boolean): Face => ({
      image: pick('image', flipped)!.box,
      mirror: pick('image', flipped)!.mirror!,
      xobject: pick('image', flipped)!.xobject!,
      badge: pick('badge', flipped)?.box,
      text: pick('text', flipped)?.text,
    });
    return {
      page: marks.page,
      extent: { left, right, bottom: ys[0], top: ys[ys.length - 1] },
      marks: marks.box,
      levels,
      inward,
      // Levels run floor strip, front tab, fold, back tab between the corners.
      fold: levels[3].y,
      front: face(false),
      back: face(true),
    };
  });
}

const artwork = {
  bytes: Uint8Array.from(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==',
      'base64',
    ),
  ),
  format: 'png' as const,
  width: 1,
  height: 1,
};
const entry: Entry = { image: null, artwork, heightSlot: 'tiny', count: 1 };

t('artwork for a mini that does not fit is not embedded in the PDF', async () => {
  // #given
  const oversized: Entry = {
    ...entry,
    artwork: { ...artwork },
    heightSlot: 'custom',
    customWidthMm: 400,
    customHeightMm: 400,
  };
  const entries = [entry, oversized];
  const options = { pageSize: 'a4' as const, numberDuplicates: false };
  const layout = packEntries(entries, options);
  // #when
  const document = await PDFDocument.load(await renderPDF(entries, layout, options));
  const imageObjects = document.context
    .enumerateIndirectObjects()
    .filter(
      ([, object]) =>
        object instanceof PDFRawStream &&
        object.dict.get(PDFName.of('Subtype'))?.toString() === '/Image',
    ).length;
  // #then
  assert.deepEqual(
    { miniCount: layout.miniCount, states: layout.entries.map(({ state }) => state), imageObjects },
    { miniCount: 1, states: ['upright', 'oversized'], imageObjects: 1 },
  );
});

for (const separateBack of [false, true]) {
  t(
    `clockwise rescue turns the complete drawing (${separateBack ? 'separate' : 'reflected'} back)`,
    async () => {
      // #given: a 214×86 cut-out, turned into an 86×214 footprint.
      const wideMini: Entry = {
        ...entry,
        heightSlot: 'custom',
        customWidthMm: 20,
        customHeightMm: 140,
        artwork: { ...artwork, width: 10, height: 1 },
        ...(separateBack
          ? {
              backImage: new File([], 'back.png'),
              backArtwork: { ...artwork, width: 20, height: 1 },
            }
          : {}),
      };
      // #when
      const sheet = await read(
        await generatePDF([wideMini], {
          pageSize: 'a4',
          numberDuplicates: true,
        }),
        false,
      );
      const images = sheet.shapes.filter((s) => s.role === 'image');
      const marks = sheet.shapes.find((s) => s.role === 'marks')!;
      const badge = sheet.shapes.find((s) => s.role === 'badge')!;
      const boxMm = (box: Box) => [box.left, box.bottom, box.right, box.top].map(asMm);
      // #then: PDF world coordinates, measured from the bottom-left of A4.
      assert.deepEqual(
        {
          pages: sheet.pages,
          images: images.map((s) => boxMm(s.box)),
          axes: images.map((s) => s.axes),
          marks: boxMm(marks.box),
          folds: [
            ...new Set(marks.segments!.filter(([a, b]) => a.x === b.x).map(([a]) => asMm(a.x))),
          ].toSorted((a, b) => a - b),
          badge: boxMm(badge.box),
          label: sheet.texts.map((text) => [text.label, text.direction, text.verticalDirection]),
          scale: [
            asMm(sheet.scaleBars[0].marks[0].left),
            widthMm(sheet.scaleBars[0].marks[0]),
            sheet.scaleBars[0].notes[0].direction,
          ],
        },
        {
          pages: 1,
          images: [
            [30, 75, 51, 285],
            [separateBack ? 65.5 : 55, 75, 76, 285],
          ],
          axes: [[0, -1, 1, 0], separateBack ? [0, 1, -1, 0] : [0, -1, -1, 0]],
          marks: [0, 73, 86, 287],
          folds: [0, 20, 30, 53, 76, 86],
          badge: [76.8, 184.8, 80.54, 189.2],
          label: [['1', 0, 1]],
          scale: [0, 100, 1],
        },
      );
    },
  );
}

t('a turned mini and an upright neighbour share a cut line', async () => {
  // #given: a 214 mm rescue strip followed by a 34 mm upright strip fits A4.
  const entries: Entry[] = [
    {
      ...entry,
      heightSlot: 'custom',
      customWidthMm: 20,
      customHeightMm: 140,
      artwork: { ...artwork, width: 10, height: 1 },
    },
    { ...entry, heightSlot: 'custom', customWidthMm: 5, customHeightMm: 10 },
  ];
  // #when
  const sheet = await read(
    await generatePDF(entries, { pageSize: 'a4', numberDuplicates: true }),
    false,
  );
  const marks = sheet.shapes.filter((s) => s.role === 'marks').map((s) => s.box);
  // #then: the upright strip starts where the turned cut-out ends.
  assert.deepEqual(
    {
      pages: sheet.pages,
      marks: marks.length,
      sharedEdgeMm: asMm(marks[0].bottom - marks[1].top),
      images: sheet.shapes.filter((s) => s.role === 'image').length,
      badges: sheet.shapes.filter((s) => s.role === 'badge').length,
      labels: sheet.texts.map((text) => [text.label, text.direction, text.verticalDirection]),
    },
    {
      pages: 1,
      marks: 2,
      sharedEdgeMm: 0,
      images: 4,
      badges: 2,
      labels: [
        ['1', 0, 1],
        ['1', -1, 0],
      ],
    },
  );
});

t('stacked minis print on one sheet without overlapping and with complete faces', async () => {
  // #given: one 92×264 footprint beside two stacks of two 44×124 footprints.
  const entries: Entry[] = [
    { ...entry, heightSlot: 'custom', customWidthMm: 88, customHeightMm: 42 },
    { ...entry, heightSlot: 'custom', customWidthMm: 40, customHeightMm: 20, count: 4 },
  ];
  // #when
  const sheet = await read(await generatePDF(entries, { pageSize: 'a4', numberDuplicates: true }));
  // #then
  assert.deepEqual(
    {
      pages: sheet.pages,
      minis: sheet.minis.length,
      overlapping: sheet.minis.some((a, i) =>
        sheet.minis
          .slice(i + 1)
          .some(
            (b) =>
              !(
                asMm(a.extent.right) <= asMm(b.extent.left) ||
                asMm(b.extent.right) <= asMm(a.extent.left) ||
                asMm(a.extent.top) <= asMm(b.extent.bottom) ||
                asMm(b.extent.top) <= asMm(a.extent.bottom)
              ),
          ),
      ),
      complete: sheet.minis.every(
        (mini) =>
          inside(mini.front.image, mini.extent) &&
          inside(mini.back.image, mini.extent) &&
          inside(mini.back.badge!, mini.extent),
      ),
      labels: sheet.texts.map((text) => text.label).toSorted(),
    },
    { pages: 1, minis: 5, overlapping: false, complete: true, labels: ['1', '1', '2', '3', '4'] },
  );
});

// 3x2 px at Medium: the figure prints 52.5 mm wide at its 35 mm height, over a
// 25 mm base, overhanging it and staying under the width cap.
const wide: Entry = {
  ...entry,
  heightSlot: 'medium',
  artwork: {
    bytes: Uint8Array.from(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAADklEQVR4nGNwgAEGOAsALRQEgQjZfUEAAAAASUVORK5CYII=',
        'base64',
      ),
    ),
    format: 'png',
    width: 3,
    height: 2,
  },
};

const unfold = (mini: Mini) => ({
  levels: mini.levels.map((level) => asMm(level.y - mini.extent.bottom)),
  kinds: mini.levels.map((level) => level.kind),
});

t('a Tiny prints its number once, upright from behind, on the back tab', async () => {
  // #given
  const opts = { pageSize: 'a4', numberDuplicates: true } as const;
  // #when
  const sheet = await read(await generatePDF([entry], opts));
  // #then  the front tab ends up glued under the floor strip, out of sight
  const [mini] = sheet.minis;
  const [, , , , backTab] = mini.levels;
  assert.deepEqual(
    {
      minis: sheet.minis.length,
      shapes: sheet.shapes.length,
      frontBadge: mini.front.badge,
      onBackTab: mini.back.badge!.bottom > backTab.y && mini.back.badge!.top < mini.extent.top,
      insidePiece: inside(mini.back.badge!, mini.extent),
      labels: sheet.texts.map((text) => text.label),
      directions: sheet.texts.map((text) => text.direction),
      readable: sheet.texts.map((text) => text.size >= 6),
      textInsideBadge:
        mini.back.text!.position.x > mini.back.badge!.left &&
        mini.back.text!.position.x < mini.back.badge!.right &&
        mini.back.text!.position.y > mini.back.badge!.bottom &&
        mini.back.text!.position.y < mini.back.badge!.top,
    },
    {
      minis: 1,
      shapes: 5, // two images, one badge, one label, one path of cut marks
      frontBadge: undefined,
      onBackTab: true,
      insidePiece: true,
      labels: ['1'],
      directions: [-1],
      readable: [true],
      textInsideBadge: true,
    },
  );
});

t('a sliver of Tiny artwork keeps its badge at the right of the base once folded', async () => {
  // #given
  const tall: Entry = {
    ...entry,
    artwork: {
      bytes: Uint8Array.from(
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAABkCAYAAABHLFpgAAAAEklEQVR4nGP4z8Dwn2GUGEkEAJoCxzl9ksz2AAAAAElFTkSuQmCC',
          'base64',
        ),
      ),
      format: 'png',
      width: 1,
      height: 100,
    },
  };
  // #when
  const { minis } = await read(
    await generatePDF([tall], { pageSize: 'a4', numberDuplicates: true }),
  );
  // #then  the sheet shows the back face from behind, so its right is our left
  const [mini] = minis;
  const middle = (mini.extent.left + mini.extent.right) / 2;
  assert.equal(mini.back.badge!.right < middle && mini.back.badge!.left > mini.extent.left, true);
});

for (const marginMm of [0, 2, 8]) {
  t(
    `badges stay on their back tabs with a ${marginMm} mm margin and leave layout unchanged`,
    async () => {
      // #given  Gargantuan's tab is the shallowest, so its badge is the tightest fit
      const entries: Entry[] = [
        { ...entry, heightSlot: 'large-tall' },
        { ...entry, heightSlot: 'gargantuan' },
        entry,
      ];
      const opts = { pageSize: 'a4', marginMm } as const;
      // #when
      const numbered = await read(await generatePDF(entries, { ...opts, numberDuplicates: true }));
      const plain = await read(await generatePDF(entries, { ...opts, numberDuplicates: false }));
      // #then
      assert.deepEqual(
        {
          pages: numbered.pages,
          // Numbering adds badges and labels and moves nothing else.
          layout: numbered.shapes.filter((s) => s.role !== 'badge' && s.role !== 'text'),
          placement: numbered.minis.map((mini) => [
            mini.back.badge!.bottom > mini.levels[4].y,
            mini.back.badge!.top < mini.extent.top,
          ]),
          readable: numbered.texts.map((text) => text.size >= 6),
          plainLabels: plain.texts,
        },
        {
          pages: plain.pages,
          layout: plain.shapes,
          placement: [
            [true, true],
            [true, true],
            [true, true],
          ],
          readable: [true, true, true],
          plainLabels: [],
        },
      );
    },
  );
}

t('each copy prints its own number', async () => {
  // #given
  const copies = { ...entry, count: 12 };
  // #when
  const { texts } = await read(
    await generatePDF([copies], { pageSize: 'a4', numberDuplicates: true }),
  );
  // #then
  assert.deepEqual(
    texts.map((text) => text.label),
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
  );
});

t('a height slot prints one figure height for artworks of different proportions', async () => {
  // #given  a square and a 1x100 sliver, both Tiny
  const sliver: Entry = {
    ...entry,
    artwork: {
      bytes: Uint8Array.from(
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAABkCAYAAABHLFpgAAAAEklEQVR4nGP4z8Dwn2GUGEkEAJoCxzl9ksz2AAAAAElFTkSuQmCC',
          'base64',
        ),
      ),
      format: 'png',
      width: 1,
      height: 100,
    },
  };
  // #when
  const { minis } = await read(
    await generatePDF([entry, sliver], {
      pageSize: 'a4',
      numberDuplicates: false,
      marginMm: 0,
    }),
  );
  // #then  Tiny is 12 mm tall in printableminimaker ADR-0002's graded table, front and back, both entries
  assert.deepEqual(
    minis
      .flatMap((mini) => [mini.front.image, mini.back.image])
      .map((box) => asMm(box.top - box.bottom)),
    [12, 12, 12, 12],
  );
});

t('the drawer places images and cut marks at the resolved levels', async () => {
  // #given  a synthetic resolved layout whose levels differ from the Medium formula
  const options = { pageSize: 'a4', numberDuplicates: false, marginMm: 2, printerScale: 1 } as const;
  const entries = [{ ...entry, heightSlot: 'medium' as const }];
  const layout = packEntries(entries, options);
  const placement = layout.pages[0].placements[0];
  const levels = {
    floorStripTopMm: 20,
    frontTabTopMm: 30,
    frontFaceTopMm: 65,
    foldMm: 70,
    backFaceBottomMm: 75,
    backFaceTopMm: 110,
    topMm: 125,
    cutMarks: { cornersMm: [0, 125], edgeTicksMm: [20, 30, 70, 110] },
  } satisfies MiniLevels;
  placement.mini = { ...placement.mini, levels, totalHeightMm: levels.topMm };
  // #when
  const {
    minis: [mini],
  } = await read(await renderPDF(entries, layout, options));
  // #then
  assert.deepEqual(
    {
      ...unfold(mini),
      frontOnTab: asMm(mini.front.image.bottom - mini.extent.bottom),
      backUnderTab: asMm(mini.back.image.top - mini.extent.bottom),
    },
    {
      levels: [0, 20, 30, 70, 110, 125],
      kinds: ['corner', 'tick', 'tick', 'tick', 'tick', 'corner'],
      frontOnTab: 30,
      backUnderTab: 110,
    },
  );
});

t('Gargantuan stands on the tab the page leaves it', async () => {
  // #when
  const {
    minis: [mini],
  } = await read(
    await generatePDF([{ ...entry, heightSlot: 'gargantuan' }], {
      pageSize: 'letter',
      numberDuplicates: false,
      marginMm: 2,
    }),
  );
  // #then  6.5 mm tabs and a 13 mm floor under 111 mm faces, on Letter
  assert.deepEqual(unfold(mini).levels, [0, 13, 19.5, 132.5, 245.5, 252]);
});

t('every strip spans the whole cut-out, overhang and margins included', async () => {
  // #when
  const {
    minis: [mini],
  } = await read(
    await generatePDF([wide], {
      pageSize: 'a4',
      numberDuplicates: false,
      marginMm: 2,
    }),
  );
  // #then  the 52.5 mm figure overhangs its 25 mm base, and the piece is the
  //        figure plus a margin each side, top to bottom
  assert.deepEqual(
    {
      piece: widthMm(mini.extent),
      figure: widthMm(mini.front.image),
      marginLeft: asMm(mini.front.image.left - mini.extent.left),
      marginRight: asMm(mini.extent.right - mini.front.image.right),
    },
    { piece: 56.5, figure: 52.5, marginLeft: 2, marginRight: 2 },
  );
});

// Minis abut, so a mark reaching off the piece would land on its neighbour.
// Every arm runs along a cut edge or a fold, where a line belongs anyway.
t('marks stay on the piece and neighbours share a cut line', async () => {
  // #given  a row of copies, so neighbours meet edge to edge
  const copies: Entry = { ...entry, heightSlot: 'medium', count: 4 };
  // #when
  const { minis } = await read(
    await generatePDF([copies], { pageSize: 'a4', numberDuplicates: false }),
  );
  // #then
  assert.deepEqual(
    {
      inward: minis.map((mini) => mini.inward),
      shared: minis
        .slice(1)
        .map((mini, i) => asMm(mini.extent.left) === asMm(minis[i].extent.right)),
    },
    { inward: [true, true, true, true], shared: [true, true, true] },
  );
});

t('the badge marks the base, a fixed step inside it', async () => {
  // #when  square art at Medium prints 35 mm wide, so the 25 mm base sits
  // 5 mm inside the figure and 7 mm inside the mini's own left edge
  const { minis } = await read(
    await generatePDF([{ ...entry, heightSlot: 'medium' }], {
      pageSize: 'a4',
      numberDuplicates: true,
      marginMm: 2,
    }),
  );
  // #then  rotated, the base's right corner lands at the sheet's left
  const [mini] = minis;
  const badge = mini.back.badge!;
  assert.deepEqual(
    {
      baseLeftInset: asMm(badge.left - 0.8 * PT_PER_MM - mini.extent.left),
      badgeWidth: widthMm(badge),
      badgeHeight: asMm(badge.top - badge.bottom),
    },
    { baseLeftInset: 7, badgeWidth: 5.5, badgeHeight: 4.675 },
  );
});

// A print dialog on "Fit to page" shrinks the sheet by a few per cent. The bar
// is how the user finds out before cutting, so it has to be a true 100 mm.
t('only the first sheet carries a 100 mm scale bar starting at the page edge', async () => {
  // #given  a final 28 mm strip fits only after the full-height second page's rows
  const copies: Entry[] = [
    { ...entry, heightSlot: 'custom', customWidthMm: 2, customHeightMm: 10, count: 3 },
    { ...entry, heightSlot: 'custom', customWidthMm: 2, customHeightMm: 56, count: 12 },
  ];
  // #when
  const sheet = await read(
    await generatePDF(copies, { pageSize: 'a4', numberDuplicates: false, printerScale: 0.91 }),
  );
  // #then  the first bar spans exactly 100 mm after printing, and later pages have none
  assert.deepEqual(
    sheet.scaleBars.map(({ page, marks }) => {
      if (marks.length === 0) return { page, bars: 0 };
      const span = bounds(
        marks.flatMap((box) => [
          { x: box.left, y: box.bottom },
          { x: box.right, y: box.top },
        ]),
      );
      return { page, bars: 1, left: asMm(span.left), length: widthMm(span) };
    }),
    [
      { page: 0, bars: 1, left: 0, length: 109.89011 },
      { page: 1, bars: 0 },
    ],
  );
});

t('the scale bar expands by the inverse printer scale before printing', async () => {
  // #given  a printer that reduces a fitted page to 91% of its PDF size
  const printerScale = 0.91;
  // #when
  const sheet = await read(
    await generatePDF([entry], { pageSize: 'a4', numberDuplicates: false, printerScale }),
  );
  // #then  the print dialog reduces this PDF length to 100 mm on paper
  assert.equal(widthMm(sheet.scaleBars[0].marks[0]), Number((100 / printerScale).toFixed(6)));
});

t('the printer scale test sheet has a 100 mm ruler inside one selected-size page', async () => {
  // #given
  const selectedSizes = [
    ['a4', [210, 297]],
    ['letter', [216, 279]],
  ] as const;
  // #when
  const sheets = await Promise.all(
    selectedSizes.map(async ([pageSize]) => read(await generatePrinterScaleTestSheet(pageSize))),
  );
  // #then
  assert.deepEqual(
    sheets.map((sheet) => {
      const ruler = sheet.scaleBars[0].marks[0];
      const page = sheet.pageSizes[0];
      return {
        pages: sheet.pages,
        sizeMm: [asMm(page.width), asMm(page.height)],
        rulerLengthMm: widthMm(ruler),
        rulerInsidePage:
          ruler.left > 0 && ruler.right < page.width && ruler.bottom > 0 && ruler.top < page.height,
        instruction: sheet.scaleBars[0].notes.map((note) => note.label),
      };
    }),
    [
      {
        pages: 1,
        sizeMm: selectedSizes[0][1],
        rulerLengthMm: 100,
        rulerInsidePage: true,
        instruction: ['Print with Scale to Fit, measure the ruler, then enter the measured length.'],
      },
      {
        pages: 1,
        sizeMm: selectedSizes[1][1],
        rulerLengthMm: 100,
        rulerInsidePage: true,
        instruction: ['Print with Scale to Fit, measure the ruler, then enter the measured length.'],
      },
    ],
  );
});

t('every cut mark stays inside the PDF page at the default printer scale', async () => {
  // #given  a mix that places minis at every edge of the packable area
  const entries = [{ ...entry, count: 12 }, { ...wide, count: 3 }];
  // #when
  const sheet = await read(
    await generatePDFAtDefaultScale(entries, { pageSize: 'a4', numberDuplicates: false }),
  );
  // #then  the rendered cut-mark paths never reach beyond A4's physical edges
  assert.equal(
    sheet.shapes
      .filter((shape) => shape.role === 'marks')
      .every(
        ({ box }) =>
          box.left >= 0 && box.right <= 210 * PT_PER_MM && box.bottom >= 0 && box.top <= 297 * PT_PER_MM,
      ),
    true,
  );
});

t('smaller printer scales enlarge PDF mini boxes instead of shrinking them', async () => {
  // #given  the same Tiny mini, drawn for two fitted-page printer scales
  const scales = [0.91, 0.8];
  // #when
  const sheets = await Promise.all(
    scales.map(async (printerScale) =>
      read(await generatePDF([entry], { pageSize: 'a4', numberDuplicates: false, printerScale })),
    ),
  );
  // #then  each PDF box grows by the inverse scale, before Scale to Fit restores its paper size
  assert.equal(
    Number(
      (
        widthMm(sheets[1].minis[0].front.image) / widthMm(sheets[0].minis[0].front.image)
      ).toFixed(6),
    ),
    1.1375,
  );
});

t('the scale bar tells the player to print with Scale to Fit', async () => {
  // #when
  const sheet = await read(await generatePDF([entry], { pageSize: 'a4', numberDuplicates: false }));
  // #then
  assert.deepEqual(
    sheet.scaleBars.map((bar) => bar.notes.map((note) => note.label)),
    [['Print with Scale to Fit. This bar should be 100 mm; if not, reprint the printer test sheet.']],
  );
});

t('the scale bar sits in its reserved band, clear of the first row, on both page sizes', async () => {
  // #given  a tall mini, so the first row starts at the reserved band's edge
  const tall: Entry = { ...entry, heightSlot: 'large' };
  // #when
  const sheets = await Promise.all(
    (['a4', 'letter'] as const).map(async (pageSize) =>
      read(await generatePDF([tall], { pageSize, numberDuplicates: false })),
    ),
  );
  // #then  every mark and the note sit above the mini's own cut marks
  assert.deepEqual(
    sheets.map(({ scaleBars: [bar], minis: [mini] }) => {
      return {
        marksAboveRow: bar.marks.every((box) => box.bottom > mini.marks.top),
        noteAboveRow: bar.notes.every((note) => note.position.y > mini.marks.top),
        noteInsidePage: bar.notes.every((note) => note.position.x >= 0),
        // The note starts at the bar's left end, so it must clear the bar and its ticks.
        noteClearOfBar: bar.notes.every((note) =>
          bar.marks.every((box) => note.position.y > box.top),
        ),
      };
    }),
    [
      { marksAboveRow: true, noteAboveRow: true, noteInsidePage: true, noteClearOfBar: true },
      { marksAboveRow: true, noteAboveRow: true, noteInsidePage: true, noteClearOfBar: true },
    ],
  );
});

t('the scale bar note stays inside A4 and Letter at the default and full printer scales', async () => {
  // #given  the selected pages and the two supported scale states
  const options = (['a4', 'letter'] as const).flatMap((pageSize) =>
    [0.91, 1].map((printerScale) => ({ pageSize, printerScale })),
  );
  const fontDocument = await PDFDocument.create();
  const font = await fontDocument.embedFont(StandardFonts.Helvetica);
  // #when
  const sheets = await Promise.all(
    options.map(async ({ pageSize, printerScale }) =>
      read(await generatePDF([entry], { pageSize, numberDuplicates: false, printerScale })),
    ),
  );
  // #then  the physical PDF text's right edge stays inside its paper width
  assert.equal(
    sheets.every(({ pageSizes: [page], scaleBars: [bar] }, i) => {
      const note = bar.notes[0];
      return (
        note.position.x + font.widthOfTextAtSize(note.label, note.size) / options[i].printerScale <=
        page.width
      );
    }),
    true,
  );
});

t('the first sheet keeps minis below the scale bar and later sheets use the scaled top edge', async () => {
  // #given  a layout that fills the short first sheet and the full-height second sheet
  const copies: Entry[] = [
    { ...entry, heightSlot: 'custom', customWidthMm: 2, customHeightMm: 10, count: 3 },
    { ...entry, heightSlot: 'custom', customWidthMm: 2, customHeightMm: 56, count: 12 },
  ];
  // #when
  const sheet = await read(
    await generatePDF(copies, { pageSize: 'a4', numberDuplicates: false, printerScale: 0.91 }),
  );
  // #then  first-page marks stop below the reserved band, while page two reaches its top edge
  const firstPageMarks = sheet.minis.filter((mini) => mini.page === 0).map((mini) => mini.marks.top);
  const secondPageTops = sheet.minis.filter((mini) => mini.page === 1).map((mini) => mini.extent.top);
  assert.deepEqual(
    [
      Math.max(...firstPageMarks) < 287 * PT_PER_MM,
      Math.abs(asMm(Math.max(...secondPageTops)) - 297) < 0.001,
    ],
    [true, true],
  );
});

// Folding along the fold line reflects the back half onto the front, so the
// back artwork has to be the front's reflection across that line: flipped top
// to bottom only. Rotated instead, its outline lands mirrored left to right on
// the front's after folding, and the two faces cannot be cut as one.
t('the back face is the front reflected across the fold line', async () => {
  // #given  art wider than its base, so a left-right mirror would show
  // #when
  const {
    minis: [mini],
  } = await read(
    await generatePDF([wide], {
      pageSize: 'a4',
      numberDuplicates: false,
      marginMm: 2,
    }),
  );
  // #then
  const foldY = mini.fold;
  assert.deepEqual(
    {
      front: mini.front.mirror,
      back: mini.back.mirror,
      sameArtwork: mini.back.xobject === mini.front.xobject,
      sameColumn:
        [mini.back.image.left, mini.back.image.right].map(asMm).join() ===
        [mini.front.image.left, mini.front.image.right].map(asMm).join(),
      gapBelowFold: asMm(foldY - mini.front.image.top),
      gapAboveFold: asMm(mini.back.image.bottom - foldY),
    },
    {
      front: { x: false, y: false },
      back: { x: false, y: true },
      sameArtwork: true,
      sameColumn: true,
      gapBelowFold: 2,
      gapAboveFold: 2,
    },
  );
});

// A back artwork is drawn as the creature looks from behind, so after the fold
// it must read the right way round from behind. A reflection would show it
// mirrored; a 180° rotation, the same one the badge uses, does not.
const withBack: Entry = {
  ...entry,
  heightSlot: 'medium',
  backImage: new File([], 'back.png'),
  backArtwork: wide.artwork,
};

t('a back artwork prints rotated half a turn, standing on the back tab', async () => {
  // #given  a square front and a 3:2 back at Medium, 35 and 52.5 mm wide
  // #when
  const {
    minis: [mini],
  } = await read(
    await generatePDF([withBack], {
      pageSize: 'a4',
      numberDuplicates: true,
      marginMm: 2,
    }),
  );
  // #then  the cut holds the wider back; the front is centred on it
  const [, , , , backTab] = mini.levels;
  assert.deepEqual(
    {
      front: mini.front.mirror,
      back: mini.back.mirror,
      ...unfold(mini),
      piece: widthMm(mini.extent),
      frontInset: asMm(mini.front.image.left - mini.extent.left),
      frontWidth: widthMm(mini.front.image),
      backInset: asMm(mini.back.image.left - mini.extent.left),
      backWidth: widthMm(mini.back.image),
      backOnTab: asMm(backTab.y - mini.back.image.top),
      sameArtwork: mini.back.xobject === mini.front.xobject,
      badgeOnBackTab: mini.back.badge!.bottom > backTab.y && mini.back.badge!.top < mini.extent.top,
      // The base is centred in the 52.5 mm column, not under the 35 mm front.
      baseLeftInset: asMm(mini.back.badge!.left - 0.8 * PT_PER_MM - mini.extent.left),
    },
    {
      front: { x: false, y: false },
      back: { x: true, y: true },
      levels: [0, 25, 37.5, 74.5, 111.5, 124],
      kinds: ['corner', 'tick', 'tick', 'tick', 'tick', 'corner'],
      piece: 56.5,
      frontInset: 10.75,
      frontWidth: 35,
      backInset: 2,
      backWidth: 52.5,
      backOnTab: 0,
      sameArtwork: false,
      badgeOnBackTab: true,
      baseLeftInset: 15.75,
    },
  );
});

t(
  'a back artwork the width cap shortens keeps the halves equal and its feet on the tab',
  async () => {
    // #given  a 4:1 back prints 52.5 x 13.125 mm behind a 35 mm square front
    const short: Entry = {
      ...withBack,
      backArtwork: {
        bytes: Uint8Array.from(
          Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAQAAAABCAIAAAB2XpiaAAAAC0lEQVR4nGNgQAIAAA0AATBGj/4AAAAASUVORK5CYII=',
            'base64',
          ),
        ),
        format: 'png',
        width: 4,
        height: 1,
      },
    };
    // #when
    const {
      minis: [mini],
    } = await read(
      await generatePDF([short], {
        pageSize: 'a4',
        numberDuplicates: false,
        marginMm: 2,
      }),
    );
    // #then  blank paper is left by the fold, not under the feet
    const [, , , , backTab] = mini.levels;
    assert.deepEqual(
      {
        levels: unfold(mini).levels,
        backHeight: asMm(mini.back.image.top - mini.back.image.bottom),
        backOnTab: asMm(backTab.y - mini.back.image.top),
      },
      { levels: [0, 25, 37.5, 74.5, 111.5, 124], backHeight: 13.125, backOnTab: 0 },
    );
  },
);

t(
  'a front the width cap shortens stands on its tab, and the back still meets its own',
  async () => {
    // #given  a 4:1 front prints 52.5 x 13.125 mm before a 35 mm square back
    const shortFront: Entry = {
      ...withBack,
      artwork: {
        bytes: Uint8Array.from(
          Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAQAAAABCAIAAAB2XpiaAAAAC0lEQVR4nGNgQAIAAA0AATBGj/4AAAAASUVORK5CYII=',
            'base64',
          ),
        ),
        format: 'png',
        width: 4,
        height: 1,
      },
      backArtwork: entry.artwork,
    };
    // #when
    const {
      minis: [mini],
    } = await read(
      await generatePDF([shortFront], {
        pageSize: 'a4',
        numberDuplicates: false,
        marginMm: 2,
      }),
    );
    // #then  both halves are 35 mm faces, so the fold and the back tab do not move
    const [, , frontTab, , backTab] = mini.levels;
    assert.deepEqual(
      {
        levels: unfold(mini).levels,
        front: [
          asMm(mini.front.image.bottom - frontTab.y),
          asMm(mini.front.image.top - mini.front.image.bottom),
        ],
        back: [
          asMm(backTab.y - mini.back.image.top),
          asMm(mini.back.image.top - mini.back.image.bottom),
        ],
      },
      {
        levels: [0, 25, 37.5, 74.5, 111.5, 124],
        front: [0, 13.125],
        back: [0, 35],
      },
    );
  },
);

t('one sheet mixes reflected and rotated backs, and waits for a back still loading', async () => {
  // #given  a back still loading, then a plain entry, then one with its back
  const loading: Entry = { ...withBack, backArtwork: null };
  // #when
  const { minis } = await read(
    await generatePDF([loading, { ...entry, heightSlot: 'medium' }, withBack], {
      pageSize: 'a4',
      numberDuplicates: false,
    }),
  );
  // #then  packing puts the wider mini first
  assert.deepEqual(
    minis.map((mini) => [mini.back.mirror, widthMm(mini.back.image)]),
    [
      [{ x: true, y: true }, 52.5],
      [{ x: false, y: true }, 35],
    ],
  );
});
