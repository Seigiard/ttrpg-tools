<script lang="ts">
  import { RefreshCw } from '@/components/icons';
  import Button from './button.svelte';
  import Card from './card.svelte';
  import CardContent from './CardContent.svelte';
  import CardHeader from './CardHeader.svelte';
  import Dialog from './dialog.svelte';
  import DialogContent from './DialogContent.svelte';
  import DialogTitle from './DialogTitle.svelte';
  import Skeleton from './skeleton.svelte';
  import Tabs from './tabs.svelte';
  import TabsContent from './TabsContent.svelte';
  import TabsList from './TabsList.svelte';
  import TabsTrigger from './TabsTrigger.svelte';

  let {
    mode,
    loading = false,
    class: className = undefined,
    text = 'x',
  }: {
    mode: 'button' | 'card' | 'dialog' | 'icon' | 'skeleton' | 'tabs';
    loading?: boolean;
    class?: string;
    text?: string;
  } = $props();

  let dialogOpen = $state(false);

  let tab = $state('spring');
</script>

{#if mode === 'button'}
  <Button class="min-h-11">Roll</Button>
{:else if mode === 'card'}
  <Card data-testid="card">
    <CardHeader data-testid="card-header">Header</CardHeader>
    <CardContent data-testid="card-content">Content</CardContent>
  </Card>
{:else if mode === 'dialog'}
  <Button data-testid="dialog-opener" onclick={() => (dialogOpen = true)}>Open dialog</Button>
  <Dialog open={dialogOpen} onOpenChange={(next) => (dialogOpen = next)}>
    <DialogContent>
      <DialogTitle>Calibration</DialogTitle>
      <Button data-testid="first-action">First</Button>
      <Button data-testid="last-action">Last</Button>
    </DialogContent>
  </Dialog>
{:else if mode === 'icon'}
  <RefreshCw aria-label="Refresh" />
{:else if mode === 'skeleton'}
  <Skeleton {loading} class={className}>{text}</Skeleton>
{:else if mode === 'tabs'}
  <Tabs value={tab} onValueChange={(next) => (tab = String(next))}>
    <TabsList>
      <TabsTrigger value="spring">Spring</TabsTrigger>
      <TabsTrigger value="summer">Summer</TabsTrigger>
      <TabsTrigger value="winter">Winter</TabsTrigger>
    </TabsList>
    <TabsContent value="spring">Spring panel</TabsContent>
    <TabsContent value="summer">Summer panel</TabsContent>
    <TabsContent value="winter">Winter panel</TabsContent>
  </Tabs>
{/if}
