<script lang="ts">
  import Button from '@/components/ui/button.svelte';
  import Dialog from '@/components/ui/dialog.svelte';
  import DialogContent from '@/components/ui/DialogContent.svelte';
  import DialogTitle from '@/components/ui/DialogTitle.svelte';

  let open = $state(false);
</script>

<Button data-testid="dialog-opener" onclick={() => (open = true)}>Open dialog</Button>
<Dialog {open} onOpenChange={(next) => (open = next)}>
  <DialogContent>
    <DialogTitle>Calibration</DialogTitle>
    <Button data-testid="first-action">First</Button>
    <Button data-testid="last-action">Last</Button>
  </DialogContent>
</Dialog>
