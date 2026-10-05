<script lang="ts">
  import Button from '@/components/ui/button.svelte';
  import Dialog from '@/components/ui/dialog.svelte';
  import DialogContent from '@/components/ui/DialogContent.svelte';
  import DialogTitle from '@/components/ui/DialogTitle.svelte';
  import { artworkMimeType } from '@/lib/paper-minis/artwork-formats';
  import type { CalibrationLine } from '@/lib/paper-minis/calibration-session';
  import type { PreparedArtwork } from '@/lib/paper-minis/types';
  import type { CalibrationSession } from '@/stores/paper-minis-store';

  const lines = ['head', 'feet'] as const;

  const {
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
    returnFocus?: HTMLElement | null;
  } = $props();

  let artworkElement: HTMLSpanElement | undefined = $state();

  let dragging: CalibrationLine | null = $state(null);

  let frontUrl = $state<string>();

  let backUrl = $state<string>();

  let artwork = $derived(session.artwork);

  let backArtwork = $derived(session.backArtwork);

  function makeUrl(preparedArtwork?: PreparedArtwork | null) {
    if (!preparedArtwork) return undefined;

    return URL.createObjectURL(
      new Blob([preparedArtwork.bytes.slice()], {
        type: artworkMimeType(preparedArtwork.format),
      }),
    );
  }

  function setLineFromClientY(which: CalibrationLine, clientY: number) {
    const box = artworkElement?.getBoundingClientRect();

    if (!box || box.height <= 0) return;
    onSetLine(which, (clientY - box.top) / box.height);
  }

  $effect(() => {
    const next = makeUrl(artwork);
    frontUrl = next;

    return () => {
      if (next) URL.revokeObjectURL(next);
    };
  });

  $effect(() => {
    const next = makeUrl(backArtwork);
    backUrl = next;

    return () => {
      if (next) URL.revokeObjectURL(next);
    };
  });

  let totalAspect = $derived(
    session.artwork.width / session.artwork.height +
      (session.backArtwork && backUrl ? session.backArtwork.width / session.backArtwork.height : 0),
  );
</script>

<Dialog
  open={true}
  onOpenChange={(open) => {
    if (!open) onCancel();
  }}
>
  <DialogContent finalFocus={returnFocus}>
    <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <DialogTitle class="text-2xl text-text">Задать рост</DialogTitle>
        <p class="text-sm text-text-muted">
          {session.rowLabel}: перетащите линии головы и стоп или используйте ↑/↓ — 1 пиксель, с
          Shift — 10.
        </p>
      </div>
      <p class="text-sm font-medium text-text" aria-live="polite">
        Рост {Math.round(session.slotHeightMm)} мм · напечатается {Math.round(
          session.printedHeightMm,
        )} мм
      </p>
    </div>
    {#if session.warning}
      <p
        role="status"
        class={`mt-3 border-l-2 pl-3 text-sm ${session.warningTone === 'danger' ? 'border-danger text-danger' : 'border-warning text-warning'}`}
      >
        {session.warning}
      </p>
    {/if}
    <div
      role="presentation"
      data-testid="height-calibration-artwork"
      class="relative mt-4 h-[min(65vh,640px)] touch-none rounded-lg border border-border bg-surface-elevated p-6"
      onpointermove={(event) => {
        if (dragging) setLineFromClientY(dragging, event.clientY);
      }}
      onpointerup={(event) => {
        dragging = null;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }}
      onpointercancel={() => (dragging = null)}
      onlostpointercapture={() => (dragging = null)}
    >
      {#if frontUrl}
        <span class="relative block h-full w-full [container-type:size]">
          <span
            bind:this={artworkElement}
            data-testid="calibration-artworks"
            class="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2"
            style={`width: min(100cqw, ${totalAspect * 100}cqh); aspect-ratio: ${totalAspect} / 1`}
          >
            <img src={frontUrl} alt="Лицевая сторона" class="block h-full w-auto" />
            {#if session.backArtwork && backUrl}
              <img src={backUrl} alt="Оборот" class="block h-full w-auto" />
            {/if}
            {#each lines as line (line)}
              <span
                aria-hidden="true"
                class="pointer-events-none absolute inset-x-0 border-t-2 border-primary"
                style={`top: ${session.lines[line] * 100}%`}
              ></span>
              <button
                type="button"
                role="slider"
                aria-label={line === 'head' ? 'Голова' : 'Ступни'}
                aria-orientation="vertical"
                aria-valuemin={session.ranges[line].min * 100}
                aria-valuemax={session.ranges[line].max * 100}
                aria-valuenow={session.lines[line] * 100}
                aria-valuetext={`${Number((session.lines[line] * session.artworkHeight).toFixed(2))} пикселей от верха`}
                class={`absolute left-1/2 h-11 w-1/2 min-w-11 -translate-y-1/2 cursor-row-resize text-left text-xs font-bold text-primary focus-visible:outline-2 focus-visible:outline-primary ${line === 'head' ? '-translate-x-full' : ''}`}
                style={`top: ${session.lines[line] * 100}%`}
                onkeydown={(event) => {
                  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                  event.preventDefault();
                  onMoveLine(line, (event.shiftKey ? 10 : 1) * (event.key === 'ArrowUp' ? -1 : 1));
                }}
                onpointerdown={(event) => {
                  if (event.button !== 0 || event.ctrlKey) return;
                  dragging = line;
                  event.currentTarget.setPointerCapture?.(event.pointerId);
                  setLineFromClientY(line, event.clientY);
                }}
              >
                <span class="relative ml-2 rounded bg-surface/90 px-1">
                  {line === 'head' ? 'Голова' : 'Ступни'}
                </span>
              </button>
            {/each}
          </span>
        </span>
      {/if}
    </div>
    <div class="mt-4 flex justify-end gap-2">
      <Button variant="ghost" class="min-h-11" onclick={onCancel}>Отмена</Button>
      <Button class="min-h-11" onclick={onApply}>Применить</Button>
    </div>
  </DialogContent>
</Dialog>
