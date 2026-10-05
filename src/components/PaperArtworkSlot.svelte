<script lang="ts">
  import Button from '@/components/ui/button.svelte';
  import { ARTWORK_ACCEPT, artworkMimeType } from '@/lib/paper-minis/artwork-formats';
  import { isSupportedArtwork } from '@/lib/paper-minis/artwork';
  import type { HeightCalibration, PreparedArtwork } from '@/lib/paper-minis/types';

  const lines = ['head', 'feet'] as const;

  const {
    artwork = null,
    calibration = undefined,
    label,
    displayLabel = undefined,
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
  } = $props();

  let input: HTMLInputElement | undefined = $state();

  let url = $state<string>();

  $effect(() => {
    if (!artwork) {
      url = undefined;

      return;
    }

    const next = URL.createObjectURL(
      new Blob([artwork.bytes.slice()], { type: artworkMimeType(artwork.format) }),
    );

    url = next;

    return () => URL.revokeObjectURL(next);
  });
</script>

<div class="overflow-hidden rounded-lg border border-border bg-surface-elevated">
  <div class="border-b border-border px-3 py-2">
    <p class="truncate text-sm font-medium text-text">{displayLabel ?? label}</p>
  </div>
  <Button
    variant="ghost"
    class="h-40 w-full rounded-none whitespace-normal p-3 focus-visible:ring-inset"
    aria-label={label}
    onclick={() => input?.click()}
    ondragover={(event) => {
      event.preventDefault();
      event.stopPropagation();
    }}
    ondrop={(event) => {
      event.preventDefault();
      event.stopPropagation();
      const dropped = Array.from(event.dataTransfer?.files ?? []);
      const file = dropped.find(isSupportedArtwork) ?? dropped[0];

      if (file) onFile(file);
    }}
  >
    {#if url && artwork}
      <span class="relative block h-full w-full [container-type:size]">
        <span
          class="absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2"
          style={`width: min(100cqw, ${(100 * artwork.width) / artwork.height}cqh); aspect-ratio: ${artwork.width} / ${artwork.height}`}
        >
          <img src={url} alt={label} class="block h-full w-full" />
          {#if calibration}
            <span class="pointer-events-none absolute inset-0">
              {#each lines as key (key)}
                <span
                  data-testid={`calibration-${key}`}
                  class="absolute left-0 right-0 border-t-2 border-primary bg-surface/70 text-[10px] font-bold text-primary shadow-sm"
                  style={`top: ${calibration[key] * 100}%`}
                ></span>
              {/each}
            </span>
          {/if}
        </span>
      </span>
    {:else}
      <span class="max-w-44 text-sm font-normal leading-relaxed text-text-muted">
        {loading ? 'Загрузка…' : hint}
      </span>
    {/if}
  </Button>
  <input
    bind:this={input}
    type="file"
    accept={ARTWORK_ACCEPT}
    class="hidden"
    aria-label={label}
    onchange={(event) => {
      const file = event.currentTarget.files?.[0];

      if (file) onFile(file);
      event.currentTarget.value = '';
    }}
  />
</div>
