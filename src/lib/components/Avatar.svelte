<script lang="ts">
  let {
    name,
    avatarUrl = null,
    size = 32,
    ring = false,
    class: className = ''
  }: {
    name: string;
    avatarUrl?: string | null;
    size?: number;
    ring?: boolean;
    class?: string;
  } = $props();

  function colorFromString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 60%)`;
  }

  let broken = $state(false);

  // svelte-ignore state_referenced_locally
  $effect(() => {
    avatarUrl;
    broken = false;
  });

  const initial = $derived(name ? name.charAt(0).toUpperCase() : '·');
  const showImage = $derived(!!avatarUrl && !broken);
  const ringClass = $derived(ring ? 'ring-2 ring-white/70 dark:ring-surface-900/70' : '');
</script>

{#if showImage}
  <img
    src={avatarUrl}
    alt={name}
    onerror={() => (broken = true)}
    class="shrink-0 rounded-full object-cover shadow-[0_1px_0_0_rgba(255,255,255,0.3)_inset] {ringClass} {className}"
    style="width: {size}px; height: {size}px;"
  />
{:else}
  <div
    class="shrink-0 flex items-center justify-center rounded-full text-white font-bold shadow-[0_1px_0_0_rgba(255,255,255,0.3)_inset] {ringClass} {className}"
    style="width: {size}px; height: {size}px; font-size: {Math.max(9, size * 0.4)}px; background-color: {colorFromString(name || '?')};"
  >
    {initial}
  </div>
{/if}
