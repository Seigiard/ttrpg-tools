import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import { useStore } from '@nanostores/react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { createPaperMinisStore } from '@/stores/paper-minis-store';
import { isSupportedArtwork } from '@/lib/paper-minis/artwork';
import { generatePDF, buildFilename } from '@/lib/paper-minis/pdf';
import { fitMiniFaces } from '@/lib/paper-minis/packing';
import {
  DEFAULT_CUSTOM_HEIGHT_MM,
  DEFAULT_CUSTOM_WIDTH_MM,
  HEIGHT_SLOT_ORDER,
  MIN_CALIBRATION_GAP,
  type FigureFitLimit,
  resolveFigureHeightMm,
  slotLabel,
  slotGeometryLabel,
  slotName,
} from '@/lib/paper-minis/sizes';
import type { Entry, HeightCalibration, MiniSize, PreparedArtwork } from '@/lib/paper-minis/types';

type CalibrationDraft = Pick<Entry, 'frontCalibration' | 'backCalibration'>;

const field =
  'min-h-11 w-full rounded-lg border border-border bg-surface-elevated px-3 text-text focus-visible:outline-2 focus-visible:outline-primary';

function useArtworkUrl(artwork?: PreparedArtwork | null) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!artwork) {
      setUrl(undefined);
      return;
    }
    const next = URL.createObjectURL(
      new Blob([artwork.bytes as BlobPart], {
        type: artwork.format === 'jpg' ? 'image/jpeg' : 'image/png',
      }),
    );
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [artwork]);
  return url;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(Math.max(v, lo), hi);
}

function lineStyle(value: number) {
  return { top: `${value * 100}%` };
}

// The overlay and image share an exact aspect-ratio box inside the available
// space. Container units keep it fitted on both axes, including row thumbnails.
function ArtworkFrame({
  artwork,
  url,
  label,
  imageRef,
  children,
}: {
  artwork: PreparedArtwork;
  url: string;
  label: string;
  imageRef?: Ref<HTMLImageElement>;
  children?: ReactNode;
}) {
  return (
    <span className="relative block h-full w-full [container-type:size]">
      <span
        className="absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2"
        style={{
          width: `min(100cqw, ${(100 * artwork.width) / artwork.height}cqh)`,
          aspectRatio: `${artwork.width} / ${artwork.height}`,
        }}
      >
        <img ref={imageRef} src={url} alt={label} className="block h-full w-full" />
        {children}
      </span>
    </span>
  );
}

const fitLimitLabels: Record<FigureFitLimit, string> = {
  height: 'лимит высоты 2×',
  width: 'лимит ширины',
  page: 'размер листа',
};

function fitLimitWarning(limits: FigureFitLimit[]) {
  if (!limits.length) return undefined;
  return `Миниатюра уменьшена: ${limits.map((limit) => fitLimitLabels[limit]).join(', ')}.`;
}

function SizeOptions({ custom = false }: { custom?: boolean }) {
  return (
    <>
      {HEIGHT_SLOT_ORDER.map((slot) => (
        <option key={slot} value={slot} title={slotGeometryLabel(slot)}>
          {slotLabel(slot)}
        </option>
      ))}
      {custom && <option value="custom">{slotLabel('custom')}</option>}
    </>
  );
}

