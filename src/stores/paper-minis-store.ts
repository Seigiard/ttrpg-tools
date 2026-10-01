import { atom } from 'nanostores';
import { prepareArtwork, isSupportedArtwork } from '@/lib/paper-minis/artwork';
import { normalizeArtwork } from '@/lib/paper-minis/normalization';
import { DEFAULT_FIGURE_MARGIN_MM, packEntries, type PageSizeKey } from '@/lib/paper-minis/packing';
import { DEFAULT_HEIGHT_SLOT } from '@/lib/paper-minis/sizes';
import type { Entry } from '@/lib/paper-minis/types';

export type MiniRow = Entry & { id: number; frontError?: string };
type Settings = {
  pageSize: PageSizeKey;
  marginMm: number;
  numberDuplicates: boolean;
  normalization: boolean;
};
const storageKey = 'pmg-settings';

export function createPaperMinisStore() {
  const $rows = atom<MiniRow[]>([]);
  const $settings = atom<Settings>({
    pageSize: 'a4',
    marginMm: DEFAULT_FIGURE_MARGIN_MM,
    numberDuplicates: false,
    normalization: true,
  });
  const $message = atom('');
  const $revision = atom(0);
  const $busy = atom(false);
  const $preparing = atom(false);
  let nextId = 0;
  const loads = new Map<string, object>();

  function changed() {
    $revision.set($revision.get() + 1);
  }
  function patch(id: number, fields: Partial<Entry> & { frontError?: string }) {
    if ($busy.get()) return;
    $rows.set($rows.get().map((row) => (row.id === id ? { ...row, ...fields } : row)));
    changed();
  }
  function addBlank() {
    if ($busy.get()) return;
    const row: MiniRow = {
      id: nextId++,
      image: null,
      artwork: null,
      heightSlot: DEFAULT_HEIGHT_SLOT,
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
        ? { backImage: file, backArtwork: null, backWarning: undefined }
        : { image: file, artwork: null, normalizationWarning: undefined, frontError: undefined },
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
    for (const file of valid) {
      const id = addBlank();
      if (id !== undefined) void setImage(id, file);
    }
  }
  function settings(fields: Partial<Settings>) {
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
  return {
    $rows,
    $settings,
    $message,
    $revision,
    $busy,
    $preparing,
    beginGeneration() {
      if ($busy.get() || $preparing.get()) return false;
      $busy.set(true);
      return true;
    },
    endGeneration() {
      $busy.set(false);
    },
    patch,
    addBlank,
    setImage,
    ingest,
    settings,
    loadSettings,
    pack: () => packEntries($rows.get(), $settings.get()),
    clearBack(id: number) {
      if ($busy.get()) return;
      loads.delete(`${id}:true`);
      patch(id, { backImage: null, backArtwork: null, backWarning: undefined });
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
