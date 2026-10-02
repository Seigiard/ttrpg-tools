import { atom, computed, readonlyType } from 'nanostores';
import {
  createCanvasArtwork,
  isSupportedArtwork,
  type ArtworkPreparation,
  type PaperMinisArtwork,
} from '@/lib/paper-minis/artwork';
import { artworkMimeType } from '@/lib/paper-minis/artwork-formats';
import { planBatch } from '@/lib/paper-minis/batch-plan';
import { calibrationAfterChange } from '@/lib/paper-minis/calibration-reset-policy';
import {
  calibrationGap,
  calibrationRange,
  calibrationSessionResult,
  moveCalibrationLine as moveSessionLine,
  openCalibrationSession,
  setCalibrationLine as setSessionLine,
  type CalibrationLine,
  type CalibrationRange,
  type CalibrationSession as CalibrationDraft,
} from '@/lib/paper-minis/calibration-session';
import { canvasToPngBytes } from '@/lib/paper-minis/canvas';
import {
  DEFAULT_FIGURE_MARGIN_MM,
  DEFAULT_PRINTER_SCALE,
  entryStatusWarning,
  type PackOptions,
  type PageSizeKey,
} from '@/lib/paper-minis/geometry';
import { generatePDF } from '@/lib/paper-minis/pdf';
import { packEntries, resolveEntry, type PackResult } from '@/lib/paper-minis/packing';
import {
  DEFAULT_CUSTOM_HEIGHT_MM,
  DEFAULT_CUSTOM_WIDTH_MM,
  DEFAULT_HEIGHT_SLOT,
  resolveFigureHeightMm,
} from '@/lib/paper-minis/sizes';
import type {
  Entry,
  HeightCalibration,
  MiniSize,
  PreparedArtwork,
} from '@/lib/paper-minis/types';

export type MiniRow = Entry & { id: number };
export type PaperMinisSettings = {
  pageSize: PageSizeKey;
  marginMm: number;
  printerMeasurementMm?: number;
  numberDuplicates: boolean;
  normalization: boolean;
};
export type NumericInput = { text: string; valid: boolean };
export type PaperMinisInputs = {
  margin: NumericInput;
  printerMeasurement: NumericInput;
  rows: Record<
    number,
    {
      count: NumericInput;
      customWidthMm: NumericInput;
      customHeightMm: NumericInput;
    }
  >;
};
export type PaperMinisRenderer = (
  rows: readonly MiniRow[],
  layout: PackResult,
  settings: Readonly<PackOptions>,
) => Promise<Uint8Array>;
export type PaperMinisStoreDependencies = {
  renderer?: PaperMinisRenderer;
  artwork?: PaperMinisArtwork;
};
export type { ArtworkPreparation, PaperMinisArtwork };
type Preview = { bytes: Uint8Array; revision: number };
export type CalibrationSession = CalibrationDraft & {
  rowLabel: string;
  artwork: PreparedArtwork;
  backArtwork?: PreparedArtwork | null;
  ranges: Record<CalibrationLine, CalibrationRange>;
  slotHeightMm: number;
  printedHeightMm: number;
  warning?: string;
  warningTone?: 'warning' | 'danger';
};
const storageKey = 'pmg-settings';
const successMessage = 'PDF готов.';
const failureMessage = 'Не удалось создать PDF. Попробуйте ещё раз или уменьшите изображения.';
const marginDraftError = 'Поля должны быть числом от 0 мм.';
// Below 100 mm the printer shrinks the page (Scale to Fit); above, it enlarges
// and crops it (Fill Entire Paper).
const MIN_PRINTER_MEASUREMENT_MM = 80;
const MAX_PRINTER_MEASUREMENT_MM = 120;
const printerMeasurementDraftError = `Длина линейки должна быть числом от ${MIN_PRINTER_MEASUREMENT_MM} до ${MAX_PRINTER_MEASUREMENT_MM} мм.`;
const rowDraftError = 'Количество должно быть целым числом от 1, размеры — больше 0 мм.';

function inputsForRow(row: Pick<Entry, 'count' | 'customWidthMm' | 'customHeightMm'>) {
  return {
    count: { text: String(row.count), valid: true },
    customWidthMm: {
      text: row.customWidthMm === undefined ? '' : String(row.customWidthMm),
      valid: row.customWidthMm !== undefined,
    },
    customHeightMm: {
      text: row.customHeightMm === undefined ? '' : String(row.customHeightMm),
      valid: row.customHeightMm !== undefined,
    },
  };
}

