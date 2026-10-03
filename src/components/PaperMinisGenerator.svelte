<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import Button from '@/components/ui/button.svelte';
  import PaperArtworkSlot from '@/components/PaperArtworkSlot.svelte';
  import PaperHeightCalibrationDialog from '@/components/PaperHeightCalibrationDialog.svelte';
  import { ARTWORK_ACCEPT } from '@/lib/paper-minis/artwork-formats';
  import { entryStatusWarning } from '@/lib/paper-minis/geometry';
  import {
    buildFilename,
    buildPrinterScaleTestSheetFilename,
    generatePrinterScaleTestSheet,
  } from '@/lib/paper-minis/pdf';
  import {
    HEIGHT_SLOT_ORDER,
    slotGeometryLabel,
    slotLabel,
    slotName,
  } from '@/lib/paper-minis/sizes';
  import type { MiniSize } from '@/lib/paper-minis/types';
  import { createPaperMinisStore } from '@/stores/paper-minis-store';

  const field =
    'min-h-11 w-full rounded-lg border border-border bg-surface-elevated px-3 text-text focus-visible:outline-2 focus-visible:outline-primary';
  const customDimensionKeys = ['customWidthMm', 'customHeightMm'] as const;

  function buildZipFilename(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `paper-minis-${year}-${month}-${day}.zip`;
  }

  const store = createPaperMinisStore();
  const rowsStore = store.$rows;
  const settingsStore = store.$settings;
  const inputsStore = store.$inputs;
  const draftErrorStore = store.$draftError;
  const packedStore = store.$layout;
  const canGenerateStore = store.$canGenerate;
  const messageStore = store.$message;
  const busyStore = store.$busy;
  const preparingStore = store.$preparing;
  const previewStore = store.$preview;
  const previewStaleStore = store.$previewStale;
  const calibrationStore = store.$calibration;

  let previewUrl = $state<string>();
  let dragging = $state(false);
  let files = $state<HTMLInputElement>();
  let calibrationOpener = $state<HTMLButtonElement | null>(null);

  let rows = $derived($rowsStore);
  let settings = $derived($settingsStore);
  let inputs = $derived($inputsStore);
  let draftError = $derived($draftErrorStore);
  let packed = $derived($packedStore);
  let canGenerate = $derived($canGenerateStore);
  let message = $derived($messageStore);
  let busy = $derived($busyStore);
  let preparing = $derived($preparingStore);
  let preview = $derived($previewStore);
  let previewStale = $derived($previewStaleStore);
  let calibration = $derived($calibrationStore);

  onMount(() => {
    store.loadSettings();
    let depth = 0;
    const hasFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes('Files');
    const enter = (event: DragEvent) => {
      if (hasFiles(event) && store.$acceptsFiles.get()) {
        event.preventDefault();
        depth += 1;
        dragging = true;
      }
    };
    const over = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) dragging = false;
    };
    const clear = () => {
      depth = 0;
      dragging = false;
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
  });

  $effect(() => {
    if (!preview) {
      previewUrl = undefined;
      return;
    }
    try {
      const url = URL.createObjectURL(
        new Blob([preview.bytes as BlobPart], { type: 'application/pdf' }),
      );
      previewUrl = url;
      return () => URL.revokeObjectURL(url);
    } catch {
      previewUrl = undefined;
      store.reportPdfFailure();
    }
  });

  onDestroy(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  });

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

  function setBulkSize(event: Event) {
    const select = event.currentTarget as HTMLSelectElement;
    const value = select.value;
    if (value) store.setAllSizes(value as MiniSize);
    select.value = '';
  }
</script>

