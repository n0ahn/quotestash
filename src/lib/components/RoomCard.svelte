<script lang="ts">
  import { Crown, ArrowRight } from 'lucide-svelte';
  import type { RoomWithOwnership } from '$lib/database.types';

  let { room }: { room: RoomWithOwnership & { member_count: number } } = $props();

  // Deterministische kleur op basis van room.id — altijd hetzelfde resultaat
  function colorFromId(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 60%)`;
  }

  // svelte-ignore state_referenced_locally
  const accentColor = colorFromId(room.id);
</script>

<a
  href="/rooms/{room.id}"
  class="group relative flex flex-col justify-between h-32 p-5 rounded-3xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 hover:border-brand-500/40 hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)] dark:hover:shadow-none transition-all overflow-hidden"
>
  <!-- Accent bar -->
  <div class="absolute top-0 left-0 right-0 h-1" style="background-color: {accentColor};"></div>

  <div class="flex items-start justify-between">
    <div class="flex items-center gap-2.5 pr-2">
      <div
        class="w-8 h-8 rounded-xl flex items-center justify-center text-white text-[13px] font-bold shrink-0"
        style="background-color: {accentColor};"
      >
        {room.name.charAt(0).toUpperCase()}
      </div>
      <h3 class="text-[15px] font-bold text-surface-900 dark:text-surface-50 line-clamp-1">
        {room.name}
      </h3>
    </div>
    {#if room.isOwner}
      <Crown size={16} class="text-amber-400 shrink-0 mt-0.5" fill="currentColor" />
    {/if}
  </div>

  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <span class="text-[11px] font-mono font-semibold tracking-widest text-surface-400 dark:text-surface-500 bg-surface-100 dark:bg-surface-800 px-2 py-1 rounded-lg">
        {room.code}
      </span>
      <span class="text-[12px] text-surface-400 dark:text-surface-500">
        {room.member_count} {room.member_count === 1 ? 'member' : 'members'}
      </span>
    </div>
    <ArrowRight size={16} class="text-surface-300 dark:text-surface-600 group-hover:text-brand-500 group-hover:translate-x-0.5 transition-all" />
  </div>
</a>