function NamingHint() {
  return (
    <div data-testid="naming-hint" className="text-sm leading-relaxed text-text-muted">
      <p>
        В конце имени файла: <code className="font-mono text-text">имя-back</code> — оборот,{' '}
        <code className="font-mono text-text">имя-large</code> — размер.
      </p>
      <details className="mt-1">
        <summary className="cursor-pointer rounded-sm hover:text-text focus-visible:outline-2 focus-visible:outline-primary">
          Размеры в имени файла
        </summary>
        <ul className="mt-2 space-y-1">
          {HEIGHT_SLOT_ORDER.map((slot) => (
            <li key={slot}>
              <code className="font-mono text-text">{slot}</code> — {slotName(slot)}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function ArtworkSlot({
  artwork,
  calibration,
  label,
  displayLabel,
  hint,
  loading,
  onFile,
}: {
  artwork?: PreparedArtwork | null;
  calibration?: HeightCalibration;
  label: string;
  displayLabel?: string;
  hint: string;
  loading: boolean;
  onFile: (file: File) => void;
}) {
  const url = useArtworkUrl(artwork);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface-elevated">
      <div className="border-b border-border px-3 py-2">
        <p className="truncate text-sm font-medium text-text">{displayLabel ?? label}</p>
      </div>
      <Button
        variant="ghost"
        className="h-40 w-full rounded-none whitespace-normal p-3 focus-visible:ring-inset"
        aria-label={label}
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const dropped = Array.from(event.dataTransfer.files);
          const file = dropped.find(isSupportedArtwork) ?? dropped[0];
          if (file) onFile(file);
        }}
      >
        {url && artwork ? (
          <ArtworkFrame artwork={artwork} url={url} label={label}>
            {calibration && (
              <span className="pointer-events-none absolute inset-0">
                {(['head', 'feet'] as const).map((key) => (
                  <span
                    key={key}
                    data-testid={`calibration-${key}`}
                    className="absolute left-0 right-0 border-t-2 border-primary bg-surface/70 text-[10px] font-bold text-primary shadow-sm"
                    style={{ top: `${calibration[key] * 100}%` }}
                  />
                ))}
              </span>
            )}
          </ArtworkFrame>
        ) : (
          <span className="max-w-44 text-sm font-normal leading-relaxed text-text-muted">
            {loading ? 'Загрузка…' : hint}
          </span>
        )}
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        aria-label={label}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = '';
        }}
      />
    </div>
  );
}

