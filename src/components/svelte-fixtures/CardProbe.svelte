<script lang="ts">
  import Card from '@/components/ui/card.svelte';
  import CardContent from '@/components/ui/CardContent.svelte';
  import CardHeader from '@/components/ui/CardHeader.svelte';
</script>

<Card data-testid="card">
  <CardHeader data-testid="card-header">Header</CardHeader>
  <CardContent data-testid="card-content">Content</CardContent>
</Card>
