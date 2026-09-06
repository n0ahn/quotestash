<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabase';
  import RoomCard from '$lib/components/RoomCard.svelte';
  import RoomModal from '$lib/components/RoomModal.svelte';
  import { Plus, Search, X } from 'lucide-svelte';
  import type { RoomWithOwnership } from '$lib/database.types';

  type RoomListItem = RoomWithOwnership & { member_count: number };

  let rooms = $state<RoomListItem[]>([]);
  let loading = $state(true);
  let modalOpen = $state(false);
  let searchQuery = $state('');

  const filteredRooms = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter(
      (r) => r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)
    );
  });

  async function loadRooms() {
    loading = true;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      goto('/auth/login');
      return;
    }

    const { data, error } = await supabase
      .from('room_members')
      .select('room_id, rooms(id, name, code, owner_id)')
      .eq('user_id', user.id);

    if (error) {
      console.error(error);
      loading = false;
      return;
    }

    const roomIds = (data ?? [])
      .map((r) => r.rooms?.id)
      .filter((id): id is string => !!id);

    let counts: Record<string, number> = {};
    if (roomIds.length > 0) {
      const { data: memberRows } = await supabase
        .from('room_members')
        .select('room_id')
        .in('room_id', roomIds);

      for (const row of memberRows ?? []) {
        counts[row.room_id] = (counts[row.room_id] ?? 0) + 1;
      }
    }

    rooms = (data ?? [])
      .filter((r) => r.rooms)
      .map((r) => ({
        ...r.rooms!,
        isOwner: r.rooms!.owner_id === user.id,
        member_count: counts[r.rooms!.id] ?? 0
      }));

    loading = false;

    if (rooms.length === 0) {
      modalOpen = true;
    }
  }

  onMount(loadRooms);
</script>

<svelte:head>
  <title>Your Stashes · QuoteStash</title>
</svelte:head>

<div class="min-h-screen px-5 py-16 sm:py-20">
  <div class="mx-auto w-full max-w-3xl">
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-2xl font-bold text-surface-900 dark:text-surface-50">Your stashes</h1>
        <p class="text-[13px] text-surface-500 dark:text-surface-400 mt-1">Pick a stash to view its quotes</p>
      </div>

      <button
        onclick={() => (modalOpen = true)}
        class="flex items-center gap-1.5 h-10 px-4 rounded-2xl bg-brand-500 hover:bg-brand-600 text-white text-[13px] font-semibold shadow-sm shadow-brand-500/25 transition-colors"
      >
        <Plus size={16} strokeWidth={2.5} />
        New room
      </button>
    </div>

    {#if !loading && rooms.length > 0}
      <div class="relative mb-6">
        <Search size={16} class="absolute left-4 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none" />
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search your stashes…"
          class="w-full h-11 pl-11 pr-10 rounded-2xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 text-[13.5px] text-surface-900 dark:text-surface-100 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 transition-all"
        />
        {#if searchQuery}
          <button
            onclick={() => (searchQuery = '')}
            aria-label="Clear search"
            class="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 rounded-full text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
          >
            <X size={13} />
          </button>
        {/if}
      </div>
    {/if}

    {#if loading}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {#each Array(4) as _}
          <div class="h-32 rounded-3xl bg-surface-100 dark:bg-surface-900 animate-pulse"></div>
        {/each}
      </div>
    {:else if rooms.length > 0}
      {#if filteredRooms.length > 0}
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {#each filteredRooms as room (room.id)}
            <RoomCard {room} />
          {/each}
        </div>
      {:else}
        <div class="flex flex-col items-center justify-center py-16 text-center">
          <p class="text-[13px] text-surface-400 dark:text-surface-500">
            No stashes match "{searchQuery}"
          </p>
        </div>
      {/if}
    {/if}
  </div>
</div>

<RoomModal bind:open={modalOpen} onCreated={loadRooms} />