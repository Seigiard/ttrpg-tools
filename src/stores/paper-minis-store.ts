import { atom, computed } from 'nanostores';
import { prepareArtwork, isSupportedArtwork } from '@/lib/paper-minis/artwork';
import { planBatch } from '@/lib/paper-minis/batch-plan';
import { normalizeArtwork } from '@/lib/paper-minis/normalization';
import { generatePDF } from '@/lib/paper-minis/pdf';
import {
  DEFAULT_FIGURE_MARGIN_MM,
  packEntries,
  type PackResult,
  type PageSizeKey,
} from '@/lib/paper-minis/packing';
import { DEFAULT_HEIGHT_SLOT } from '@/lib/paper-minis/sizes';
import type { Entry, HeightCalibration, HeightSlot } from '@/lib/paper-minis/types';

export type MiniRow = Entry & { id: number; frontError?: string };
export type PaperMinisSettings = {
  pageSize: PageSizeKey;
  marginMm: number;
  numberDuplicates: boolean;
  normalization: boolean;
};
export type PaperMinisRenderer = (
  rows: readonly MiniRow[],
  layout: PackResult,
  settings: Readonly<PaperMinisSettings>,
) => Promise<Uint8Array>;
type Preview = { bytes: Uint8Array; revision: number };
const storageKey = 'pmg-settings';
const successMessage = 'PDF готов.';
const failureMessage = 'Не удалось создать PDF. Попробуйте ещё раз или уменьшите изображения.';

export function createPaperMinisStore(renderer: PaperMinisRenderer = generatePDF) {
  const $rows = atom<MiniRow[]>([]);
  const $settings = atom<PaperMinisSettings>({
    pageSize: 'a4',
    marginMm: DEFAULT_FIGURE_MARGIN_MM,
    numberDuplicates: false,
    normalization: true,
  });
  const $message = atom('');
  const $revision = atom(0);
  const $busy = atom(false);
  const $preparing = atom(false);
  const $preview = atom<Preview | undefined>(undefined);
  const $previewStale = computed(
    [$preview, $revision],
    (preview, revision) => preview !== undefined && preview.revision !== revision,
  );
  let nextId = 0;
  const loads = new Map<string, object>();
  let packedRows: MiniRow[] | undefined;
  let packedSettings: PaperMinisSettings | undefined;
  let packed: PackResult | undefined;

  function changed() {
    $revision.set($revision.get() + 1);
  }
  function patch(id: number, fields: Partial<Entry> & { frontError?: string }) {
    if ($busy.get()) return;
    $rows.set($rows.get().map((row) => (row.id === id ? { ...row, ...fields } : row)));
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
    changed();
    return row.id;
  }
  async function setImage(id: number, file: File, back = false) {
    if ($busy.get()) return;
    if (!isSupportedArtwork(file)) {
      $message.set('Выберите PNG, JPG или WebP.');
      return;
    }
    const key = `${id}:${back}`;
    const token = {};
    loads.set(key, token);
    $preparing.set(true);
    const normalization = $settings.get().normalization;
    patch(
      id,
      back
        ? { backImage: file, backArtwork: null, backCalibration: undefined, backWarning: undefined }
        : {
            image: file,
            artwork: null,
            frontCalibration: undefined,
            normalizationWarning: undefined,
            frontError: undefined,
          },
    );
    const current = () => loads.get(key) === token && $rows.get().some((row) => row.id === id);
    try {
      const original = await prepareArtwork(file);
      if (!current()) return;
      const result = normalization
        ? await normalizeArtwork(original)
        : { artwork: original, warning: undefined };
      if (!current()) return;
      patch(
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
      patch(
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
    if ($busy.get()) return;
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
  function settings(fields: Partial<PaperMinisSettings>) {
    if ($busy.get()) return;
    const previous = $settings.get();
    const next = { ...previous, ...fields };
    $settings.set(next);
    changed();
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* Storage is optional. */
    }
    if (previous.normalization !== next.normalization) {
      $rows.set(
        $rows
          .get()
          .map((row) =>
            Object.assign({}, row, { frontCalibration: undefined, backCalibration: undefined }),
          ),
      );
      for (const row of $rows.get()) {
        if (row.image) void setImage(row.id, row.image);
        if (row.backImage) void setImage(row.id, row.backImage, true);
      }
    }
  }
  function loadSettings() {
    if ($busy.get()) return;
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      if (!value || typeof value !== 'object') return;
      const next = { ...$settings.get() };
      if (value.pageSize === 'a4' || value.pageSize === 'letter') next.pageSize = value.pageSize;
      if (
        typeof value.marginMm === 'number' &&
        Number.isFinite(value.marginMm) &&
        value.marginMm >= 0
      )
        next.marginMm = value.marginMm;
      if (typeof value.numberDuplicates === 'boolean')
        next.numberDuplicates = value.numberDuplicates;
      if (typeof value.normalization === 'boolean') next.normalization = value.normalization;
      $settings.set(next);
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
    $message,
    $revision,
    $busy,
    $preparing,
    $preview,
    $previewStale,
    patch,
    addBlank,
    setImage,
    ingest,
    settings,
    loadSettings,
    setFrontCalibration(id: number, calibration: HeightCalibration) {
      patch(id, { frontCalibration: calibration });
    },
    clearFrontCalibration(id: number) {
      patch(id, { frontCalibration: undefined });
    },
    setBackCalibration(id: number, calibration: HeightCalibration) {
      patch(id, { backCalibration: calibration });
    },
    clearBackCalibration(id: number) {
      patch(id, { backCalibration: undefined });
    },
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
      patch(id, {
        backImage: null,
        backArtwork: null,
        backCalibration: undefined,
        backWarning: undefined,
      });
      $preparing.set(loads.size > 0);
    },
    remove(id: number) {
      if ($busy.get()) return;
      loads.delete(`${id}:true`);
      loads.delete(`${id}:false`);
      $rows.set($rows.get().filter((row) => row.id !== id));
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
      changed();
      if (copy.image && !copy.artwork) void setImage(copy.id, copy.image);
      if (copy.backImage && !copy.backArtwork) void setImage(copy.id, copy.backImage, true);
    },
  };
}
