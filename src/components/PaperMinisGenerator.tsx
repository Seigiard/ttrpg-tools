import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { Button } from '@/components/ui/button';
import { createPaperMinisStore } from '@/stores/paper-minis-store';
import { isSupportedArtwork } from '@/lib/paper-minis/artwork';
import { generatePDF, buildFilename } from '@/lib/paper-minis/pdf';
import {
  DEFAULT_CUSTOM_HEIGHT_MM,
  DEFAULT_CUSTOM_WIDTH_MM,
  HEIGHT_SLOT_ORDER,
  slotLabel,
  slotGeometryLabel,
} from '@/lib/paper-minis/sizes';
import type { MiniSize, PreparedArtwork } from '@/lib/paper-minis/types';

const field =
  'min-h-11 w-full rounded-lg border border-border bg-surface-elevated px-3 text-text focus-visible:outline-2 focus-visible:outline-primary';

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

function ArtworkSlot({
  artwork,
  label,
  loading,
  onFile,
}: {
  artwork?: PreparedArtwork | null;
  label: string;
  loading: boolean;
  onFile: (file: File) => void;
}) {
  const [url, setUrl] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
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
  return (
    <div>
      <Button
        variant="outline"
        className="h-28 w-full whitespace-normal"
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
        {url ? (
          <img src={url} alt={label} className="h-full w-full object-contain p-1" />
        ) : (
          <span className="text-xs text-text-muted">{loading ? 'Загрузка…' : label}</span>
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
  const previewUrl = useRef<string | undefined>(undefined);
  const [dragging, setDragging] = useState(false);
  const files = useRef<HTMLInputElement>(null);
  const packed = useMemo(() => store.pack(), [store, rows, settings]);
  const marginValid =
    margin.trim() !== '' && Number.isFinite(Number(margin)) && Number(margin) >= 0;

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
      if (hasFiles(event)) {
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
    <div className="space-y-6">
      <fieldset
        aria-label="Редактор миниатюр"
        aria-busy={busy}
        disabled={busy}
        className="min-w-0 space-y-6 disabled:opacity-60"
      >
        <section
          aria-label="Настройки печати"
          className="grid gap-4 rounded-lg border border-border bg-surface-elevated p-4 sm:grid-cols-2"
        >
          <label className="space-y-2 text-sm">
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
          <label className="space-y-2 text-sm">
            Поля вокруг фигурки, мм
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
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.numberDuplicates}
              onChange={(event) => store.settings({ numberDuplicates: event.target.checked })}
            />
            Нумеровать копии
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.normalization}
              onChange={(event) => store.settings({ normalization: event.target.checked })}
            />
            Обрезать пустые поля изображения
          </label>
        </section>
        <Button
          variant="outline"
          className="h-auto min-h-28 w-full flex-col whitespace-normal border-dashed p-6"
          onClick={() => files.current?.click()}
        >
          <span>Добавить изображения</span>
          <span className="text-sm font-normal text-text-muted">
            Перетащите файлы сюда или нажмите для выбора. PNG, JPG, WebP.
          </span>
        </Button>
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
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" className="min-h-11" onClick={() => store.addBlank()}>
            Добавить пустую строку
          </Button>
          {rows.length > 0 && (
            <label className="min-w-0 flex-1 text-sm">
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
                  Выберите высоту…
                </option>
                <SizeOptions />
              </select>
            </label>
          )}
        </div>
        <section aria-label="Миниатюры" className="space-y-4">
          {rows.map((row, index) => (
            <article
              key={row.id}
              aria-label={`Миниатюра ${index + 1}`}
              className="space-y-3 rounded-lg border border-border bg-surface-elevated p-4"
            >
              <p className="break-all text-sm font-medium">
                {row.image?.name ?? 'Добавьте лицевую сторону'}
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-[6rem_6rem_1fr]">
                <ArtworkSlot
                  artwork={row.artwork}
                  label="Лицевая сторона"
                  loading={!!row.image && !row.artwork && !row.frontError}
                  onFile={(file) => void store.setImage(row.id, file)}
                />
                <div>
                  <ArtworkSlot
                    artwork={row.backArtwork}
                    label={
                      row.backImage
                        ? `Оборот: ${row.backImage.name}`
                        : 'Оборот: отражение лицевой стороны'
                    }
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
                <div className="col-span-2 space-y-3 sm:col-span-1">
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
                  {row.heightSlot === 'custom' && (
                    <div className="grid grid-cols-2 gap-2">
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
                </div>
              </div>
              {packed.oversizedEntryIndices.includes(index) && (
                <p role="status" className="text-sm text-danger">
                  Не помещается на лист. Уменьшите размер или поля. Эта миниатюра не попадёт в PDF.
                </p>
              )}
              {[row.frontError, row.normalizationWarning, row.backWarning]
                .filter(Boolean)
                .map((warning, i) => (
                  <p key={i} role="status" className="text-sm text-warning">
                    {warning}
                  </p>
                ))}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="min-h-11"
                  onClick={() => store.duplicate(row.id)}
                >
                  Дублировать
                </Button>
                <Button variant="ghost" className="min-h-11" onClick={() => store.remove(row.id)}>
                  Удалить
                </Button>
              </div>
            </article>
          ))}
        </section>
      </fieldset>
      <aside className="space-y-2 text-sm text-text-muted">
        <p>
          Изображения обрабатываются в браузере и не отправляются на сервер. Сохраняются только
          настройки печати.
        </p>
        <p>
          Высота задаёт размер фигурки на бумаге. Очень широкие изображения уменьшаются целиком.
          Основание зависит от категории размера; у самых крупных фигурок оно более плоское, чтобы
          развёртка помещалась на лист.
        </p>
        <p>
          Обрезка убирает прозрачные или одноцветные поля. Она может затронуть детали, близкие к
          цвету фона: отключите её, чтобы печатать оригинал. Без отдельного изображения оборот
          отражает лицевую сторону. Для своего оборота загрузите вид существа сзади.
        </p>
        <p>
          Вырежьте развёртку по внешним меткам, согните пополам между изображениями, отогните оба
          язычка наружу и приклейте их к полоске основания.
        </p>
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
      <div className="sticky bottom-0 space-y-3 border-t border-border bg-surface p-4">
        <p aria-live="polite">
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
        <div className="flex flex-wrap gap-2">
          <Button
            className="min-h-11"
            disabled={busy || preparing || !packed.miniCount || !marginValid}
            onClick={() => void generate(false)}
          >
            {busy ? 'Подготовка PDF…' : 'Скачать PDF'}
          </Button>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={busy || preparing || !packed.miniCount || !marginValid}
            onClick={() => void generate(true)}
          >
            {preview ? 'Обновить предпросмотр' : 'Предпросмотр PDF'}
          </Button>
        </div>
        <p className="text-xs text-text-muted">
          Печатайте в масштабе 100%, без подгонки под страницу. Контрольная линейка на листе должна
          быть ровно 100 мм.
        </p>
      </div>
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center border-4 border-primary bg-surface/90 text-2xl text-primary">
          Отпустите файлы, чтобы добавить миниатюры
        </div>
      )}
    </div>
  );
}
