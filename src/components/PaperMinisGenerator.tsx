import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import { useStore } from '@nanostores/react';
import {
  ChevronDownIcon,
  CopyIcon,
  MinusIcon,
  PlusIcon,
  RulerIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { createPaperMinisStore, type CalibrationSession } from '@/stores/paper-minis-store';
import { ARTWORK_ACCEPT, artworkMimeType } from '@/lib/paper-minis/artwork-formats';
import { isSupportedArtwork } from '@/lib/paper-minis/artwork';
import type { CalibrationLine } from '@/lib/paper-minis/calibration-session';
import { entryStatusWarning } from '@/lib/paper-minis/geometry';
import { buildFilename, buildPrinterScaleTestSheetFilename } from '@/lib/paper-minis/pdf-filenames';
import {
  CUSTOM_SIZE_NAME,
  HEIGHT_SLOT_ORDER,
  slotLabel,
  slotGeometryLabel,
  slotMenuParts,
  slotName,
} from '@/lib/paper-minis/sizes';
import type { HeightCalibration, PreparedArtwork } from '@/lib/paper-minis/types';
import { pluralFormRu, pluralRu } from '@/lib/plural';
import { cn } from '@/lib/utils';

const field =
  'min-h-11 w-full rounded-lg border border-border bg-surface-elevated px-3 text-text focus-visible:outline-2 focus-visible:outline-primary';

const foldTrigger =
  'min-h-12 items-center gap-2 py-0 font-sans text-base font-normal hover:no-underline **:data-[slot=accordion-trigger-icon]:ml-0';

const foldValue = 'ml-auto truncate text-sm text-text-muted';

const rowField =
  'inline-flex h-10 items-center rounded-md border border-border bg-surface text-sm text-text';

const stepButton = 'h-full w-9 rounded-md text-base';

// The visible icon stays small on the thumbnail; the pseudo-element widens the
// hit area towards the 44 px touch target.
const overlayButton =
  "relative size-5 rounded-none after:absolute after:-inset-2 after:content-[''] [&_svg:not([class*='size-'])]:size-3";

const copyForms = { one: 'копия', few: 'копии', many: 'копий' };

const miniatureForms = { one: 'миниатюра', few: 'миниатюры', many: 'миниатюр' };

const sheetForms = { one: 'лист', few: 'листа', many: 'листов' };

function formatMm(value: number) {
  return value.toLocaleString('ru-RU');
}

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

    const next = URL.createObjectURL(
      new Blob([artwork.bytes.slice()], {
        type: artworkMimeType(artwork.format),
      }),
    );

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
  imageClassName,
  children,
}: {
  artwork: PreparedArtwork;
  url: string;
  label: string;
  imageClassName?: string;
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
        <img src={url} alt={label} className={cn('block h-full w-full', imageClassName)} />
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

// A thumbnail on the white the mini prints on. Without a file of its own, the
// back slot shows the front mirrored and faded: that is what the PDF prints.
function ArtworkSlot({
  artwork,
  mirrorOf,
  calibration,
  label,
  hint,
  loading,
  onFile,
  children,
}: {
  artwork?: PreparedArtwork | null;
  mirrorOf?: PreparedArtwork | null;
  calibration?: HeightCalibration;
  label: string;
  hint: string;
  loading: boolean;
  onFile: (file: File) => void;
  children?: ReactNode;
}) {
  const shown = artwork ?? mirrorOf;
  const mirrored = !artwork && !!mirrorOf;
  const url = useArtworkUrl(shown);
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="relative h-20 w-14 shrink-0 sm:h-26 sm:w-20">
      <Button
        variant="ghost"
        className="size-full rounded-sm border-border bg-surface-elevated p-1.5 whitespace-normal hover:bg-surface-elevated focus-visible:ring-inset"
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
        {url && shown && !loading ? (
          <ArtworkFrame
            artwork={shown}
            url={url}
            label={mirrored ? '' : label}
            imageClassName={mirrored ? '-scale-x-100 opacity-35' : undefined}
          >
            {calibration && (
              <span className="pointer-events-none absolute inset-0">
                {(['head', 'feet'] as const).map((key) => (
                  <span
                    key={key}
                    data-testid={`calibration-${key}`}
                    className="absolute left-0 right-0 border-t-2 border-primary"
                    style={{ top: `${calibration[key] * 100}%` }}
                  />
                ))}
              </span>
            )}
          </ArtworkFrame>
        ) : (
          <span className="text-xs font-normal leading-tight text-text-muted">
            {loading ? 'Загрузка…' : hint}
          </span>
        )}
      </Button>
      {children}
      <input
        ref={input}
        type="file"
        accept={ARTWORK_ACCEPT}
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
  children: ReactNode;
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
  returnFocus: React.RefObject<HTMLButtonElement | null>;
}) {
  const { artwork, backArtwork, lines } = session;
  const frontUrl = useArtworkUrl(artwork);
  const backUrl = useArtworkUrl(backArtwork);
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

export default function PaperMinisGenerator() {
  const store = useMemo(() => createPaperMinisStore(), []);
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

  const pageLabel = settings.pageSize === 'a4' ? 'A4' : 'Letter';

  const figuresSummary =
    [settings.normalization && 'обрезка', settings.numberDuplicates && 'нумерация']
      .filter(Boolean)
      .join(', ') || '—';

  const [previewUrl, setPreviewUrl] = useState<string>();
  const calibrationOpener = useRef<HTMLButtonElement>(null);
  const [dragging, setDragging] = useState(false);
  const files = useRef<HTMLInputElement>(null);

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
        new Blob([preview.bytes.slice()], { type: 'application/pdf' }),
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
      const nextUrl = URL.createObjectURL(new Blob([bytes.slice()], { type: 'application/pdf' }));

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
      const { generatePrinterScaleTestSheet } = await import('@/lib/paper-minis/pdf');
      const bytes = await generatePrinterScaleTestSheet(settings.pageSize);

      const nextUrl = URL.createObjectURL(new Blob([bytes.slice()], { type: 'application/pdf' }));

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
      const nextUrl = URL.createObjectURL(new Blob([bytes.slice()], { type: 'application/zip' }));

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
            <aside className="rounded-lg border border-border bg-surface-elevated p-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
              <h2 className="mb-2 text-xl text-text">Настройки</h2>
              <Accordion className="border-y border-border">
                <AccordionItem value="paper">
                  <AccordionTrigger className={foldTrigger}>
                    Бумага
                    <span className={foldValue}>
                      {pageLabel} · поля {formatMm(settings.marginMm)} мм
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="grid grid-cols-[1.4fr_1fr] gap-2 pb-4">
                    <label className="block text-sm text-text-muted">
                      Формат
                      <select
                        className={`${field} mt-1`}
                        value={settings.pageSize}
                        onChange={(event) => {
                          const pageSize = event.target.value;

                          if (pageSize === 'a4' || pageSize === 'letter')
                            store.settings({ pageSize });
                        }}
                      >
                        <option value="a4" title="210 × 297 мм">
                          A4
                        </option>
                        <option value="letter" title="216 × 279 мм">
                          Letter
                        </option>
                      </select>
                    </label>
                    <label className="block text-sm text-text-muted">
                      Поля, мм
                      <input
                        className={`${field} mt-1`}
                        type="number"
                        min="0"
                        step="any"
                        required
                        value={inputs.margin.text}
                        aria-invalid={!inputs.margin.valid}
                        onChange={(event) => store.setMargin(event.target.value)}
                        onBlur={store.commitMargin}
                      />
                    </label>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="figures">
                  <AccordionTrigger className={foldTrigger}>
                    Фигурки
                    <span className={foldValue}>{figuresSummary}</span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-2">
                    <label className="flex min-h-11 items-center gap-3 text-sm">
                      <input
                        type="checkbox"
                        checked={settings.numberDuplicates}
                        onChange={(event) =>
                          store.settings({ numberDuplicates: event.target.checked })
                        }
                      />
                      Нумеровать копии
                    </label>
                    <label className="flex min-h-11 items-center gap-3 text-sm">
                      <input
                        type="checkbox"
                        checked={settings.normalization}
                        onChange={(event) =>
                          store.settings({ normalization: event.target.checked })
                        }
                      />
                      Обрезать пустые поля
                    </label>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="scale">
                  <AccordionTrigger className={foldTrigger}>
                    Масштаб
                    <span className={foldValue}>
                      {settings.printerMeasurementMm === undefined
                        ? 'по умолчанию'
                        : `подогнан · ${formatMm(settings.printerMeasurementMm)} мм`}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-4 leading-relaxed">
                    <p className="text-text-muted">
                      Если фигурки печатаются чуть меньше или больше нужного:
                    </p>
                    <p>
                      Распечатайте{' '}
                      <button
                        type="button"
                        aria-label="Скачать тестовый лист"
                        className="rounded-sm font-medium text-primary underline underline-offset-3 focus-visible:outline-2 focus-visible:outline-primary"
                        onClick={() => void downloadPrinterScaleTestSheet()}
                      >
                        тестовый лист
                      </button>{' '}
                      и измерьте линейку на нём.
                    </p>
                    <div className="grid grid-cols-[auto_minmax(0,6rem)_auto] items-center justify-start gap-2">
                      <span id="printer-measurement-label">Вышло</span>
                      <input
                        className={`${field} text-right`}
                        type="number"
                        min="80"
                        max="100"
                        step="any"
                        placeholder="100"
                        aria-labelledby="printer-measurement-label printer-measurement-unit"
                        value={inputs.printerMeasurement.text}
                        aria-invalid={!inputs.printerMeasurement.valid}
                        onChange={(event) => store.setPrinterMeasurement(event.target.value)}
                        onBlur={store.commitPrinterMeasurement}
                      />
                      <span
                        id="printer-measurement-unit"
                        className="whitespace-nowrap text-text-muted"
                      >
                        из 100 мм
                      </span>
                    </div>
                    {settings.printerMeasurementMm !== undefined && (
                      <Button
                        variant="ghost"
                        className="min-h-11 w-full"
                        onClick={() => store.setPrinterMeasurement('')}
                      >
                        Сбросить измерение
                      </Button>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
              <div className="mt-4 space-y-2">
                {!rows.length && (
                  <p className="text-sm text-text-muted">
                    Добавьте изображения для печати миниатюр.
                  </p>
                )}
                {message && (
                  <p role="status" className="text-sm">
                    {message}
                  </p>
                )}
                <p role="status" className="text-sm empty:hidden">
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
                <Button
                  className="h-auto min-h-11 w-full flex-col gap-0.5 py-2"
                  aria-label={busy ? 'Подготовка PDF…' : 'Скачать PDF'}
                  aria-describedby={rows.length ? 'pdf-summary' : undefined}
                  disabled={!canGenerate}
                  onClick={() => void download()}
                >
                  {busy ? 'Подготовка PDF…' : 'Скачать PDF'}
                  {rows.length > 0 && (
                    <span
                      id="pdf-summary"
                      aria-live="polite"
                      className="text-xs font-normal whitespace-normal opacity-85"
                    >
                      {pluralRu(packed.miniCount, miniatureForms)} ·{' '}
                      {pluralRu(packed.pageCount, sheetForms)} {pageLabel}
                    </span>
                  )}
                </Button>
                <p className="flex justify-center gap-1.5 text-sm text-text-muted">
                  <Button
                    variant="link"
                    className="h-auto min-h-11 px-1 underline"
                    aria-label={preview ? 'Обновить предпросмотр' : 'Предпросмотр PDF'}
                    disabled={!canGenerate}
                    onClick={() => void store.refreshPreview()}
                  >
                    {preview ? 'Обновить предпросмотр' : 'Предпросмотр'}
                  </Button>
                  <span aria-hidden="true" className="self-center">
                    ·
                  </span>
                  <Button
                    variant="link"
                    className="h-auto min-h-11 px-1 underline"
                    aria-label="Экспорт в ZIP"
                    disabled={!canGenerate}
                    onClick={() => void exportZip()}
                  >
                    ZIP
                  </Button>
                </p>
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
              accept={`${ARTWORK_ACCEPT},.zip,application/zip`}
              className="hidden"
              aria-label="Добавить изображения"
              onChange={(event) => {
                store.ingest(Array.from(event.target.files ?? []));
                event.target.value = '';
              }}
            />

            <section aria-label="Миниатюры" className="space-y-5">
              <div
                className={`flex flex-wrap items-center justify-between gap-2 ${rows.length ? '' : 'sr-only'}`}
              >
                <h2 className="text-xl text-text">
                  Миниатюры
                  {rows.length > 0 && <span className="text-text-muted"> · {rows.length}</span>}
                </h2>
                {rows.length > 1 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="outline" className="min-h-11" />}>
                      Сменить высоту
                      <ChevronDownIcon aria-hidden="true" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>Для всех миниатюр</DropdownMenuLabel>
                        {HEIGHT_SLOT_ORDER.map((slot) => {
                          const { title, typical } = slotMenuParts(slot);

                          return (
                            <DropdownMenuItem
                              key={slot}
                              className="min-h-11 flex-col items-start gap-0"
                              title={slotGeometryLabel(slot)}
                              onClick={() => store.setAllSizes(slot)}
                            >
                              {title}
                              <span className="text-xs text-text-muted">{typical}</span>
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              <div className="flex flex-col gap-3">
                {rows.map((row, index) => {
                  const status = packed.entries[index];
                  const statusWarning = status && entryStatusWarning(status);
                  const rowInputs = inputs.rows[row.id];
                  const loading = status?.state === 'loading';

                  const warnings = [
                    status?.state === 'failed' && row.frontError,
                    row.normalizationWarning,
                    row.backWarning,
                  ].filter((warning): warning is string => !!warning);

                  return (
                    <article
                      key={row.id}
                      aria-label={`Миниатюра ${index + 1}`}
                      className="-mx-3 grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-2.5 rounded-lg p-3 transition-colors duration-120 focus-within:bg-muted/40 hover:bg-muted/40 motion-reduce:transition-none"
                    >
                      <div className="row-span-2 flex gap-1.5">
                        <ArtworkSlot
                          artwork={row.artwork}
                          calibration={row.calibration}
                          label="Лицевая сторона"
                          hint="Выбрать лицевую сторону"
                          loading={loading}
                          onFile={(file) => void store.setImage(row.id, file)}
                        >
                          <span
                            className={cn(
                              'absolute -top-1 -right-1 inline-flex overflow-hidden rounded-full border',
                              row.calibration
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border bg-surface-elevated text-text',
                            )}
                          >
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className={cn(
                                overlayButton,
                                row.calibration &&
                                  'hover:bg-secondary hover:text-primary-foreground',
                              )}
                              aria-label="Задать рост"
                              title={
                                row.calibration
                                  ? 'Изменить разметку головы и стоп'
                                  : 'Задать рост: отметить голову и стопы'
                              }
                              disabled={!row.artwork || loading}
                              onClick={(event) => {
                                calibrationOpener.current = event.currentTarget;
                                store.openCalibration(row.id);
                              }}
                            >
                              <RulerIcon aria-hidden="true" />
                            </Button>
                            {row.calibration && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className={cn(
                                  overlayButton,
                                  'border-0 border-l border-primary-foreground/35 hover:bg-secondary hover:text-primary-foreground',
                                )}
                                aria-label="Сбросить рост"
                                title="Сбросить рост"
                                onClick={() => store.resetCalibration(row.id)}
                              >
                                <XIcon aria-hidden="true" />
                              </Button>
                            )}
                          </span>
                        </ArtworkSlot>
                        <ArtworkSlot
                          artwork={row.backArtwork}
                          mirrorOf={row.backImage ? undefined : row.artwork}
                          calibration={row.calibration}
                          label={
                            row.backImage
                              ? `Оборот: ${row.backImage.name}`
                              : 'Оборот: отражение лицевой стороны'
                          }
                          hint="Свой оборот"
                          loading={loading && !!row.backImage}
                          onFile={(file) => void store.setImage(row.id, file, true)}
                        >
                          {(row.backImage || row.backWarning) && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className={cn(
                                overlayButton,
                                'absolute -top-1 -right-1 rounded-full border border-border bg-surface-elevated',
                              )}
                              aria-label="Убрать оборот"
                              title="Убрать оборот"
                              onClick={() => store.clearBack(row.id)}
                            >
                              <XIcon aria-hidden="true" />
                            </Button>
                          )}
                        </ArtworkSlot>
                      </div>

                      <div className="flex min-w-0 items-start gap-1">
                        <h3 className="min-w-0 flex-1 pt-0.5 text-xl leading-tight [overflow-wrap:anywhere] text-text">
                          {row.name || `Миниатюра ${index + 1}`}
                        </h3>
                        {row.calibration && <span className="sr-only">Рост задан вручную</span>}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="-my-2.5 size-11 text-text-muted hover:text-text"
                          aria-label="Дублировать"
                          title="Дублировать"
                          onClick={() => store.duplicate(row.id)}
                        >
                          <CopyIcon aria-hidden="true" className="size-5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="-my-2.5 size-11 text-text-muted hover:text-text"
                          aria-label="Удалить"
                          title="Удалить"
                          onClick={() => store.remove(row.id)}
                        >
                          <Trash2Icon aria-hidden="true" className="size-5" />
                        </Button>
                      </div>

                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span
                          className={`${rowField} relative gap-1 px-3 font-semibold focus-within:outline-2 focus-within:outline-primary hover:bg-muted`}
                        >
                          {row.heightSlot === 'custom'
                            ? CUSTOM_SIZE_NAME
                            : slotName(row.heightSlot)}
                          <ChevronDownIcon aria-hidden="true" className="size-4" />
                          <select
                            className="absolute inset-0 cursor-pointer opacity-0"
                            aria-label="Высота существа"
                            value={row.heightSlot}
                            title={slotGeometryLabel(row.heightSlot)}
                            onChange={(event) => {
                              const value = event.target.value;

                              const size =
                                value === 'custom'
                                  ? value
                                  : HEIGHT_SLOT_ORDER.find((slot) => slot === value);

                              if (size !== undefined) store.setSize(row.id, size);
                            }}
                          >
                            <SizeOptions custom />
                          </select>
                        </span>
                        <span className={`${rowField} font-semibold`}>
                          <Button
                            variant="ghost"
                            className={stepButton}
                            aria-label="Меньше копий"
                            disabled={row.count <= 1}
                            onClick={() => store.setCount(row.id, String(row.count - 1))}
                          >
                            <MinusIcon aria-hidden="true" />
                          </Button>
                          <input
                            className="w-[3ch] bg-transparent text-right tabular-nums [appearance:textfield] focus-visible:outline-2 focus-visible:outline-primary aria-invalid:text-danger [&::-webkit-inner-spin-button]:appearance-none"
                            type="number"
                            min="1"
                            step="1"
                            required
                            aria-label="Количество копий"
                            value={rowInputs.count.text}
                            aria-invalid={!rowInputs.count.valid}
                            onChange={(event) => store.setCount(row.id, event.target.value)}
                            onBlur={() => store.commitCount(row.id)}
                          />
                          <span className="pl-1">{pluralFormRu(row.count, copyForms)}</span>
                          <Button
                            variant="ghost"
                            className={stepButton}
                            aria-label="Больше копий"
                            onClick={() => store.setCount(row.id, String(row.count + 1))}
                          >
                            <PlusIcon aria-hidden="true" />
                          </Button>
                        </span>
                        {row.heightSlot === 'custom' &&
                          (['customWidthMm', 'customHeightMm'] as const).map((key, i) => {
                            const dimension = i === 0 ? 'width' : 'height';

                            return (
                              <label
                                key={key}
                                className="flex items-center gap-2 text-sm text-text-muted"
                              >
                                {i === 0 ? 'Основание, мм' : 'Фигурка, мм'}
                                <input
                                  className={`${rowField} w-20 px-2 text-text`}
                                  type="number"
                                  step="any"
                                  required
                                  value={rowInputs[key].text}
                                  aria-invalid={!rowInputs[key].valid}
                                  onChange={(event) =>
                                    store.setCustomDimensions(row.id, {
                                      [dimension]: event.target.value,
                                    })
                                  }
                                  onBlur={() => store.commitCustomDimension(row.id, dimension)}
                                />
                              </label>
                            );
                          })}
                      </div>

                      {(statusWarning || warnings.length > 0) && (
                        <div className="col-start-2 space-y-2">
                          {statusWarning && (
                            <p
                              role="status"
                              className={`border-l-2 pl-3 text-sm ${status.state === 'oversized' ? 'border-danger text-danger' : 'border-warning text-warning'}`}
                            >
                              {statusWarning}
                            </p>
                          )}
                          {warnings.map((warning) => (
                            <p
                              key={warning}
                              role="status"
                              className="border-l-2 border-warning pl-3 text-sm text-warning"
                            >
                              {warning}
                            </p>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
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
