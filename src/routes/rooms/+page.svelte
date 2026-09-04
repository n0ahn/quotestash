<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabase';
  import RoomCard from '$lib/components/RoomCard.svelte';
  import RoomModal from '$lib/components/RoomModal.svelte';
  import { Plus } from 'lucide-svelte';
  import type { RoomWithOwnership } from '$lib/database.types';

  type RoomListItem = RoomWithOwnership & { member_count: number };

  let rooms = $state<RoomListItem[]>([]);
  let loading = $state(true);
  let modalOpen = $state(false);

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

    {#if loading}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {#each Array(4) as _}
          <div class="h-32 rounded-3xl bg-surface-100 dark:bg-surface-900 animate-pulse"></div>
        {/each}
      </div>
    {:else if rooms.length > 0}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {#each rooms as room (room.id)}
          <RoomCard {room} />
        {/each}
      </div>
    {/if}
  </div>
</div>

<RoomModal bind:open={modalOpen} onCreated={loadRooms} />