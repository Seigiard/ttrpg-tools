<script lang="ts">
  import Skeleton from '@/components/ui/skeleton.svelte';

  let {
    loading,
    class: className = undefined,
    text = 'x',
  }: {
    loading: boolean;
    class?: string;
    text?: string;
  } = $props();
</script>

<Skeleton {loading} class={className}>{text}</Skeleton>
