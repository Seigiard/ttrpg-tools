import { atom, computed } from 'nanostores';
import {
  createCanvasArtwork,
  isSupportedArtwork,
  type ArtworkPreparation,
  type PaperMinisArtwork,
} from '@/lib/paper-minis/artwork';
import { planBatch } from '@/lib/paper-minis/batch-plan';
import {
  calibrationChanged,
  calibrationGap,
  calibrationRange,
  DEFAULT_CALIBRATION,
  setCalibrationLine as setLine,
  type CalibrationLine,
  type CalibrationRange,
} from '@/lib/paper-minis/calibration';
import {
  DEFAULT_FIGURE_MARGIN_MM,
  fitLimitWarning,
  fitMiniFaces,
  type PageSizeKey,
} from '@/lib/paper-minis/geometry';
import { generatePDF } from '@/lib/paper-minis/pdf';
import { packEntries, toPackingEntry, type PackResult } from '@/lib/paper-minis/packing';
import {
  DEFAULT_CUSTOM_HEIGHT_MM,
  DEFAULT_CUSTOM_WIDTH_MM,
  DEFAULT_HEIGHT_SLOT,
  resolveFigureHeightMm,
} from '@/lib/paper-minis/sizes';
import type {
  Entry,
  HeightCalibration,
  HeightSlot,
  MiniSize,
  PreparedArtwork,
} from '@/lib/paper-minis/types';

export type MiniRow = Entry & { id: number };
export type PaperMinisSettings = {
  pageSize: PageSizeKey;
  marginMm: number;
  numberDuplicates: boolean;
  normalization: boolean;
};
export type NumericInput = { text: string; valid: boolean };
export type PaperMinisInputs = {
  margin: NumericInput;
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
  settings: Readonly<PaperMinisSettings>,
) => Promise<Uint8Array>;
export type PaperMinisStoreDependencies = {
  renderer?: PaperMinisRenderer;
  artwork?: PaperMinisArtwork;
};
export type { ArtworkPreparation, PaperMinisArtwork };
type Preview = { bytes: Uint8Array; revision: number };
export type CalibrationSession = {
  rowId: number;
  rowLabel: string;
  artwork: PreparedArtwork;
  backArtwork?: PreparedArtwork | null;
  lines: HeightCalibration;
  artworkHeight: number;
  ranges: Record<CalibrationLine, CalibrationRange>;
  slotHeightMm: number;
  printedHeightMm: number;
  warning?: string;
};
const storageKey = 'pmg-settings';
const successMessage = 'PDF готов.';
const failureMessage = 'Не удалось создать PDF. Попробуйте ещё раз или уменьшите изображения.';

function parseNumericInput(text: string, accepts: (value: number) => boolean) {
  if (text.trim() === '') return { input: { text, valid: false } };
  const value = Number(text);
  return Number.isFinite(value) && accepts(value)
    ? { input: { text, valid: true }, value }
    : { input: { text, valid: false } };
}

