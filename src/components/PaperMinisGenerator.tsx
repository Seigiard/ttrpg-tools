import { Fragment, type ComponentChildren, type JSX, type Ref } from 'preact';
import { useStore } from '@/lib/use-store';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { createPaperMinisStore, type CalibrationSession } from '@/stores/paper-minis-store';
import { ARTWORK_ACCEPT, artworkMimeType } from '@/lib/paper-minis/artwork-formats';
import { isSupportedArtwork } from '@/lib/paper-minis/artwork';
import type { CalibrationLine } from '@/lib/paper-minis/calibration-session';
import { entryStatusWarning } from '@/lib/paper-minis/geometry';
import {
  buildFilename,
  buildPrinterScaleTestSheetFilename,
  generatePrinterScaleTestSheet,
} from '@/lib/paper-minis/pdf';
import { HEIGHT_SLOT_ORDER, slotLabel, slotGeometryLabel, slotName } from '@/lib/paper-minis/sizes';
import type { HeightCalibration, MiniSize, PreparedArtwork } from '@/lib/paper-minis/types';

const field =
  'min-h-11 w-full rounded-lg border border-border bg-surface-elevated px-3 text-text focus-visible:outline-2 focus-visible:outline-primary';

function buildZipFilename(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `paper-minis-${year}-${month}-${day}.zip`;
}

function useArtworkUrl(artwork?: PreparedArtwork | null) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!artwork) {
      setUrl(undefined);
      return;
    }
    let next: string;
    try {
      next = URL.createObjectURL(
        new Blob([artwork.bytes as BlobPart], {
          type: artworkMimeType(artwork.format),
        }),
      );
    } catch {
      setUrl(undefined);
      return;
    }
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [artwork]);
  return url;
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
  children,
}: {
  artwork: PreparedArtwork;
  url: string;
  label: string;
  children?: ComponentChildren;
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
        <img src={url} alt={label} className="block h-full w-full" />
        {children}
      </span>
    </span>
  );
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
  const handleFileInput = (event: JSX.TargetedEvent<HTMLInputElement, Event>) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) onFile(file);
    target.value = '';
  };
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
          const dropped = Array.from(event.dataTransfer?.files ?? []);
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
        accept={ARTWORK_ACCEPT}
        className="hidden"
        aria-label={label}
        onInput={handleFileInput}
        onChange={handleFileInput}
      />
    </div>
  );
}

function CalibrationArtwork({
  artwork,
  backArtwork,
  frontUrl,
  backUrl,
  artworkRef,
  children,
}: {
  artwork: PreparedArtwork;
  backArtwork?: PreparedArtwork | null;
  frontUrl: string;
  backUrl?: string;
  artworkRef: Ref<HTMLSpanElement>;
  children: ComponentChildren;
}) {
  const totalAspect =
    artwork.width / artwork.height +
    (backArtwork && backUrl ? backArtwork.width / backArtwork.height : 0);
  return (
    <span className="relative block h-full w-full [container-type:size]">
      <span
        ref={artworkRef}
        data-testid="calibration-artworks"
        className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2"
        style={{
          width: `min(100cqw, ${totalAspect * 100}cqh)`,
          aspectRatio: `${totalAspect} / 1`,
        }}
      >
        <img src={frontUrl} alt="Лицевая сторона" className="block h-full w-auto" />
        {backArtwork && backUrl && (
          <img src={backUrl} alt="Оборот" className="block h-full w-auto" />
        )}
        {children}
      </span>
    </span>
  );
}