function CalibrationSides({
  hasBack,
  side,
  onSideChange,
  children,
}: {
  hasBack: boolean;
  side: 'front' | 'back';
  onSideChange: (side: 'front' | 'back') => void;
  children: ReactNode;
}) {
  if (!hasBack) return children;
  return (
    <Tabs value={side} onValueChange={(value) => onSideChange(value as 'front' | 'back')}>
      <TabsList aria-label="Сторона" className="mt-4 min-h-11">
        {(['front', 'back'] as const).map((key) => (
          <TabsTrigger key={key} value={key} className="min-h-11">
            {key === 'front' ? 'Перед' : 'Зад'}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value={side}>{children}</TabsContent>
    </Tabs>
  );
}

function HeightCalibrationDialog({
  artwork,
  backArtwork,
  rowLabel,
  slotHeightMm,
  initial,
  previewFit,
  initialBack,
  onApply,
  onCancel,
  returnFocus,
}: {
  artwork: PreparedArtwork;
  backArtwork?: PreparedArtwork | null;
  rowLabel: string;
  slotHeightMm: number;
  initial?: HeightCalibration;
  previewFit: (draft: CalibrationDraft) => ReturnType<typeof fitMiniFaces>;
  initialBack?: HeightCalibration;
  onApply: (changes: CalibrationDraft) => void;
  onCancel: () => void;
  returnFocus: React.RefObject<HTMLButtonElement | null>;
}) {
  const [side, setSide] = useState<'front' | 'back'>('front');
  const currentArtwork = side === 'front' ? artwork : (backArtwork ?? artwork);
  const url = useArtworkUrl(currentArtwork);
  const artworkRef = useRef<HTMLImageElement>(null);
  const dragging = useRef<'head' | 'feet' | null>(null);
  const [frontLines, setFrontLines] = useState(initial);
  const [backLines, setBackLines] = useState(initialBack);
  const lines = (side === 'front' ? frontLines : backLines) ?? { head: 0, feet: 1 };
  const setLines = side === 'front' ? setFrontLines : setBackLines;
  const fits = previewFit({ frontCalibration: frontLines, backCalibration: backLines });
  const fit = side === 'back' ? (fits.back ?? fits.front) : fits.front;
  const printedHeightMm = fit.imageHeightMm;
  const warning = fitLimitWarning([
    ...new Set([...fits.front.limits, ...(fits.back?.limits ?? [])]),
  ]);
  const hasBack = !!backArtwork;

  function setLineFromClientY(which: 'head' | 'feet', clientY: number) {
    const box = artworkRef.current?.getBoundingClientRect();
    if (!box || box.height <= 0) return;
    const fraction = clamp((clientY - box.top) / box.height, 0, 1);
    setLine(which, () => fraction);
  }

  function setLine(which: 'head' | 'feet', position: (current: number) => number) {
    setLines((previous) => {
      const current = previous ?? { head: 0, feet: 1 };
      const fraction = position(current[which]);
      const next =
        which === 'head'
          ? clamp(fraction, 0, current.feet - MIN_CALIBRATION_GAP)
          : clamp(fraction, current.head + MIN_CALIBRATION_GAP, 1);
      return next === current[which] ? previous : { ...current, [which]: next };
    });
  }

  return (
    <Dialog
      defaultOpen
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent finalFocus={returnFocus}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <DialogTitle className="text-2xl text-text">
              Задать рост
              <span className="sr-only">{side === 'front' ? ' лицевой стороны' : ' оборота'}</span>
            </DialogTitle>
            <p className="text-sm text-text-muted">
              {rowLabel}: перетащите линии головы и стоп или используйте ↑/↓ — 1 пиксель, с Shift —
              10.
            </p>
          </div>
          <p className="text-sm font-medium text-text" aria-live="polite">
            Рост {Math.round(slotHeightMm)} мм · напечатается {Math.round(printedHeightMm)} мм
          </p>
        </div>
        {warning && (
          <p role="status" className="mt-3 border-l-2 border-warning pl-3 text-sm text-warning">
            {warning}
          </p>
        )}
        <CalibrationSides hasBack={hasBack} side={side} onSideChange={setSide}>
          <div
            data-testid="height-calibration-artwork"
            className="relative mt-4 h-[min(65vh,640px)] touch-none rounded-lg border border-border bg-surface-elevated p-6"
            onPointerMove={(event) => {
              if (dragging.current) setLineFromClientY(dragging.current, event.clientY);
            }}
            onPointerUp={(event) => {
              dragging.current = null;
              event.currentTarget.releasePointerCapture?.(event.pointerId);
            }}
            onPointerCancel={() => {
              dragging.current = null;
            }}
            onLostPointerCapture={() => {
              dragging.current = null;
            }}
          >
            {url && (
              <ArtworkFrame
                artwork={currentArtwork}
                url={url}
                label={side === 'front' ? 'Лицевая сторона' : 'Оборот'}
                imageRef={artworkRef}
              >
                {(['head', 'feet'] as const).map((key) => (
                  <Fragment key={key}>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 border-t-2 border-primary"
                      style={lineStyle(lines[key])}
                    />
                    <button
                      type="button"
                      role="slider"
                      aria-label={key === 'head' ? 'Голова' : 'Ступни'}
                      aria-orientation="vertical"
                      aria-valuemin={key === 'feet' ? (lines.head + MIN_CALIBRATION_GAP) * 100 : 0}
                      aria-valuemax={
                        key === 'head' ? (lines.feet - MIN_CALIBRATION_GAP) * 100 : 100
                      }
                      aria-valuenow={lines[key] * 100}
                      aria-valuetext={`${Number((lines[key] * currentArtwork.height).toFixed(2))} пикселей от верха`}
                      className={`absolute left-1/2 h-11 w-1/2 min-w-11 -translate-y-1/2 cursor-row-resize text-left text-xs font-bold text-primary focus-visible:outline-2 focus-visible:outline-primary ${key === 'head' ? '-translate-x-full' : ''}`}
                      style={lineStyle(lines[key])}
                      onKeyDown={(event) => {
                        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                        event.preventDefault();
                        const step = (event.shiftKey ? 10 : 1) / currentArtwork.height;
                        setLine(
                          key,
                          (current) => current + (event.key === 'ArrowUp' ? -step : step),
                        );
                      }}
                      onPointerDown={(event) => {
                        if (event.button !== 0 || event.ctrlKey) return;
                        dragging.current = key;
                        event.currentTarget.setPointerCapture?.(event.pointerId);
                        setLineFromClientY(key, event.clientY);
                      }}
                    >
                      <span className="relative ml-2 rounded bg-surface/90 px-1">
                        {key === 'head' ? 'Голова' : 'Ступни'}
                      </span>
                    </button>
                  </Fragment>
                ))}
              </ArtworkFrame>
            )}
          </div>
        </CalibrationSides>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" className="min-h-11" onClick={onCancel}>
            Отмена
          </Button>
          <Button
            className="min-h-11"
            onClick={() =>
              onApply({
                ...(frontLines !== initial && { frontCalibration: frontLines }),
                ...(backLines !== initialBack && { backCalibration: backLines }),
              })
            }
          >
            Применить
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PaperMinisGenerator() {
  const store = useMemo(() => createPaperMinisStore(), []);
  const rows = useStore(store.$rows);
  const settings = useStore(store.$settings);
  const message = useStore(store.$message);
  const revision = useStore(store.$revision);
  const [margin, setMargin] = useState(String(settings.marginMm));
  const busy = useStore(store.$busy);
  const preparing = useStore(store.$preparing);
  const [preview, setPreview] = useState<{ url: string; revision: number }>();
  const [calibratingId, setCalibratingId] = useState<number>();
  const calibrationOpener = useRef<HTMLButtonElement>(null);
  const previewUrl = useRef<string | undefined>(undefined);
  const [dragging, setDragging] = useState(false);
  const files = useRef<HTMLInputElement>(null);
  const packed = useMemo(() => store.pack(), [store, rows, settings]);
  const marginValid =
    margin.trim() !== '' && Number.isFinite(Number(margin)) && Number(margin) >= 0;
  const calibratingRow = rows.find((row) => row.id === calibratingId && row.artwork);

  useEffect(() => {
    store.loadSettings();
    setMargin(String(store.$settings.get().marginMm));
  }, [store]);
  useEffect(
    () => () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );
  useEffect(() => {
    let depth = 0;
    const hasFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes('Files');
    const enter = (event: DragEvent) => {
      if (hasFiles(event) && calibratingId === undefined) {
        event.preventDefault();
        depth++;
        if (!store.$busy.get()) setDragging(true);
      }
    };
    const over = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    // Capture clears the overlay even when a thumbnail consumes the drop.
    const clear = () => {
      depth = 0;
      setDragging(false);
    };
    const drop = (event: DragEvent) => {
      if (hasFiles(event)) {
        event.preventDefault();
        if (calibratingId === undefined) store.ingest(Array.from(event.dataTransfer?.files ?? []));
      }
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', clear, true);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', clear, true);
      window.removeEventListener('drop', drop);
    };
  }, [store, calibratingId]);

  async function generate(showPreview: boolean) {
    if (!marginValid || !packed.miniCount || !store.beginGeneration()) return;
    try {
      setDragging(false);
      store.$message.set('');
      const snapshot = store.$rows.get().map((row) => ({ ...row }));
      const options = { ...store.$settings.get() };
      const seq = store.$revision.get();
      const bytes = await generatePDF(snapshot, options);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      if (showPreview) {
        if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
        previewUrl.current = url;
        setPreview({ url, revision: seq });
      } else {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = buildFilename();
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        store.$message.set('PDF готов.');
      }
    } catch {
      store.$message.set('Не удалось создать PDF. Попробуйте ещё раз или уменьшите изображения.');
    } finally {
      store.endGeneration();
    }
  }

  return (
    <div className="space-y-8">
      <fieldset
        aria-label="Редактор миниатюр"
        aria-busy={busy}
        disabled={busy}
        className="min-w-0 disabled:opacity-60"
      >
        <div className="grid gap-6 xl:block">
          <div className="xl:absolute xl:right-full xl:h-full xl:w-60">
            <aside className="space-y-6 rounded-lg border border-border bg-surface-elevated p-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
              <div>
                <h2 className="text-2xl text-text">Настройки</h2>
                <p className="mt-1 text-sm leading-relaxed text-text-muted">
                  Общие параметры печати.
                </p>
              </div>
              <label className="block text-sm">
                Размер бумаги
                <select
                  className={field}
                  value={settings.pageSize}
                  onChange={(event) =>
                    store.settings({ pageSize: event.target.value as 'a4' | 'letter' })
                  }
                >
                  <option value="a4">A4 (210 × 297 мм)</option>
                  <option value="letter">Letter (216 × 279 мм)</option>
                </select>
              </label>
              <label className="block text-sm">
                Поля, мм
                <input
                  className={field}
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={margin}
                  aria-invalid={!marginValid}
                  onChange={(event) => {
                    if (store.$busy.get()) return;
                    setMargin(event.target.value);
                    const n = event.target.valueAsNumber;
                    if (Number.isFinite(n) && n >= 0) store.settings({ marginMm: n });
                  }}
                />
              </label>
              {rows.length > 0 && (
                <label className="block text-sm">
                  Высота всех фигурок
                  <select
                    className={field}
                    value=""
                    onChange={(event) => {
                      for (const row of rows)
                        store.patch(row.id, { heightSlot: event.target.value as MiniSize });
                    }}
                  >
                    <option value="" disabled>
                      Выберите…
                    </option>
                    <SizeOptions />
                  </select>
                </label>
              )}
              <div className="space-y-2 border-y border-border py-3">
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={settings.numberDuplicates}
                    onChange={(event) => store.settings({ numberDuplicates: event.target.checked })}
                  />
                  Нумеровать копии
                </label>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={settings.normalization}
                    onChange={(event) => store.settings({ normalization: event.target.checked })}
                  />
                  Обрезать пустые поля
                </label>
              </div>
              <div className="space-y-3">
                <h3 className="text-xl text-text">PDF</h3>
                <p aria-live="polite" className="text-sm">
                  {rows.length
                    ? `Миниатюр: ${packed.miniCount} → листов: ${packed.pageCount} (${settings.pageSize === 'a4' ? 'A4' : 'Letter'})`
                    : 'Добавьте изображения для печати миниатюр.'}
                </p>
                {message && (
                  <p role="status" className="text-sm">
                    {message}
                  </p>
                )}
                <p role="status" className="text-sm">
                  {busy
                    ? 'Создаём PDF. Редактирование временно недоступно.'
                    : preparing
                      ? 'Обрабатываем изображения. PDF будет доступен после завершения.'
                      : ''}
                </p>
                {!marginValid && (
                  <p role="status" className="text-sm text-danger">
                    Поля должны быть числом от 0 мм.
                  </p>
                )}
                <div className="space-y-2">
                  <Button
                    className="min-h-11 w-full"
                    disabled={busy || preparing || !packed.miniCount || !marginValid}
                    onClick={() => void generate(false)}
                  >
                    {busy ? 'Подготовка PDF…' : 'Скачать PDF'}
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-11 w-full"
                    disabled={busy || preparing || !packed.miniCount || !marginValid}
                    onClick={() => void generate(true)}
                  >
                    {preview ? 'Обновить предпросмотр' : 'Предпросмотр PDF'}
                  </Button>
                </div>
              </div>
            </aside>
          </div>

          <div className="min-w-0 space-y-6">
            <div className="space-y-2">
              <Button
                variant="outline"
                className="h-auto min-h-28 w-full flex-col whitespace-normal border-dashed p-6"
                onClick={() => files.current?.click()}
              >
                <span className="text-base">Добавить изображения</span>
                <span className="text-sm font-normal text-text-muted">
                  Перетащите файлы сюда или нажмите для выбора. PNG, JPG, WebP.
                </span>
              </Button>
              {/* Outside the button: a <details> is interactive content, which a button may not contain. */}
              <NamingHint />
            </div>
            <input
              ref={files}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              aria-label="Добавить изображения"
              onChange={(event) => {
                store.ingest(Array.from(event.target.files ?? []));
                event.target.value = '';
              }}
            />

            <section aria-label="Миниатюры" className="space-y-5">
              <h2 className="sr-only">Миниатюры</h2>
              {rows.map((row, index) => (
                <article
                  key={row.id}
                  aria-label={`Миниатюра ${index + 1}`}
                  className="border-y border-border py-5"
                >
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="break-all text-xl text-text">
                      {row.name || `Миниатюра ${index + 1}`}
                    </h3>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        className="min-h-11"
                        onClick={() => store.duplicate(row.id)}
                      >
                        Дублировать
                      </Button>
                      <Button
                        variant="ghost"
                        className="min-h-11"
                        onClick={() => store.remove(row.id)}
                      >
                        Удалить
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <ArtworkSlot
                      artwork={row.artwork}
                      calibration={row.frontCalibration}
                      label="Лицевая сторона"
                      hint="Выбрать лицевую сторону"
                      loading={!!row.image && !row.artwork && !row.frontError}
                      onFile={(file) => void store.setImage(row.id, file)}
                    />
                    <div className="space-y-2">
                      <ArtworkSlot
                        artwork={row.backArtwork}
                        calibration={row.backCalibration}
                        label={
                          row.backImage
                            ? `Оборот: ${row.backImage.name}`
                            : 'Оборот: отражение лицевой стороны'
                        }
                        displayLabel="Оборот"
                        hint="Добавить свой оборот или оставить отражение"
                        loading={!!row.backImage && !row.backArtwork}
                        onFile={(file) => void store.setImage(row.id, file, true)}
                      />
                      {(row.backImage || row.backWarning) && (
                        <Button
                          variant="ghost"
                          className="min-h-11 w-full"
                          onClick={() => store.clearBack(row.id)}
                        >
                          Убрать оборот
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 rounded-lg bg-muted/50 p-3 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          className="min-h-11"
                          disabled={!row.artwork}
                          onClick={(event) => {
                            calibrationOpener.current = event.currentTarget;
                            setCalibratingId(row.id);
                          }}
                        >
                          Задать рост
                        </Button>
                        {(row.frontCalibration || row.backCalibration) && (
                          <Button
                            variant="ghost"
                            className="min-h-11"
                            onClick={() => {
                              store.clearFrontCalibration(row.id);
                              store.clearBackCalibration(row.id);
                            }}
                          >
                            Сбросить рост
                          </Button>
                        )}
                      </div>
                      {(row.frontCalibration || row.backCalibration) && (
                        <p className="text-sm font-medium text-text">Рост задан вручную</p>
                      )}
                    </div>
                    <label className="block text-sm">
                      Высота существа
                      <select
                        className={field}
                        value={row.heightSlot}
                        title={slotGeometryLabel(row.heightSlot)}
                        onChange={(event) =>
                          store.patch(row.id, {
                            heightSlot: event.target.value as MiniSize,
                            customHeightMm: row.customHeightMm ?? DEFAULT_CUSTOM_HEIGHT_MM,
                            customWidthMm: row.customWidthMm ?? DEFAULT_CUSTOM_WIDTH_MM,
                          })
                        }
                      >
                        <SizeOptions custom />
                      </select>
                    </label>
                    <label className="block text-sm">
                      Количество копий
                      <input
                        className={field}
                        type="number"
                        min="1"
                        step="1"
                        defaultValue={row.count}
                        onChange={(event) =>
                          store.patch(row.id, {
                            count: Math.max(1, Math.floor(event.target.valueAsNumber) || 1),
                          })
                        }
                        onBlur={(event) => {
                          event.currentTarget.value = String(row.count);
                        }}
                      />
                    </label>
                    {row.heightSlot === 'custom' && (
                      <div className="grid grid-cols-2 gap-2 sm:col-span-2">
                        {(['customWidthMm', 'customHeightMm'] as const).map((key, i) => (
                          <label key={key} className="text-sm">
                            {i === 0 ? 'Основание, мм' : 'Фигурка, мм'}
                            <input
                              className={field}
                              type="number"
                              min="1"
                              step="0.5"
                              value={row[key] ?? ''}
                              onChange={(event) =>
                                store.patch(row.id, {
                                  [key]:
                                    Number.isFinite(event.target.valueAsNumber) &&
                                    event.target.valueAsNumber > 0
                                      ? event.target.valueAsNumber
                                      : undefined,
                                })
                              }
                            />
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  <p className="mt-3 text-xs leading-relaxed text-text-muted">
                    {row.backImage
                      ? 'В PDF попадёт отдельное изображение оборота.'
                      : 'Без отдельного файла лицевая сторона будет отражена автоматически.'}
                  </p>
                  {packed.oversizedEntryIndices.includes(index) && (
                    <p
                      role="status"
                      className="mt-3 border-l-2 border-danger pl-3 text-sm text-danger"
                    >
                      Не помещается на лист. Уменьшите размер или поля. Эта миниатюра не попадёт в
                      PDF.
                    </p>
                  )}
                  {fitLimitWarning(
                    packed.limitedEntryFitLimits.find((warning) => warning.entryIndex === index)
                      ?.limits ?? [],
                  ) && (
                    <p
                      role="status"
                      className="mt-3 border-l-2 border-warning pl-3 text-sm text-warning"
                    >
                      {fitLimitWarning(
                        packed.limitedEntryFitLimits.find((warning) => warning.entryIndex === index)
                          ?.limits ?? [],
                      )}
                    </p>
                  )}
                  {[row.frontError, row.normalizationWarning, row.backWarning]
                    .filter(Boolean)
                    .map((warning, i) => (
                      <p
                        key={i}
                        role="status"
                        className="mt-3 border-l-2 border-warning pl-3 text-sm text-warning"
                      >
                        {warning}
                      </p>
                    ))}
                </article>
              ))}
            </section>
          </div>
        </div>
      </fieldset>

      <aside className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-6 text-sm text-text-muted">
        <div className="space-y-2">
          <p>
            <b>Изображения обрабатываются в браузере</b> и не отправляются на сервер. Сохраняются
            только настройки печати.
          </p>
          <p>
            <b>Печатайте в масштабе 100%</b>, без подгонки под страницу. Контрольная линейка на
            листе должна быть ровно 100 мм.
          </p>
          <p>
            <b>Вырежьте развёртку</b> по внешним меткам, согните пополам между изображениями,
            отогните оба язычка наружу и приклейте их к полоске основания.
          </p>
        </div>
        <div className="space-y-2">
          <p>
            Высота задаёт размер фигурки на бумаге. Очень широкие изображения уменьшаются целиком.
            Основание зависит от категории размера; у самых крупных фигурок оно более плоское, чтобы
            развёртка помещалась на лист.
          </p>
          <p>
            Обрезка убирает прозрачные или одноцветные поля. Она может затронуть детали, близкие к
            цвету фона: отключите её, чтобы печатать оригинал.
          </p>
          <p>
            Для своего оборота загрузите вид существа сзади. Без отдельного изображения оборот
            отражает лицевую сторону.
          </p>
        </div>
      </aside>
      {preview && (
        <section aria-label="Предпросмотр PDF" className="space-y-2">
          {preview.revision !== revision && (
            <p role="status" className="text-sm text-warning">
              Настройки или изображения изменились. Обновите предпросмотр.
            </p>
          )}
          <iframe
            title="Предпросмотр PDF"
            src={preview.url}
            className="h-[65vh] w-full rounded-lg border border-border"
          />
          <a href={preview.url} target="_blank" rel="noreferrer" className="text-primary underline">
            Открыть PDF в новой вкладке
          </a>
        </section>
      )}
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center border-4 border-primary bg-surface/90 text-2xl text-primary">
          Отпустите файлы, чтобы добавить миниатюры
        </div>
      )}
      {calibratingRow?.artwork && (
        <HeightCalibrationDialog
          returnFocus={calibrationOpener}
          artwork={calibratingRow.artwork}
          backArtwork={calibratingRow.backArtwork}
          rowLabel={calibratingRow.name || 'Миниатюра'}
          slotHeightMm={resolveFigureHeightMm(calibratingRow)}
          initial={calibratingRow.frontCalibration}
          previewFit={(draft) =>
            fitMiniFaces(
              {
                ...calibratingRow,
                ...draft,
                naturalWidth: calibratingRow.artwork!.width,
                naturalHeight: calibratingRow.artwork!.height,
                backNaturalWidth: calibratingRow.backArtwork?.width,
                backNaturalHeight: calibratingRow.backArtwork?.height,
              },
              settings,
            )
          }
          initialBack={calibratingRow.backCalibration}
          onCancel={() => setCalibratingId(undefined)}
          onApply={(changes) => {
            if (Object.keys(changes).length) store.patch(calibratingRow.id, changes);
            setCalibratingId(undefined);
          }}
        />
      )}
    </div>
  );
}