export function createPaperMinisStore({
  renderer = generatePDF,
  artwork = createCanvasArtwork(),
}: PaperMinisStoreDependencies = {}) {
  const $rows = atom<MiniRow[]>([]);
  const $settings = atom<PaperMinisSettings>({
    pageSize: 'a4',
    marginMm: DEFAULT_FIGURE_MARGIN_MM,
    numberDuplicates: false,
    normalization: true,
  });
  const $inputs = atom<PaperMinisInputs>({
    margin: { text: String(DEFAULT_FIGURE_MARGIN_MM), valid: true },
    rows: {},
  });
  const $inputsValid = computed([$inputs, $rows], (inputs, rows) => {
    if (!inputs.margin.valid) return false;
    return rows.every((row) => {
      const rowInputs = inputs.rows[row.id];
      return (
        rowInputs?.count.valid === true &&
        (row.heightSlot !== 'custom' ||
          (rowInputs.customWidthMm.valid && rowInputs.customHeightMm.valid))
      );
    });
  });
  const $message = atom('');
  const $revision = atom(0);
  const $busy = atom(false);
  const $preparing = atom(false);
  const $preview = atom<Preview | undefined>(undefined);
  const $calibration = atom<CalibrationSession | undefined>(undefined);
  const $acceptsFiles = computed(
    [$busy, $calibration],
    (busy, calibration) => !busy && calibration === undefined,
  );
  const $previewStale = computed(
    [$preview, $revision],
    (preview, revision) => preview !== undefined && preview.revision !== revision,
  );
  let nextId = 0;
  const loads = new Map<string, object>();
  let packedRows: MiniRow[] | undefined;
  let packedSettings: PaperMinisSettings | undefined;
  let packed: PackResult | undefined;
  let initialCalibration: HeightCalibration | undefined;

  function calibrationSession(row: MiniRow, lines: HeightCalibration): CalibrationSession {
    const calibration = calibrationChanged(lines, initialCalibration) ? lines : initialCalibration;
    const packingEntry = { ...toPackingEntry(row), calibration };
    const fits = fitMiniFaces(
      {
        ...packingEntry,
        naturalWidth: row.artwork!.width,
        naturalHeight: row.artwork!.height,
      },
      $settings.get(),
    );
    return {
      rowId: row.id,
      rowLabel: row.name || 'Миниатюра',
      artwork: row.artwork!,
      backArtwork: row.backArtwork,
      lines,
      artworkHeight: Math.max(row.artwork!.height, row.backArtwork?.height ?? 0),
      ranges: {
        head: calibrationRange(lines, 'head'),
        feet: calibrationRange(lines, 'feet'),
      },
      slotHeightMm: resolveFigureHeightMm(row),
      printedHeightMm: fits.front.imageHeightMm,
      warning: fitLimitWarning([...new Set([...fits.front.limits, ...(fits.back?.limits ?? [])])]),
    };
  }

  function cancelCalibration() {
    initialCalibration = undefined;
    $calibration.set(undefined);
  }

  function openCalibration(id: number) {
    if ($busy.get()) return false;
    const row = $rows.get().find((candidate) => candidate.id === id);
    if (!row?.artwork) return false;
    initialCalibration = calibrationGap(row.calibration) === undefined ? undefined : row.calibration;
    const lines = { ...(initialCalibration ?? DEFAULT_CALIBRATION) };
    $calibration.set(calibrationSession(row, lines));
    return true;
  }

  function updateCalibration(line: CalibrationLine, fraction: number) {
    const session = $calibration.get();
    if (!session) return;
    const row = $rows.get().find((candidate) => candidate.id === session.rowId);
    if (!row?.artwork) {
      cancelCalibration();
      return;
    }
    const lines = setLine(session.lines, line, fraction);
    if (lines !== session.lines) $calibration.set(calibrationSession(row, lines));
  }

  function applyCalibration() {
    const session = $calibration.get();
    if (!session || calibrationGap(session.lines) === undefined) return false;
    const changedByValue = calibrationChanged(session.lines, initialCalibration);
    if (changedByValue) updateRow(session.rowId, { calibration: session.lines });
    cancelCalibration();
    return true;
  }

  function resetCalibration(id: number) {
    const row = $rows.get().find((candidate) => candidate.id === id);
    if (!row?.calibration) return;
    updateRow(id, { calibration: undefined });
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
  function addBlank({ name, heightSlot }: { name?: string; heightSlot?: HeightSlot } = {}) {
    if ($busy.get()) return;
    const row: MiniRow = {
      id: nextId++,
      ...(name === undefined ? {} : { name }),
      image: null,
      artwork: null,
      heightSlot: heightSlot ?? DEFAULT_HEIGHT_SLOT,
      count: 1,
    };
    $rows.set([...$rows.get(), row]);
    $inputs.set({
      ...$inputs.get(),
      rows: {
        ...$inputs.get().rows,
        [row.id]: {
          count: { text: '1', valid: true },
          customWidthMm: { text: '', valid: false },
          customHeightMm: { text: '', valid: false },
        },
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
    $rows.set(
      $rows
        .get()
        .map((candidate) =>
          candidate.id === id ? Object.assign({}, candidate, fields) : candidate,
        ),
    );
    if (size === 'custom') {
      const inputs = $inputs.get();
      $inputs.set({
        ...inputs,
        rows: {
          ...inputs.rows,
          [id]: {
            ...inputs.rows[id],
            customWidthMm: { text: String(customWidthMm), valid: true },
            customHeightMm: { text: String(customHeightMm), valid: true },
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
        nextInputs[row.id] = {
          ...nextInputs[row.id],
          customWidthMm: { text: String(customWidthMm), valid: true },
          customHeightMm: { text: String(customHeightMm), valid: true },
        };
        return Object.assign({}, row, { heightSlot: size, customWidthMm, customHeightMm });
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
    const replacing = back ? selectedRow?.backArtwork != null : selectedRow?.artwork != null;
    updateRow(
      id,
      back
        ? {
            backImage: file,
            backArtwork: null,
            ...(replacing && { calibration: undefined }),
            backWarning: undefined,
          }
        : {
            image: file,
            artwork: null,
            ...(replacing && { calibration: undefined }),
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
  function ingest(files: File[]) {
    if (!$acceptsFiles.get()) return;
    const valid = files.filter(isSupportedArtwork);
    $message.set(
      valid.length < files.length
        ? 'Некоторые файлы пропущены: поддерживаются PNG, JPG и WebP.'
        : '',
    );
    for (const planned of planBatch(valid)) {
      const id = addBlank({ name: planned.name, heightSlot: planned.heightSlot });
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
    if (typeof fields.numberDuplicates === 'boolean')
      next.numberDuplicates = fields.numberDuplicates;
    if (typeof fields.normalization === 'boolean') next.normalization = fields.normalization;
    return next;
  }
  function settings(fields: Partial<PaperMinisSettings>) {
    if ($busy.get()) return;
    const previous = $settings.get();
    const next = validatedSettings(fields, previous);
    $settings.set(next);
    if (next.marginMm !== previous.marginMm)
      $inputs.set({
        ...$inputs.get(),
        margin: { text: String(next.marginMm), valid: true },
      });
    changed();
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* Storage is optional. */
    }
    if (previous.normalization !== next.normalization) {
      cancelCalibration();
      $rows.set($rows.get().map((row) => Object.assign({}, row, { calibration: undefined })));
      for (const row of $rows.get()) {
        if (row.image) void setImage(row.id, row.image);
        if (row.backImage) void setImage(row.id, row.backImage, true);
      }
    }
  }
  function setMargin(text: string) {
    if ($busy.get()) return;
    const { input, value } = parseNumericInput(text, (candidate) => candidate >= 0);
    $inputs.set({ ...$inputs.get(), margin: input });
    if (value === undefined || value === $settings.get().marginMm) return;
    settings({ marginMm: value });
    $inputs.set({ ...$inputs.get(), margin: input });
  }
  function loadSettings() {
    if ($busy.get()) return;
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      const next = validatedSettings(value, $settings.get());
      $settings.set(next);
      $inputs.set({
        ...$inputs.get(),
        margin: { text: String(next.marginMm), valid: true },
      });
    } catch {
      /* Use defaults when storage is unavailable. */
    }
  }
  function pack() {
    const rows = $rows.get();
    const currentSettings = $settings.get();
    if (rows !== packedRows || currentSettings !== packedSettings || !packed) {
      packedRows = rows;
      packedSettings = currentSettings;
      packed = packEntries(rows, currentSettings);
    }
    return packed;
  }
  async function render() {
    if ($busy.get() || $preparing.get()) return;
    const layout = pack();
    if (!layout.miniCount) return;
    $busy.set(true);
    $message.set('');
    const rows = $rows.get().map((row) => Object.assign({}, row));
    const snapshotSettings = { ...$settings.get() };
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
  return {
    $rows,
    $settings,
    $inputs,
    $inputsValid,
    $message,
    $revision,
    $busy,
    $preparing,
    $preview,
    $previewStale,
    $calibration,
    $acceptsFiles,
    addBlank,
    setSize,
    setAllSizes,
    setCount,
    setCustomDimensions,
    setImage,
    ingest,
    settings,
    setMargin,
    loadSettings,
    openCalibration,
    setCalibrationLine: updateCalibration,
    moveCalibrationLine(line: CalibrationLine, pixels: number) {
      const session = $calibration.get();
      if (!session || session.artworkHeight <= 0) return;
      updateCalibration(line, session.lines[line] + pixels / session.artworkHeight);
    },
    applyCalibration,
    cancelCalibration,
    resetCalibration,
    pack,
    async download() {
      return (await render())?.bytes;
    },
    async refreshPreview() {
      const preview = await render();
      if (preview) $preview.set(preview);
    },
    clearBack(id: number) {
      if ($busy.get()) return;
      loads.delete(`${id}:true`);
      updateRow(id, {
        backImage: null,
        backArtwork: null,
        ...(!$rows.get().find((row) => row.id === id)?.image && { calibration: undefined }),
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
          [copy.id]: {
            count: { text: String(copy.count), valid: true },
            customWidthMm: {
              text: copy.customWidthMm === undefined ? '' : String(copy.customWidthMm),
              valid: copy.customWidthMm !== undefined,
            },
            customHeightMm: {
              text: copy.customHeightMm === undefined ? '' : String(copy.customHeightMm),
              valid: copy.customHeightMm !== undefined,
            },
          },
        },
      });
      changed();
      if (copy.image && !copy.artwork) void setImage(copy.id, copy.image);
      if (copy.backImage && !copy.backArtwork) void setImage(copy.id, copy.backImage, true);
    },
  };
}