function HeightCalibrationDialog({
  session,
  onSetLine,
  onMoveLine,
  onApply,
  onCancel,
  returnFocus,
}: {
  session: CalibrationSession;
  onSetLine: (line: CalibrationLine, fraction: number) => void;
  onMoveLine: (line: CalibrationLine, pixels: number) => void;
  onApply: () => void;
  onCancel: () => void;
  returnFocus: { current: HTMLButtonElement | null };
}) {
  const { artwork, backArtwork, lines } = session;
  const frontUrl = useArtworkUrl(artwork);
  const backUrl = useArtworkUrl(backArtwork);
  const areaRef = useRef<HTMLDivElement>(null);
  const artworkRef = useRef<HTMLSpanElement>(null);
  const dragging = useRef<'head' | 'feet' | null>(null);

  function setLineFromClientY(which: 'head' | 'feet', clientY: number) {
    const box = artworkRef.current?.getBoundingClientRect();
    if (!box || box.height <= 0) return;
    const fraction = (clientY - box.top) / box.height;
    onSetLine(which, fraction);
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
            <DialogTitle className="text-2xl text-text">Задать рост</DialogTitle>
            <p className="text-sm text-text-muted">
              {session.rowLabel}: перетащите линии головы и стоп или используйте ↑/↓ — 1 пиксель, с
              Shift — 10.
            </p>
          </div>
          <p className="text-sm font-medium text-text" aria-live="polite">
            Рост {Math.round(session.slotHeightMm)} мм · напечатается{' '}
            {Math.round(session.printedHeightMm)} мм
          </p>
        </div>
        {session.warning && (
          <p
            role="status"
            className={`mt-3 border-l-2 pl-3 text-sm ${session.warningTone === 'danger' ? 'border-danger text-danger' : 'border-warning text-warning'}`}
          >
            {session.warning}
          </p>
        )}
        <div
          ref={areaRef}
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
          {frontUrl && (
            <CalibrationArtwork
              artwork={artwork}
              backArtwork={backArtwork}
              frontUrl={frontUrl}
              backUrl={backUrl}
              artworkRef={artworkRef}
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
                    aria-valuemin={session.ranges[key].min * 100}
                    aria-valuemax={session.ranges[key].max * 100}
                    aria-valuenow={lines[key] * 100}
                    aria-valuetext={`${Number((lines[key] * session.artworkHeight).toFixed(2))} пикселей от верха`}
                    className={`absolute left-1/2 h-11 w-1/2 min-w-11 -translate-y-1/2 cursor-row-resize text-left text-xs font-bold text-primary focus-visible:outline-2 focus-visible:outline-primary ${key === 'head' ? '-translate-x-full' : ''}`}
                    style={lineStyle(lines[key])}
                    onKeyDown={(event) => {
                      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                      event.preventDefault();
                      const pixels = (event.shiftKey ? 10 : 1) * (event.key === 'ArrowUp' ? -1 : 1);
                      onMoveLine(key, pixels);
                    }}
                    onPointerDown={(event) => {
                      if ((event.button ?? 0) !== 0 || event.ctrlKey) return;
                      dragging.current = key;
                      areaRef.current?.setPointerCapture?.(event.pointerId);
                      setLineFromClientY(key, event.clientY);
                    }}
                  >
                    <span className="relative ml-2 rounded bg-surface/90 px-1">
                      {key === 'head' ? 'Голова' : 'Ступни'}
                    </span>
                  </button>
                </Fragment>
              ))}
            </CalibrationArtwork>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" className="min-h-11" onClick={onCancel}>
            Отмена
          </Button>
          <Button className="min-h-11" onClick={onApply}>
            Применить
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type PaperMinisGeneratorStore = ReturnType<typeof createPaperMinisStore>;

export default function PaperMinisGenerator({ store: providedStore }: { store?: PaperMinisGeneratorStore }) {
  const fallbackStore = useMemo(() => createPaperMinisStore(), []);
  const store = providedStore ?? fallbackStore;
  const rows = useStore(store.$rows);
  const settings = useStore(store.$settings);
  const inputs = useStore(store.$inputs);
  const draftError = useStore(store.$draftError);
  const packed = useStore(store.$layout);
  const canGenerate = useStore(store.$canGenerate);
  const message = useStore(store.$message);
  const busy = useStore(store.$busy);
  const preparing = useStore(store.$preparing);
  const preview = useStore(store.$preview);
  const previewStale = useStore(store.$previewStale);
  const calibration = useStore(store.$calibration);
  const [previewUrl, setPreviewUrl] = useState<string>();
  const calibrationOpener = useRef<HTMLButtonElement>(null);
  const [dragging, setDragging] = useState(false);
  const files = useRef<HTMLInputElement>(null);
  const handlePageSize = (event: JSX.TargetedEvent<HTMLSelectElement, Event>) =>
    store.settings({ pageSize: (event.target as HTMLSelectElement).value as 'a4' | 'letter' });
  const handleMargin = (event: JSX.TargetedEvent<HTMLInputElement, Event>) =>
    store.setMargin((event.target as HTMLInputElement).value);
  const handleSetAllSizes = (event: JSX.TargetedEvent<HTMLSelectElement, Event>) =>
    store.setAllSizes((event.target as HTMLSelectElement).value as MiniSize);
  const handleNumberDuplicates = (event: JSX.TargetedEvent<HTMLInputElement, Event>) =>
    store.settings({ numberDuplicates: (event.target as HTMLInputElement).checked });
  const handleNormalization = (event: JSX.TargetedEvent<HTMLInputElement, Event>) =>
    store.settings({ normalization: (event.target as HTMLInputElement).checked });
  const handleBatchInput = (event: JSX.TargetedEvent<HTMLInputElement, Event>) => {
    const target = event.target as HTMLInputElement;
    const selected = Array.from(target.files ?? []);
    if (selected.length === 0) return;
    store.ingest(selected);
    target.value = '';
  };

  useEffect(() => {
    store.loadSettings();
  }, [store]);
  useEffect(() => {
    if (!preview) {
      setPreviewUrl(undefined);
      return;
    }
    try {
      const url = URL.createObjectURL(
        new Blob([preview.bytes as BlobPart], { type: 'application/pdf' }),
      );
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } catch {
      setPreviewUrl(undefined);
      store.reportPdfFailure();
    }
  }, [preview, store]);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes('Files');
    const enter = (event: DragEvent) => {
      if (hasFiles(event) && store.$acceptsFiles.get()) {
        event.preventDefault();
        depth++;
        setDragging(true);
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
        store.ingest(Array.from(event.dataTransfer?.files ?? []));
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
  }, [store]);

  async function download() {
    const bytes = await store.download();
    if (!bytes) return;
    let url: string | undefined;
    try {
      const nextUrl = URL.createObjectURL(
        new Blob([bytes as BlobPart], { type: 'application/pdf' }),
      );
      url = nextUrl;
      const anchor = document.createElement('a');
      anchor.href = nextUrl;
      anchor.download = buildFilename();
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(nextUrl), 5000);
    } catch {
      if (url) URL.revokeObjectURL(url);
      store.reportPdfFailure();
    }
  }

  async function downloadPrinterScaleTestSheet() {
    let url: string | undefined;
    try {
      const bytes = await generatePrinterScaleTestSheet(settings.pageSize);
      const nextUrl = URL.createObjectURL(
        new Blob([bytes as BlobPart], { type: 'application/pdf' }),
      );
      url = nextUrl;
      const anchor = document.createElement('a');
      anchor.href = nextUrl;
      anchor.download = buildPrinterScaleTestSheetFilename(settings.pageSize);
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(nextUrl), 5000);
    } catch {
      if (url) URL.revokeObjectURL(url);
      store.reportPdfFailure();
    }
  }

  async function exportZip() {
    const bytes = await store.exportZip();
    if (!bytes) return;
    let url: string | undefined;
    try {
      const nextUrl = URL.createObjectURL(
        new Blob([bytes as BlobPart], { type: 'application/zip' }),
      );
      url = nextUrl;
      const anchor = document.createElement('a');
      anchor.href = nextUrl;
      anchor.download = buildZipFilename();
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(nextUrl), 5000);
    } catch {
      if (url) URL.revokeObjectURL(url);
      store.reportExportFailure();
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
                  onInput={handlePageSize}
                  onChange={handlePageSize}
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
                  value={inputs.margin.text}
                  aria-invalid={!inputs.margin.valid}
                  onInput={handleMargin}
                  onChange={handleMargin}
                  onBlur={store.commitMargin}
                />
              </label>
              <div className="space-y-2 border-y border-border py-3">
                <div>
                  <h3 className="text-base font-medium text-text">Масштаб принтера</h3>
                  <p className="mt-1 text-sm leading-relaxed text-text-muted">
                    {settings.printerMeasurementMm === undefined
                      ? 'Принтер не измерен: размеры приблизительные.'
                      : `Линейка измерена: ${settings.printerMeasurementMm} мм.`}
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="min-h-11 w-full whitespace-normal"
                  onClick={() => void downloadPrinterScaleTestSheet()}
                >
                  Скачать тестовый лист масштаба
                </Button>
                <label className="block text-sm">
                  Длина линейки, мм
                  <input
                    className={field}
                    type="number"
                    min="80"
                    max="100"
                    step="any"
                    value={inputs.printerMeasurement.text}
                    aria-invalid={!inputs.printerMeasurement.valid}
                    onInput={(event) =>
                      store.setPrinterMeasurement((event.target as HTMLInputElement).value)
                    }
                    onChange={(event) =>
                      store.setPrinterMeasurement((event.target as HTMLInputElement).value)
                    }
                    onBlur={store.commitPrinterMeasurement}
                  />
                </label>
                {settings.printerMeasurementMm !== undefined && (
                  <Button
                    variant="ghost"
                    className="min-h-11 w-full"
                    onClick={() => store.setPrinterMeasurement('')}
                  >
                    Сбросить измерение
                  </Button>
                )}
                <p className="text-sm leading-relaxed text-text-muted">
                  Измерение привязано к принтеру, настройкам печати и размеру бумаги.
                </p>
              </div>
              {rows.length > 0 && (
                <label className="block text-sm">
                  Высота всех фигурок
                  <select
                    className={field}
                    value=""
                    onInput={handleSetAllSizes}
                    onChange={handleSetAllSizes}
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
                    onInput={handleNumberDuplicates}
                    onChange={handleNumberDuplicates}
                  />
                  Нумеровать копии
                </label>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={settings.normalization}
                    onInput={handleNormalization}
                    onChange={handleNormalization}
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
                {draftError && (
                  <p role="status" className="text-sm text-danger">
                    {draftError}
                  </p>
                )}
                <div className="space-y-2">
                  <Button
                    className="min-h-11 w-full"
                    disabled={!canGenerate}
                    onClick={() => void download()}
                  >
                    {busy ? 'Подготовка PDF…' : 'Скачать PDF'}
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-11 w-full"
                    disabled={!canGenerate}
                    onClick={() => void exportZip()}
                  >
                    Экспорт в ZIP
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-11 w-full"
                    disabled={!canGenerate}
                    onClick={() => void store.refreshPreview()}
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
                onDragOver={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  store.ingest(Array.from(event.dataTransfer?.files ?? []));
                }}
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
              accept={`${ARTWORK_ACCEPT},.zip,application/zip`}
              className="hidden"
              aria-label="Добавить изображения"
              onInput={handleBatchInput}
              onChange={handleBatchInput}
            />

            <section aria-label="Миниатюры" className="space-y-5">
              <h2 className="sr-only">Миниатюры</h2>
              {rows.map((row, index) => {
                const status = packed.entries[index];
                const statusWarning = status && entryStatusWarning(status);
                const rowInputs = inputs.rows[row.id];
                return (
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
                        calibration={row.calibration}
                        label="Лицевая сторона"
                        hint="Выбрать лицевую сторону"
                        loading={status?.state === 'loading'}
                        onFile={(file) => void store.setImage(row.id, file)}
                      />
                      <div className="space-y-2">
                        <ArtworkSlot
                          artwork={row.backArtwork}
                          calibration={row.calibration}
                          label={
                            row.backImage
                              ? `Оборот: ${row.backImage.name}`
                              : 'Оборот: отражение лицевой стороны'
                          }
                          displayLabel="Оборот"
                          hint="Добавить свой оборот или оставить отражение"
                          loading={status?.state === 'loading' && !!row.backImage}
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
                            disabled={!row.artwork || status?.state === 'loading'}
                            onClick={(event) => {
                              calibrationOpener.current = event.target as HTMLButtonElement;
                              store.openCalibration(row.id);
                            }}
                          >
                            Задать рост
                          </Button>
                          {row.calibration && (
                            <Button
                              variant="ghost"
                              className="min-h-11"
                              onClick={() => store.resetCalibration(row.id)}
                            >
                              Сбросить рост
                            </Button>
                          )}
                        </div>
                        {row.calibration && (
                          <p className="text-sm font-medium text-text">Рост задан вручную</p>
                        )}
                      </div>
                      <label className="block text-sm">
                        Высота существа
                        <select
                          className={field}
                          value={row.heightSlot}
                          title={slotGeometryLabel(row.heightSlot)}
                          onInput={(event) =>
                            store.setSize(row.id, (event.target as HTMLSelectElement).value as MiniSize)
                          }
                          onChange={(event) =>
                            store.setSize(row.id, (event.target as HTMLSelectElement).value as MiniSize)
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
                          required
                          value={rowInputs.count.text}
                          aria-invalid={!rowInputs.count.valid}
                          onInput={(event) => store.setCount(row.id, (event.target as HTMLInputElement).value)}
                          onChange={(event) => store.setCount(row.id, (event.target as HTMLInputElement).value)}
                          onBlur={() => store.commitCount(row.id)}
                        />
                      </label>
                      {row.heightSlot === 'custom' && (
                        <div className="grid grid-cols-2 gap-2 sm:col-span-2">
                          {(['customWidthMm', 'customHeightMm'] as const).map((key, i) => {
                            const dimension = i === 0 ? 'width' : 'height';
                            return (
                              <label key={key} className="text-sm">
                                {i === 0 ? 'Основание, мм' : 'Фигурка, мм'}
                                <input
                                  className={field}
                                  type="number"
                                  step="any"
                                  required
                                  value={rowInputs[key].text}
                                  aria-invalid={!rowInputs[key].valid}
                                  onInput={(event) =>
                                    store.setCustomDimensions(row.id, {
                                      [dimension]: (event.target as HTMLInputElement).value,
                                    })
                                  }
                                  onChange={(event) =>
                                    store.setCustomDimensions(row.id, {
                                      [dimension]: (event.target as HTMLInputElement).value,
                                    })
                                  }
                                  onBlur={() => store.commitCustomDimension(row.id, dimension)}
                                />
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <p className="mt-3 text-xs leading-relaxed text-text-muted">
                      {row.backImage
                        ? 'В PDF попадёт отдельное изображение оборота.'
                        : 'Без отдельного файла лицевая сторона будет отражена автоматически.'}
                    </p>
                    {statusWarning && (
                      <p
                        role="status"
                        className={`mt-3 border-l-2 pl-3 text-sm ${status.state === 'oversized' ? 'border-danger text-danger' : 'border-warning text-warning'}`}
                      >
                        {statusWarning}
                      </p>
                    )}
                    {[
                      status?.state === 'failed' && row.frontError,
                      row.normalizationWarning,
                      row.backWarning,
                    ]
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
                );
              })}
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
            <b>Печатайте с подгонкой под страницу.</b> Контрольная линейка на листе должна быть
            ровно 100 мм.
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
      {preview && previewUrl && (
        <section aria-label="Предпросмотр PDF" className="space-y-2">
          {previewStale && (
            <p role="status" className="text-sm text-warning">
              Настройки или изображения изменились. Обновите предпросмотр.
            </p>
          )}
          <iframe
            title="Предпросмотр PDF"
            src={previewUrl}
            className="h-[65vh] w-full rounded-lg border border-border"
          />
          <a href={previewUrl} target="_blank" rel="noreferrer" className="text-primary underline">
            Открыть PDF в новой вкладке
          </a>
        </section>
      )}
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center border-4 border-primary bg-surface/90 text-2xl text-primary">
          Отпустите файлы, чтобы добавить миниатюры
        </div>
      )}
      {calibration && (
        <HeightCalibrationDialog
          returnFocus={calibrationOpener}
          session={calibration}
          onSetLine={store.setCalibrationLine}
          onMoveLine={store.moveCalibrationLine}
          onCancel={store.cancelCalibration}
          onApply={store.applyCalibration}
        />
      )}
    </div>
  );
}