<div class="space-y-8">
  <fieldset
    aria-label="Редактор миниатюр"
    aria-busy={busy}
    disabled={busy}
    class="min-w-0 disabled:opacity-60"
  >
    <div class="grid gap-6 xl:block">
      <div class="xl:absolute xl:right-full xl:h-full xl:w-60">
        <aside
          class="space-y-6 rounded-lg border border-border bg-surface-elevated p-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto"
        >
          <div>
            <h2 class="text-2xl text-text">Настройки</h2>
            <p class="mt-1 text-sm leading-relaxed text-text-muted">Общие параметры печати.</p>
          </div>
          <label class="block text-sm">
            Размер бумаги
            <select
              class={field}
              value={settings.pageSize}
              onchange={(event) =>
                store.settings({ pageSize: event.currentTarget.value as 'a4' | 'letter' })}
            >
              <option value="a4">A4 (210 × 297 мм)</option>
              <option value="letter">Letter (216 × 279 мм)</option>
            </select>
          </label>
          <label class="block text-sm">
            Поля, мм
            <input
              class={field}
              type="number"
              min="0"
              step="any"
              required
              value={inputs.margin.text}
              aria-invalid={!inputs.margin.valid}
              oninput={(event) => store.setMargin(event.currentTarget.value)}
              onchange={(event) => store.setMargin(event.currentTarget.value)}
              onblur={() => {
                store.commitMargin();
              }}
            />
          </label>
          <div class="space-y-2 border-y border-border py-3">
            <div>
              <h3 class="text-base font-medium text-text">Масштаб принтера</h3>
              <p class="mt-1 text-sm leading-relaxed text-text-muted">
                {settings.printerMeasurementMm === undefined
                  ? 'Принтер не измерен: размеры приблизительные.'
                  : `Линейка измерена: ${settings.printerMeasurementMm} мм.`}
              </p>
            </div>
            <Button
              variant="outline"
              class="min-h-11 w-full whitespace-normal"
              onclick={() => void downloadPrinterScaleTestSheet()}
            >
              Скачать тестовый лист масштаба
            </Button>
            <label class="block text-sm">
              Длина линейки, мм
              <input
                class={field}
                type="number"
                min="80"
                max="100"
                step="any"
                value={inputs.printerMeasurement.text}
                aria-invalid={!inputs.printerMeasurement.valid}
                oninput={(event) => store.setPrinterMeasurement(event.currentTarget.value)}
                onchange={(event) => store.setPrinterMeasurement(event.currentTarget.value)}
                onblur={() => store.commitPrinterMeasurement()}
              />
            </label>
            {#if settings.printerMeasurementMm !== undefined}<Button
                variant="ghost"
                class="min-h-11 w-full"
                onclick={() => store.setPrinterMeasurement('')}>Сбросить измерение</Button
              >{/if}
            <p class="text-sm leading-relaxed text-text-muted">
              Измерение привязано к принтеру, настройкам печати и размеру бумаги.
            </p>
          </div>
          {#if rows.length > 0}
            <label class="block text-sm">
              Высота всех фигурок
              <select class={field} value="" onchange={setBulkSize}>
                <option value="" disabled>Выберите…</option>
                {#each HEIGHT_SLOT_ORDER as slot}<option
                    value={slot}
                    title={slotGeometryLabel(slot)}>{slotLabel(slot)}</option
                  >{/each}
              </select>
            </label>
          {/if}
          <div class="space-y-2 border-y border-border py-3">
            <label class="flex min-h-11 items-center gap-3 text-sm"
              ><input
                type="checkbox"
                checked={settings.numberDuplicates}
                onchange={(event) =>
                  store.settings({ numberDuplicates: event.currentTarget.checked })}
              />Нумеровать копии</label
            >
            <label class="flex min-h-11 items-center gap-3 text-sm"
              ><input
                type="checkbox"
                checked={settings.normalization}
                onchange={(event) => store.settings({ normalization: event.currentTarget.checked })}
              />Обрезать пустые поля</label
            >
          </div>
          <div class="space-y-3">
            <h3 class="text-xl text-text">PDF</h3>
            <p aria-live="polite" class="text-sm">
              {rows.length
                ? `Миниатюр: ${packed.miniCount} → листов: ${packed.pageCount} (${settings.pageSize === 'a4' ? 'A4' : 'Letter'})`
                : 'Добавьте изображения для печати миниатюр.'}
            </p>
            {#if message}<p role="status" class="text-sm">{message}</p>{/if}
            <p role="status" class="text-sm">
              {busy
                ? 'Создаём PDF. Редактирование временно недоступно.'
                : preparing
                  ? 'Обрабатываем изображения. PDF будет доступен после завершения.'
                  : ''}
            </p>
            {#if draftError}<p role="status" class="text-sm text-danger">
                {draftError}
              </p>{/if}
            <div class="space-y-2">
              <Button
                class="min-h-11 w-full"
                disabled={!canGenerate}
                onclick={() => void download()}>{busy ? 'Подготовка PDF…' : 'Скачать PDF'}</Button
              >
              <Button
                variant="outline"
                class="min-h-11 w-full"
                disabled={!canGenerate}
                onclick={() => void exportZip()}>Экспорт в ZIP</Button
              >
              <Button
                variant="outline"
                class="min-h-11 w-full"
                disabled={!canGenerate}
                onclick={() => void store.refreshPreview()}
                >{preview ? 'Обновить предпросмотр' : 'Предпросмотр PDF'}</Button
              >
            </div>
          </div>
        </aside>
      </div>

      <div class="min-w-0 space-y-6">
        <div class="space-y-2">
          <Button
            variant="outline"
            class="h-auto min-h-28 w-full flex-col whitespace-normal border-dashed p-6"
            onclick={() => files?.click()}
          >
            <span class="text-base">Добавить изображения</span><span
              class="text-sm font-normal text-text-muted"
              >Перетащите файлы сюда или нажмите для выбора. PNG, JPG, WebP.</span
            >
          </Button>
          <div data-testid="naming-hint" class="text-sm leading-relaxed text-text-muted">
            <p>
              В конце имени файла: <code class="font-mono text-text">имя-back</code> — оборот,
              <code class="font-mono text-text">имя-large</code> — размер.
            </p>
            <details class="mt-1">
              <summary
                class="cursor-pointer rounded-sm hover:text-text focus-visible:outline-2 focus-visible:outline-primary"
                >Размеры в имени файла</summary
              >
              <ul class="mt-2 space-y-1">
                {#each HEIGHT_SLOT_ORDER as slot}<li>
                    <code class="font-mono text-text">{slot}</code> — {slotName(slot)}
                  </li>{/each}
              </ul>
            </details>
          </div>
        </div>
        <input
          bind:this={files}
          type="file"
          multiple
          accept={`${ARTWORK_ACCEPT},.zip,application/zip`}
          class="hidden"
          aria-label="Добавить изображения"
          onchange={(event) => {
            store.ingest(Array.from(event.currentTarget.files ?? []));
            event.currentTarget.value = '';
          }}
        />

        <section aria-label="Миниатюры" class="space-y-5">
          <h2 class="sr-only">Миниатюры</h2>
          {#each rows as row, index (row.id)}
            {@const status = packed.entries[index]}
            {@const statusWarning = status && entryStatusWarning(status)}
            {@const rowInputs = inputs.rows[row.id]}
            <article aria-label={`Миниатюра ${index + 1}`} class="border-y border-border py-5">
              <div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 class="break-all text-xl text-text">{row.name || `Миниатюра ${index + 1}`}</h3>
                <div class="flex gap-2">
                  <Button variant="ghost" class="min-h-11" onclick={() => store.duplicate(row.id)}
                    >Дублировать</Button
                  ><Button variant="ghost" class="min-h-11" onclick={() => store.remove(row.id)}
                    >Удалить</Button
                  >
                </div>
              </div>
              <div class="grid gap-3 sm:grid-cols-2">
                <PaperArtworkSlot
                  artwork={row.artwork}
                  calibration={row.calibration}
                  label="Лицевая сторона"
                  hint="Выбрать лицевую сторону"
                  loading={status?.state === 'loading'}
                  onFile={(file) => void store.setImage(row.id, file)}
                />
                <div class="space-y-2">
                  <PaperArtworkSlot
                    artwork={row.backArtwork}
                    calibration={row.calibration}
                    label={row.backImage
                      ? `Оборот: ${row.backImage.name}`
                      : 'Оборот: отражение лицевой стороны'}
                    displayLabel="Оборот"
                    hint="Добавить свой оборот или оставить отражение"
                    loading={status?.state === 'loading' && !!row.backImage}
                    onFile={(file) => void store.setImage(row.id, file, true)}
                  />{#if row.backImage || row.backWarning}<Button
                      variant="ghost"
                      class="min-h-11 w-full"
                      onclick={() => store.clearBack(row.id)}>Убрать оборот</Button
                    >{/if}
                </div>
              </div>
              <div class="mt-4 grid gap-3 rounded-lg bg-muted/50 p-3 sm:grid-cols-2">
                <div class="space-y-2 sm:col-span-2">
                  <div class="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      class="min-h-11"
                      disabled={!row.artwork || status?.state === 'loading'}
                      onclick={(event) => {
                        calibrationOpener = event.currentTarget;
                        store.openCalibration(row.id);
                      }}>Задать рост</Button
                    >{#if row.calibration}<Button
                        variant="ghost"
                        class="min-h-11"
                        onclick={() => store.resetCalibration(row.id)}>Сбросить рост</Button
                      >{/if}
                  </div>
                  {#if row.calibration}<p class="text-sm font-medium text-text">
                      Рост задан вручную
                    </p>{/if}
                </div>
                <label class="block text-sm"
                  >Высота существа<select
                    class={field}
                    value={row.heightSlot}
                    title={slotGeometryLabel(row.heightSlot)}
                    oninput={(event) =>
                      store.setSize(row.id, event.currentTarget.value as MiniSize)}
                    onchange={(event) =>
                      store.setSize(row.id, event.currentTarget.value as MiniSize)}
                    >{#each HEIGHT_SLOT_ORDER as slot}<option
                        value={slot}
                        title={slotGeometryLabel(slot)}>{slotLabel(slot)}</option
                      >{/each}<option value="custom">{slotLabel('custom')}</option></select
                  ></label
                >
                <label class="block text-sm"
                  >Количество копий<input
                    class={field}
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={rowInputs.count.text}
                    aria-invalid={!rowInputs.count.valid}
                    oninput={(event) => store.setCount(row.id, event.currentTarget.value)}
                    onchange={(event) => store.setCount(row.id, event.currentTarget.value)}
                    onblur={() => store.commitCount(row.id)}
                  /></label
                >
                {#if row.heightSlot === 'custom'}<div class="grid grid-cols-2 gap-2 sm:col-span-2">
                    {#each customDimensionKeys as key, i}{@const dimension =
                        i === 0 ? 'width' : 'height'}<label class="text-sm"
                        >{i === 0 ? 'Основание, мм' : 'Фигурка, мм'}<input
                          class={field}
                          type="number"
                          step="any"
                          required
                          value={rowInputs[key].text}
                          aria-invalid={!rowInputs[key].valid}
                          oninput={(event) =>
                            store.setCustomDimensions(row.id, {
                              [dimension]: event.currentTarget.value,
                            })}
                          onchange={(event) =>
                            store.setCustomDimensions(row.id, {
                              [dimension]: event.currentTarget.value,
                            })}
                          onblur={() => store.commitCustomDimension(row.id, dimension)}
                        /></label
                      >{/each}
                  </div>{/if}
              </div>
              <p class="mt-3 text-xs leading-relaxed text-text-muted">
                {row.backImage
                  ? 'В PDF попадёт отдельное изображение оборота.'
                  : 'Без отдельного файла лицевая сторона будет отражена автоматически.'}
              </p>
              {#if statusWarning}<p
                  role="status"
                  class={`mt-3 border-l-2 pl-3 text-sm ${status.state === 'oversized' ? 'border-danger text-danger' : 'border-warning text-warning'}`}
                >
                  {statusWarning}
                </p>{/if}
              {#each [status?.state === 'failed' && row.frontError, row.normalizationWarning, row.backWarning].filter(Boolean) as warning}<p
                  role="status"
                  class="mt-3 border-l-2 border-warning pl-3 text-sm text-warning"
                >
                  {warning}
                </p>{/each}
            </article>
          {/each}
        </section>
      </div>
    </div>
  </fieldset>
  <aside
    class="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-6 text-sm text-text-muted"
  >
    <div class="space-y-2">
      <p>
        <b>Изображения обрабатываются в браузере</b> и не отправляются на сервер. Сохраняются только настройки
        печати.
      </p>
      <p>
        <b>Печатайте с подгонкой под страницу.</b> Контрольная линейка на листе должна быть ровно 100
        мм.
      </p>
      <p>
        <b>Вырежьте развёртку</b> по внешним меткам, согните пополам между изображениями, отогните оба
        язычка наружу и приклейте их к полоске основания.
      </p>
    </div>
    <div class="space-y-2">
      <p>
        Высота задаёт размер фигурки на бумаге. Очень широкие изображения уменьшаются целиком.
        Основание зависит от категории размера; у самых крупных фигурок оно более плоское, чтобы
        развёртка помещалась на лист.
      </p>
      <p>
        Обрезка убирает прозрачные или одноцветные поля. Она может затронуть детали, близкие к цвету
        фона: отключите её, чтобы печатать оригинал.
      </p>
      <p>
        Для своего оборота загрузите вид существа сзади. Без отдельного изображения оборот отражает
        лицевую сторону.
      </p>
    </div>
  </aside>
  {#if preview && previewUrl}<section aria-label="Предпросмотр PDF" class="space-y-2">
      {#if previewStale}<p role="status" class="text-sm text-warning">
          Настройки или изображения изменились. Обновите предпросмотр.
        </p>{/if}<iframe
        title="Предпросмотр PDF"
        src={previewUrl}
        class="h-[65vh] w-full rounded-lg border border-border"
      ></iframe><a href={previewUrl} target="_blank" rel="noreferrer" class="text-primary underline"
        >Открыть PDF в новой вкладке</a
      >
    </section>{/if}
  {#if dragging}<div
      class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center border-4 border-primary bg-surface/90 text-2xl text-primary"
    >
      Отпустите файлы, чтобы добавить миниатюры
    </div>{/if}
  {#if calibration}<PaperHeightCalibrationDialog
      session={calibration}
      onSetLine={store.setCalibrationLine}
      onMoveLine={store.moveCalibrationLine}
      onCancel={store.cancelCalibration}
      onApply={store.applyCalibration}
      returnFocus={calibrationOpener}
    />{/if}
</div>