function marginInput(settings: Readonly<PaperMinisSettings>) {
  return { text: String(settings.marginMm), valid: true };
}
function printerMeasurementInput(settings: Readonly<PaperMinisSettings>) {
  return {
    text:
      settings.printerMeasurementMm === undefined ? '' : String(settings.printerMeasurementMm),
    valid: true,
  };
}

function packOptions(settings: Readonly<PaperMinisSettings>): PackOptions {
  return {
    pageSize: settings.pageSize,
    marginMm: settings.marginMm,
    numberDuplicates: settings.numberDuplicates,
    printerScale:
      settings.printerMeasurementMm === undefined
        ? DEFAULT_PRINTER_SCALE
        : settings.printerMeasurementMm / 100,
  };
}
const exportSuccessMessage = 'Архив готов.';
const exportFailureMessage = 'Не удалось создать архив. Попробуйте ещё раз.';
const unzipFailureMessage =
  'Не удалось распаковать архив. Добавьте изображения вручную или попробуйте другой файл.';
const skippedFilesMessage = 'Некоторые файлы пропущены: поддерживаются PNG, JPG и WebP.';
const artworkTypesByExtension: Record<string, string> = {
  jpg: artworkMimeType('jpg'),
  jpeg: artworkMimeType('jpg'),
  png: artworkMimeType('png'),
  webp: artworkMimeType('webp'),
};

function parseNumericInput(text: string, accepts: (value: number) => boolean) {
  if (text.trim() === '') return { input: { text, valid: false } };
  const value = Number(text);
  return Number.isFinite(value) && accepts(value)
    ? { input: { text, valid: true }, value }
    : { input: { text, valid: false } };
}

