<script lang="ts">
  import Tabs from '@/components/ui/tabs.svelte';
  import TabsContent from '@/components/ui/TabsContent.svelte';
  import TabsList from '@/components/ui/TabsList.svelte';
  import TabsTrigger from '@/components/ui/TabsTrigger.svelte';

  let value = $state('spring');
</script>

<Tabs {value} onValueChange={(next) => (value = String(next))}>
  <TabsList>
    <TabsTrigger value="spring">Spring</TabsTrigger>
    <TabsTrigger value="summer">Summer</TabsTrigger>
    <TabsTrigger value="winter">Winter</TabsTrigger>
  </TabsList>
  <TabsContent value="spring">Spring panel</TabsContent>
  <TabsContent value="summer">Summer panel</TabsContent>
  <TabsContent value="winter">Winter panel</TabsContent>
</Tabs>