const nameSeparators = /[-_\s\\/:*?"<>|]+/;

function exportName(row: MiniRow, index: number): string {
  const name = row.name?.trim() ?? '';
  const safe = name
    .split(nameSeparators)
    .filter((part) => part !== '')
    .join('-');
  return safe || `mini-${index + 1}`;
}

function exportSize(row: MiniRow): string {
  if (row.heightSlot === 'custom') {
    const width = row.customWidthMm ?? DEFAULT_CUSTOM_WIDTH_MM;
    const height = row.customHeightMm ?? DEFAULT_CUSTOM_HEIGHT_MM;
    return `custom-${width}x${height}`;
  }
  return row.heightSlot;
}

function exportCount(row: MiniRow): string {
  return row.count > 1 ? `-x${row.count}` : '';
}

function exportCalibration(row: MiniRow): string {
  const calibration = row.calibration;
  if (!calibration || calibrationGap(calibration) === undefined) return '';
  const head = String(Math.round(calibration.head * 1000)).padStart(3, '0');
  const feet = String(Math.round(calibration.feet * 1000)).padStart(3, '0');
  return `-h${head}-f${feet}`;
}

function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

function flattenedFileName(path: string): string | undefined {
  return path.split(/[\\/]/).findLast((part) => part !== '');
}

function isIgnoredZipEntry(path: string): boolean {
  const name = flattenedFileName(path);
  return (
    path.endsWith('/') ||
    path.startsWith('__MACOSX/') ||
    name === undefined ||
    name.startsWith('._') ||
    name === '.DS_Store'
  );
}

function isZipFile(file: File): boolean {
  return file.type.toLowerCase() === 'application/zip' || fileExtension(file.name) === 'zip';
}

function artworkTypeFromName(name: string): string | undefined {
  return artworkTypesByExtension[fileExtension(name)];
}

async function artworkAsPng(artwork: PreparedArtwork): Promise<Uint8Array> {
  if (artwork.format === 'png') return artwork.bytes;
  const bitmap = await createImageBitmap(new Blob([artwork.bytes as BlobPart], { type: artworkMimeType('jpg') }), {
    imageOrientation: 'none',
  });
  const canvas = document.createElement('canvas');
  try {
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D canvas context');
    ctx.drawImage(bitmap, 0, 0);
    return canvasToPngBytes(canvas);
  } finally {
    bitmap.close();
    canvas.width = canvas.height = 0;
  }
}

export function createPaperMinisStore({
  renderer = generatePDF,
  artwork = createCanvasArtwork(),
}: PaperMinisStoreDependencies = {}) {
  const $rows = atom<MiniRow[]>([]);
  const initialSettings: PaperMinisSettings = {
    pageSize: 'a4',
    marginMm: DEFAULT_FIGURE_MARGIN_MM,
    numberDuplicates: false,
    normalization: true,
  };
  const $settings = atom(initialSettings);
  const $inputs = atom<PaperMinisInputs>({
    margin: marginInput(initialSettings),
    printerMeasurement: printerMeasurementInput(initialSettings),
    rows: {},
  });
  const $draftError = computed([$inputs, $rows], (inputs, rows) => {
    if (!inputs.margin.valid) return marginDraftError;
    if (!inputs.printerMeasurement.valid) return printerMeasurementDraftError;
    const valid = rows.every((row) => {
      const rowInputs = inputs.rows[row.id];
      return (
        rowInputs?.count.valid === true &&
        (row.heightSlot !== 'custom' ||
          (rowInputs.customWidthMm.valid && rowInputs.customHeightMm.valid))
      );
    });
    return valid ? '' : rowDraftError;
  });
  const $inputsValid = computed($draftError, (error) => error === '');
  const $message = atom('');
  const $revision = atom(0);
  const $busy = atom(false);
  const $preparing = atom(false);
  const $preview = atom<Preview | undefined>(undefined);
  const $calibration = atom<CalibrationSession | undefined>(undefined);
  const $layout = computed([$rows, $settings], (rows, currentSettings) =>
    packEntries(rows, packOptions(currentSettings)),
  );
  const $canGenerate = computed(
    [$busy, $preparing, $layout, $inputsValid],
    (busy, preparing, layout, inputsValid) =>
      !busy && !preparing && layout.miniCount > 0 && inputsValid,
  );
  const $acceptsFiles = computed(
    [$busy, $calibration],
    (busy, calibration) => !busy && calibration === undefined,
  );
  const $previewStale = computed(
    [$preview, $revision],
    (preview, revision) => preview !== undefined && preview.revision !== revision,
  );
  let nextId = 0;
  let nextLoadId = 0;
  const loads = new Map<string, object>();

  function calibrationSession(
    row: MiniRow,
    draft: CalibrationDraft,
  ): CalibrationSession | undefined {
    if (!row.artwork) return undefined;
    const result = calibrationSessionResult(draft);
    const calibration = result.state === 'changed' ? result.calibration : row.calibration;
    // Every copy shares one geometry, so a single copy is enough to preview it.
    const resolved = resolveEntry(
      { ...row, calibration, count: 1 },
      0,
      packOptions($settings.get()),
    );
    const { mini } = resolved;
    if (!mini) return undefined;
    const warning = entryStatusWarning(resolved.status);
    return {
      ...draft,
      rowLabel: row.name || 'Миниатюра',
      artwork: row.artwork,
      backArtwork: row.backArtwork,
      ranges: {
        head: calibrationRange(draft.lines, 'head'),
        feet: calibrationRange(draft.lines, 'feet'),
      },
      slotHeightMm: resolveFigureHeightMm(row),
      printedHeightMm: mini.copies[0].imageHeightMm,
      warning,
      ...(warning && {
        warningTone: resolved.status.state === 'oversized' ? ('danger' as const) : ('warning' as const),
      }),
    };
  }

  function cancelCalibration() {
    $calibration.set(undefined);
  }

  function openCalibration(id: number) {
    // Only zip expansion blocks: its rows do not exist yet, and an open session would make
    // the finished expansion drop them. A single image loading never touches a ready row.
    if ($busy.get() || [...loads.keys()].some((key) => key.startsWith('zip:'))) return false;
    const row = $rows.get().find((candidate) => candidate.id === id);
    if (!row?.artwork) return false;
    const draft = openCalibrationSession(
      row.id,
      row.calibration,
      row.artwork.height,
      row.backArtwork?.height,
    );
    const session = calibrationSession(row, draft);
    if (!session) return false;
    $calibration.set(session);
    return true;
  }

  function editCalibration(edit: (session: CalibrationSession) => CalibrationDraft) {
    const session = $calibration.get();
    if (!session) return;
    const row = $rows.get().find((candidate) => candidate.id === session.rowId);
    if (!row?.artwork) {
      cancelCalibration();
      return;
    }
    const draft = edit(session);
    if (draft === session) return;
    const next = calibrationSession(row, draft);
    if (next) $calibration.set(next);
    else cancelCalibration();
  }

  function updateCalibration(line: CalibrationLine, fraction: number) {
    editCalibration((session) => setSessionLine(session, line, fraction));
  }

  function applyCalibration() {
    const session = $calibration.get();
    if (!session) return false;
    const result = calibrationSessionResult(session);
    if (result.state === 'invalid') return false;
    if (result.state === 'changed') updateRow(session.rowId, { calibration: result.calibration });
    cancelCalibration();
    return true;
  }

  function resetCalibration(id: number) {
    const row = $rows.get().find((candidate) => candidate.id === id);
    if (!row?.calibration) return;
    updateRow(id, { calibration: calibrationAfterChange(row, 'reset') });
  }

  function changed() {
    $revision.set($revision.get() + 1);
  }
  function setRowInput(
    id: number,
    fields: Partial<PaperMinisInputs['rows'][number]>,
  ) {
    const inputs = $inputs.get();
    const row = inputs.rows[id];
    if (!row) return;
    $inputs.set({
      ...inputs,
      rows: { ...inputs.rows, [id]: { ...row, ...fields } },
    });
  }
  function updateRow(id: number, fields: Partial<Entry>) {
    if ($busy.get()) return;
    const previous = $rows.get().find((row) => row.id === id);
    $rows.set($rows.get().map((row) => (row.id === id ? { ...row, ...fields } : row)));
    const next = $rows.get().find((row) => row.id === id);
    if (
      $calibration.get()?.rowId === id &&
      previous &&
      next &&
      (previous.artwork !== next.artwork || previous.backArtwork !== next.backArtwork)
    )
      cancelCalibration();
    changed();
  }
  function addBlank({
    name,
    heightSlot,
    customWidthMm,
    customHeightMm,
    count,
    calibration,
  }: {
    name?: string;
    heightSlot?: MiniSize;
    customWidthMm?: number;
    customHeightMm?: number;
    count?: number;
    calibration?: HeightCalibration;
  } = {}) {
    if ($busy.get()) return;
    const row: MiniRow = {
      id: nextId++,
      ...(name === undefined ? {} : { name }),
      image: null,
      artwork: null,
      heightSlot: heightSlot ?? DEFAULT_HEIGHT_SLOT,
      count: count ?? 1,
      ...(customWidthMm === undefined ? {} : { customWidthMm }),
      ...(customHeightMm === undefined ? {} : { customHeightMm }),
      ...(calibration === undefined ? {} : { calibration }),
    };
    $rows.set([...$rows.get(), row]);
    $inputs.set({
      ...$inputs.get(),
      rows: {
        ...$inputs.get().rows,
        [row.id]: inputsForRow(row),
      },
    });
    changed();
    return row.id;
  }
  function setSize(id: number, size: MiniSize) {
    if ($busy.get()) return;
    const row = $rows.get().find((candidate) => candidate.id === id);
    if (!row) return;
    const customWidthMm = row.customWidthMm ?? DEFAULT_CUSTOM_WIDTH_MM;
    const customHeightMm = row.customHeightMm ?? DEFAULT_CUSTOM_HEIGHT_MM;
    const fields =
      size === 'custom'
        ? { heightSlot: size, customWidthMm, customHeightMm }
        : { heightSlot: size };
    const nextRow = Object.assign({}, row, fields);
    $rows.set($rows.get().map((candidate) => (candidate.id === id ? nextRow : candidate)));
    if (size === 'custom') {
      const inputs = $inputs.get();
      const seeded = inputsForRow(nextRow);
      $inputs.set({
        ...inputs,
        rows: {
          ...inputs.rows,
          [id]: {
            ...seeded,
            count: inputs.rows[id]?.count ?? seeded.count,
          },
        },
      });
    }
    changed();
  }
  function setAllSizes(size: MiniSize) {
    if ($busy.get() || !$rows.get().length) return;
    const inputs = $inputs.get();
    const nextInputs = { ...inputs.rows };
    $rows.set(
      $rows.get().map((row) => {
        if (size !== 'custom') return Object.assign({}, row, { heightSlot: size });
        const customWidthMm = row.customWidthMm ?? DEFAULT_CUSTOM_WIDTH_MM;
        const customHeightMm = row.customHeightMm ?? DEFAULT_CUSTOM_HEIGHT_MM;
        const nextRow = Object.assign({}, row, {
          heightSlot: size,
          customWidthMm,
          customHeightMm,
        });
        const seeded = inputsForRow(nextRow);
        nextInputs[row.id] = {
          ...seeded,
          count: nextInputs[row.id]?.count ?? seeded.count,
        };
        return nextRow;
      }),
    );
    if (size === 'custom') $inputs.set({ ...inputs, rows: nextInputs });
    changed();
  }
  function setCount(id: number, text: string) {
    if ($busy.get()) return;
    const row = $rows.get().find((candidate) => candidate.id === id);
    if (!row) return;
    const { input, value } = parseNumericInput(
      text,
      (candidate) => Number.isInteger(candidate) && candidate >= 1,
    );
    setRowInput(id, { count: input });
    if (value === undefined || value === row.count) return;
    $rows.set(
      $rows.get().map((candidate) =>
        candidate.id === id ? Object.assign({}, candidate, { count: value }) : candidate,
      ),
    );
    changed();
  }
  function commitCount(id: number) {
    if ($busy.get()) return;
    const row = $rows.get().find((candidate) => candidate.id === id);
    const input = $inputs.get().rows[id]?.count;
    if (!row || input?.valid !== false) return;
    setRowInput(id, { count: { text: String(row.count), valid: true } });
  }
  function setCustomDimensions(
    id: number,
    fields: { width?: string; height?: string },
  ) {
    if ($busy.get()) return;
    const row = $rows.get().find((candidate) => candidate.id === id);
    if (!row) return;
    let next = row;
    const inputs: Partial<PaperMinisInputs['rows'][number]> = {};
    if (fields.width !== undefined) {
      const { input, value } = parseNumericInput(fields.width, (candidate) => candidate > 0);
      inputs.customWidthMm = input;
      if (value !== undefined && value !== next.customWidthMm)
        next = { ...next, customWidthMm: value };
    }
    if (fields.height !== undefined) {
      const { input, value } = parseNumericInput(fields.height, (candidate) => candidate > 0);
      inputs.customHeightMm = input;
      if (value !== undefined && value !== next.customHeightMm)
        next = { ...next, customHeightMm: value };
    }
    setRowInput(id, inputs);
    if (next === row) return;
    $rows.set($rows.get().map((candidate) => (candidate.id === id ? next : candidate)));
    changed();
  }
  function commitCustomDimension(id: number, dimension: 'width' | 'height') {
    if ($busy.get()) return;
    const row = $rows.get().find((candidate) => candidate.id === id);
    const inputKey = dimension === 'width' ? 'customWidthMm' : 'customHeightMm';
    const value = row?.[inputKey];
    const input = $inputs.get().rows[id]?.[inputKey];
    if (value === undefined || input?.valid !== false) return;
    setRowInput(id, { [inputKey]: { text: String(value), valid: true } });
  }
  async function setImage(id: number, file: File, back = false) {
    if (!$acceptsFiles.get()) return;
    if (!isSupportedArtwork(file)) {
      $message.set('Выберите PNG, JPG или WebP.');
      return;
    }
    const key = `${id}:${back}`;
    const token = {};
    loads.set(key, token);
    $preparing.set(true);
    const normalization = $settings.get().normalization;
    const selectedRow = $rows.get().find((candidate) => candidate.id === id);
    const calibration = selectedRow
      ? calibrationAfterChange(selectedRow, back ? 'select-back' : 'select-front')
      : undefined;
    updateRow(
      id,
      back
        ? {
            backImage: file,
            backArtwork: null,
            calibration,
            backWarning: undefined,
          }
        : {
            image: file,
            artwork: null,
            calibration,
            normalizationWarning: undefined,
            frontError: undefined,
          },
    );
    const current = () => loads.get(key) === token && $rows.get().some((row) => row.id === id);
    try {
      const result = await artwork.prepare(file, { normalize: normalization, isCurrent: current });
      if (!current()) return;
      updateRow(
        id,
        back
          ? {
              backArtwork: result.artwork,
              backWarning: result.warning && `Оборот: ${result.warning}`,
            }
          : { artwork: result.artwork, normalizationWarning: result.warning },
      );
    } catch {
      if (!current()) return;
      updateRow(
        id,
        back
          ? {
              backImage: null,
              backArtwork: null,
              backWarning:
                'Не удалось загрузить оборот. Будет использовано отражение лицевой стороны.',
            }
          : { frontError: 'Не удалось загрузить изображение. Попробуйте другой файл.' },
      );
    } finally {
      if (loads.get(key) === token) loads.delete(key);
      $preparing.set(loads.size > 0);
    }
  }
  async function ingest(files: File[]) {
    if (!$acceptsFiles.get()) return;
    const hasZip = files.some(isZipFile);
    if (!hasZip) {
      const valid = files.filter(isSupportedArtwork);
      $message.set(valid.length < files.length ? skippedFilesMessage : '');
      ingestArtworkFiles(valid);
      return;
    }
    const key = `zip:${nextLoadId++}`;
    const token = {};
    loads.set(key, token);
    $preparing.set(true);
    try {
      const { unzipSync } = await import('fflate');
      const expanded = await Promise.all(
        files.map(async (file): Promise<{ files: File[]; skipped: boolean; failed: boolean }> => {
          if (!isZipFile(file)) {
            return isSupportedArtwork(file)
              ? { files: [file], skipped: false, failed: false }
              : { files: [], skipped: true, failed: false };
          }
          try {
            const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
            const extracted: File[] = [];
            let skipped = false;
            for (const [path, bytes] of Object.entries(entries)) {
              if (isIgnoredZipEntry(path)) continue;
              const name = flattenedFileName(path);
              const type = name && artworkTypeFromName(name);
              if (!name || !type) {
                if (name) skipped = true;
                continue;
              }
              extracted.push(new File([bytes], name, { type }));
            }
            return { files: extracted, skipped, failed: false };
          } catch {
            return { files: [], skipped: false, failed: true };
          }
        }),
      );
      if (!$acceptsFiles.get()) {
        $message.set(unzipFailureMessage);
        return;
      }
      const valid = expanded.flatMap((item) => item.files);
      const failed = expanded.some((item) => item.failed);
      const skipped = expanded.some((item) => item.skipped);
      $message.set(failed ? unzipFailureMessage : skipped ? skippedFilesMessage : '');
      ingestArtworkFiles(valid);
    } catch {
      if (!$acceptsFiles.get()) return;
      const valid = files.filter((file) => !isZipFile(file) && isSupportedArtwork(file));
      $message.set(unzipFailureMessage);
      ingestArtworkFiles(valid);
    } finally {
      if (loads.get(key) === token) loads.delete(key);
      $preparing.set(loads.size > 0);
    }
  }
  function ingestArtworkFiles(files: File[]) {
    for (const planned of planBatch(files)) {
      const id = addBlank(planned);
      if (id === undefined) continue;
      void setImage(id, planned.front);
      if (planned.back) void setImage(id, planned.back, true);
    }
  }
  function validatedSettings(value: unknown, previous: PaperMinisSettings) {
    if (!value || typeof value !== 'object') return previous;
    const fields = value as Record<string, unknown>;
    const next = { ...previous };
    if (fields.pageSize === 'a4' || fields.pageSize === 'letter') next.pageSize = fields.pageSize;
    if (
      typeof fields.marginMm === 'number' &&
      Number.isFinite(fields.marginMm) &&
      fields.marginMm >= 0
    )
      next.marginMm = fields.marginMm;
    if (isValidPrinterMeasurement(fields.printerMeasurementMm))
      next.printerMeasurementMm = fields.printerMeasurementMm;
    if (typeof fields.numberDuplicates === 'boolean')
      next.numberDuplicates = fields.numberDuplicates;
    if (typeof fields.normalization === 'boolean') next.normalization = fields.normalization;
    return next;
  }
  function applyNormalizationChange() {
    cancelCalibration();
    $rows.set(
      $rows
        .get()
        .map((row) =>
          Object.assign({}, row, {
            calibration: calibrationAfterChange(row, 'toggle-normalization'),
          }),
        ),
    );
    for (const row of $rows.get()) {
      if (row.image) void setImage(row.id, row.image);
      if (row.backImage) void setImage(row.id, row.backImage, true);
    }
  }
  function settings(fields: Partial<PaperMinisSettings>) {
    if ($busy.get()) return;
    const previous = $settings.get();
    const next = validatedSettings(fields, previous);
    if ('printerMeasurementMm' in fields && fields.printerMeasurementMm === undefined)
      delete next.printerMeasurementMm;
    $settings.set(next);
    if (
      next.marginMm !== previous.marginMm ||
      next.printerMeasurementMm !== previous.printerMeasurementMm
    )
      $inputs.set({
        ...$inputs.get(),
        margin: marginInput(next),
        printerMeasurement: printerMeasurementInput(next),
      });
    changed();
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* Storage is optional. */
    }
    if (previous.normalization !== next.normalization) applyNormalizationChange();
  }
  function setMargin(text: string) {
    if ($busy.get()) return;
    const { input, value } = parseNumericInput(text, (candidate) => candidate >= 0);
    $inputs.set({ ...$inputs.get(), margin: input });
    if (value === undefined || value === $settings.get().marginMm) return;
    settings({ marginMm: value });
    $inputs.set({ ...$inputs.get(), margin: input });
  }
  function commitMargin() {
    if ($busy.get() || $inputs.get().margin.valid) return;
    $inputs.set({
      ...$inputs.get(),
      margin: marginInput($settings.get()),
    });
  }
  function setPrinterMeasurement(text: string) {
    if ($busy.get()) return;
    if (text.trim() === '') {
      $inputs.set({
        ...$inputs.get(),
        printerMeasurement: { text, valid: true },
      });
      if ($settings.get().printerMeasurementMm !== undefined)
        settings({ printerMeasurementMm: undefined });
      return;
    }
    const { input, value } = parseNumericInput(
      text,
      (candidate) =>
        candidate >= MIN_PRINTER_MEASUREMENT_MM && candidate <= MAX_PRINTER_MEASUREMENT_MM,
    );
    $inputs.set({ ...$inputs.get(), printerMeasurement: input });
    if (value === undefined || value === $settings.get().printerMeasurementMm) return;
    settings({ printerMeasurementMm: value });
    $inputs.set({ ...$inputs.get(), printerMeasurement: input });
  }
  function commitPrinterMeasurement() {
    if ($busy.get() || $inputs.get().printerMeasurement.valid) return;
    $inputs.set({
      ...$inputs.get(),
      printerMeasurement: printerMeasurementInput($settings.get()),
    });
  }
  function loadSettings() {
    if ($busy.get()) return;
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      const previous = $settings.get();
      const next = validatedSettings(value, previous);
      if (
        value &&
        typeof value === 'object' &&
        'printerMeasurementMm' in value &&
        !isValidPrinterMeasurement(value.printerMeasurementMm)
      )
        delete next.printerMeasurementMm;
      $settings.set(next);
      $inputs.set({
        ...$inputs.get(),
        margin: marginInput(next),
        printerMeasurement: printerMeasurementInput(next),
      });
      if (previous.normalization !== next.normalization) applyNormalizationChange();
    } catch {
      /* Use defaults when storage is unavailable. */
    }
  }
  async function render() {
    if (!$canGenerate.get()) return;
    const layout = $layout.get();
    $busy.set(true);
    $message.set('');
    const rows = $rows.get().map((row) => Object.assign({}, row));
    const snapshotSettings = packOptions($settings.get());
    const revision = $revision.get();
    try {
      const bytes = await renderer(rows, layout, snapshotSettings);
      $message.set(successMessage);
      return { bytes, revision };
    } catch {
      $message.set(failureMessage);
    } finally {
      $busy.set(false);
    }
  }
  async function exportZip() {
    if ($busy.get() || $preparing.get()) return;
    const rows = $rows.get();
    const ready = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.artwork);
    if (!ready.length) return;
    $busy.set(true);
    $message.set('');
    try {
      const { zipSync } = await import('fflate');
      const entries: Record<string, Uint8Array> = {};
      const used = new Set<string>();
      for (const { row, index } of ready) {
        const sides = row.backArtwork ? (['front', 'back'] as const) : (['front'] as const);
        const base = exportName(row, index);
        const size = exportSize(row);
        const count = exportCount(row);
        const calibration = exportCalibration(row);
        let suffix = 1;
        let collisionKeys = sides.map((side) => `${base}-${size}-${side}.png`);
        let names = sides.map((side) => `${base}-${size}-${side}${count}${calibration}.png`);
        while (collisionKeys.some((name) => used.has(name.toLowerCase()))) {
          suffix += 1;
          collisionKeys = sides.map((side) => `${base}-${suffix}-${size}-${side}.png`);
          names = sides.map((side) => `${base}-${suffix}-${size}-${side}${count}${calibration}.png`);
        }
        for (const name of collisionKeys) used.add(name.toLowerCase());
        entries[names[0]] = await artworkAsPng(row.artwork!);
        if (row.backArtwork) entries[names[1]] = await artworkAsPng(row.backArtwork);
      }
      const bytes = zipSync(entries, { level: 0 });
      $message.set(exportSuccessMessage);
      return bytes;
    } catch {
      $message.set(exportFailureMessage);
    } finally {
      $busy.set(false);
    }
  }
  return {
    $rows: readonlyType($rows),
    $settings: readonlyType($settings),
    $inputs: readonlyType($inputs),
    $inputsValid,
    $draftError,
    $message: readonlyType($message),
    $revision: readonlyType($revision),
    $busy: readonlyType($busy),
    $preparing: readonlyType($preparing),
    $preview: readonlyType($preview),
    $previewStale,
    $calibration: readonlyType($calibration),
    $acceptsFiles,
    $layout,
    $canGenerate,
    addBlank,
    setSize,
    setAllSizes,
    setCount,
    commitCount,
    setCustomDimensions,
    commitCustomDimension,
    setImage,
    ingest,
    settings,
    setMargin,
    commitMargin,
    setPrinterMeasurement,
    commitPrinterMeasurement,
    loadSettings,
    openCalibration,
    setCalibrationLine: updateCalibration,
    moveCalibrationLine(line: CalibrationLine, pixels: number) {
      editCalibration((session) => moveSessionLine(session, line, pixels));
    },
    applyCalibration,
    cancelCalibration,
    resetCalibration,
    reportPdfFailure() {
      $message.set(failureMessage);
    },
    reportExportFailure() {
      $message.set(exportFailureMessage);
    },
    async download() {
      return (await render())?.bytes;
    },
    exportZip,
    async refreshPreview() {
      const preview = await render();
      if (preview) $preview.set(preview);
    },
    clearBack(id: number) {
      if ($busy.get()) return;
      loads.delete(`${id}:true`);
      const row = $rows.get().find((candidate) => candidate.id === id);
      updateRow(id, {
        backImage: null,
        backArtwork: null,
        calibration: row ? calibrationAfterChange(row, 'clear-back') : undefined,
        backWarning: undefined,
      });
      $preparing.set(loads.size > 0);
    },
    remove(id: number) {
      if ($busy.get()) return;
      if ($calibration.get()?.rowId === id) cancelCalibration();
      loads.delete(`${id}:true`);
      loads.delete(`${id}:false`);
      $rows.set($rows.get().filter((row) => row.id !== id));
      const inputs = $inputs.get();
      const rows = { ...inputs.rows };
      delete rows[id];
      $inputs.set({ ...inputs, rows });
      changed();
      $preparing.set(loads.size > 0);
    },
    duplicate(id: number) {
      if ($busy.get()) return;
      const rows = $rows.get();
      const index = rows.findIndex((row) => row.id === id);
      if (index < 0) return;
      const copy = { ...rows[index], id: nextId++ };
      $rows.set([...rows.slice(0, index + 1), copy, ...rows.slice(index + 1)]);
      const inputs = $inputs.get();
      $inputs.set({
        ...inputs,
        rows: {
          ...inputs.rows,
          [copy.id]: inputsForRow(copy),
        },
      });
      changed();
      if (copy.image && !copy.artwork) void setImage(copy.id, copy.image);
      if (copy.backImage && !copy.backArtwork) void setImage(copy.id, copy.backImage, true);
    },
  };
}

function isValidPrinterMeasurement(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_PRINTER_MEASUREMENT_MM &&
    value <= MAX_PRINTER_MEASUREMENT_MM
  );
}
