<script lang="ts">
  import { onMount } from 'svelte';
  import { supabase, getCurrentProfile } from '$lib/supabase';
  import { goto } from '$app/navigation';
  import type { RoomWithOwnership } from '$lib/database.types';

  // ── State ─────────────────────────────────────────────────────────────────
  let profile = $state<any>(null);
  let rooms = $state<RoomWithOwnership[]>([]);
  let loading = $state(true);

  // Create room sheet
  let showCreate = $state(false);
  let newRoomName = $state('');
  let createLoading = $state(false);
  let createError = $state('');

  // Join room sheet
  let showJoin = $state(false);
  let joinCode = $state('');
  let joinLoading = $state(false);
  let joinError = $state('');

  // ── Helpers ───────────────────────────────────────────────────────────────
  async function loadRooms() {
    loading = true;
    const p = (await getCurrentProfile()) as any;
    if (!p) { goto('/auth/login'); return; }
    profile = p;

    // Fetch rooms the user is a member of, join with rooms table
    const { data, error } = await (supabase
      .from('room_members') as any)
      .select('room_id, rooms(*)')
      .eq('user_id', p.id);

    if (error) { loading = false; return; }

    rooms = (data ?? [])
      .map((m: any) => {
        if (!m.rooms) return null;
        return {
          ...m.rooms,
          isOwner: m.rooms.owner_id === p.id
        };
      })
      .filter((r: any): r is RoomWithOwnership => r !== null);

    loading = false;
  }

  async function createRoom() {
    if (!newRoomName.trim() || !profile) return;
    createLoading = true;
    createError = '';

    const { data, error } = await (supabase
      .from('rooms') as any)
      .insert({ name: newRoomName.trim(), owner_id: profile.id, code: '' })
      .select()
      .single();

    createLoading = false;
    if (error) { createError = error.message; return; }
    showCreate = false;
    newRoomName = '';
    goto(`/rooms/${data.id}`);
  }

  async function joinRoom() {
    if (!joinCode.trim()) return;
    joinLoading = true;
    joinError = '';

    const { error } = await (supabase.rpc as any)('join_room', {
      room_code: joinCode.trim().toUpperCase()
    });

    joinLoading = false;
    if (error) { joinError = error.message; return; }
    showJoin = false;
    joinCode = '';
    await loadRooms();
  }

  async function signOut() {
    await supabase.auth.signOut();
    goto('/');
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  onMount(loadRooms);
</script>

<svelte:head>
  <title>Rooms · QuoteStash</title>
</svelte:head>

<div class="min-h-screen w-full bg-surface-50 dark:bg-zinc-950 transition-colors duration-200">

  <!-- Subtle glow -->
  <div aria-hidden="true" class="pointer-events-none fixed inset-0 overflow-hidden">
    <div
      class="absolute left-1/2 top-0 -translate-x-1/2 w-full h-[400px] rounded-full opacity-[0.06] dark:opacity-[0.10] blur-[120px]"
      style="background: radial-gradient(ellipse, var(--color-brand-500) 0%, transparent 70%);"
    ></div>
  </div>

  <!-- Header -->
  <header class="relative z-10 flex items-center justify-end px-6 sm:px-12 pt-6 pb-4 w-full">
    <div class="flex items-center gap-3">
      {#if profile}
        <span class="text-sm sm:text-base text-surface-500 dark:text-surface-400">
          Hi, <span class="font-semibold text-surface-700 dark:text-surface-200">{profile.first_name}</span>
        </span>
      {/if}
      <button
        onclick={signOut}
        class="h-10 px-4 rounded-xl text-sm font-medium text-surface-500 dark:text-surface-400 hover:bg-surface-200/50 dark:hover:bg-surface-800/50 transition-colors"
      >
        Sign out
      </button>
    </div>
  </header>

  <!-- Main -->
  <main class="relative z-10 px-6 sm:px-70 pb-28 w-full">

    <!-- Section header -->
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl sm:text-3xl font-extrabold text-surface-900 dark:text-surface-50">Your rooms</h1>
      <div class="flex items-center gap-2.5">
        <button
          onclick={() => { showJoin = !showJoin; showCreate = false; }}
          class="h-10 sm:h-11 px-4 sm:px-5 rounded-xl text-sm sm:text-base font-semibold text-surface-600 dark:text-surface-300 border border-surface-200 dark:border-surface-800 hover:bg-surface-100 dark:hover:bg-surface-800/50 transition-colors"
        >
          Join
        </button>
        <button
          onclick={() => { showCreate = !showCreate; showJoin = false; }}
          class="h-10 sm:h-11 px-4.5 sm:px-5 rounded-xl text-sm sm:text-base font-semibold text-brand-50 bg-brand-500 hover:bg-brand-600 shadow-md shadow-brand-500/25 transition-colors"
        >
          + New room
        </button>
      </div>
    </div>

    <!-- Create room inline panel -->
    {#if showCreate}
      <div class="mb-6 bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-2xl shadow-lg px-6 py-5 w-full">
        <p class="text-base font-semibold text-surface-800 dark:text-surface-100 mb-3.5">New room</p>
        <form onsubmit={(e) => { e.preventDefault(); createRoom(); }} class="flex gap-2.5">
          <input
            type="text"
            bind:value={newRoomName}
            placeholder="Room name…"
            class="
              flex-1 h-11 sm:h-12 px-4 rounded-xl text-sm sm:text-base
              bg-surface-100 dark:bg-surface-800
              border border-surface-200 dark:border-surface-700
              text-surface-900 dark:text-surface-100
              placeholder-surface-400 dark:placeholder-surface-500
              focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500
              transition-all duration-150
            "
          />
          <button
            type="submit"
            disabled={createLoading || !newRoomName.trim()}
            class="h-11 sm:h-12 px-5 sm:px-6 rounded-xl text-sm sm:text-base font-semibold text-brand-50 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            {createLoading ? '…' : 'Create'}
          </button>
          <button
            type="button"
            onclick={() => { showCreate = false; createError = ''; newRoomName = ''; }}
            class="h-11 w-11 sm:h-12 sm:w-12 flex items-center justify-center rounded-xl text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 text-lg transition-colors"
            aria-label="Cancel"
          >✕</button>
        </form>
        {#if createError}
          <p class="mt-2.5 text-sm text-brand-600 dark:text-brand-400">{createError}</p>
        {/if}
      </div>
    {/if}

    <!-- Join room inline panel -->
    {#if showJoin}
      <div class="mb-6 bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-2xl shadow-lg px-6 py-5 w-full">
        <p class="text-base font-semibold text-surface-800 dark:text-surface-100 mb-3.5">Join with code</p>
        <form onsubmit={(e) => { e.preventDefault(); joinRoom(); }} class="flex gap-2.5">
          <input
            type="text"
            bind:value={joinCode}
            placeholder="ABC123"
            maxlength={6}
            class="
              flex-1 h-11 sm:h-12 px-4 rounded-xl text-sm sm:text-base tracking-widest font-mono uppercase
              bg-surface-100 dark:bg-surface-800
              border border-surface-200 dark:border-surface-700
              text-surface-900 dark:text-surface-100
              placeholder-surface-400 dark:placeholder-surface-500
              focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500
              transition-all duration-150
            "
          />
          <button
            type="submit"
            disabled={joinLoading || joinCode.trim().length < 6}
            class="h-11 sm:h-12 px-5 sm:px-6 rounded-xl text-sm sm:text-base font-semibold text-brand-50 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            {joinLoading ? '…' : 'Join'}
          </button>
          <button
            type="button"
            onclick={() => { showJoin = false; joinError = ''; joinCode = ''; }}
            class="h-11 w-11 sm:h-12 sm:w-12 flex items-center justify-center rounded-xl text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 text-lg transition-colors"
            aria-label="Cancel"
          >✕</button>
        </form>
        {#if joinError}
          <p class="mt-2.5 text-sm text-brand-600 dark:text-brand-400">{joinError}</p>
        {/if}
      </div>
    {/if}

    <!-- Room list -->
    {#if loading}
      <div class="flex flex-col gap-3.5 w-full">
        {#each [1, 2, 3] as _}
          <div class="h-20 rounded-2xl bg-surface-100 dark:bg-surface-800/50 animate-pulse"></div>
        {/each}
      </div>

    {:else if rooms.length === 0}
      <div class="flex flex-col items-center justify-center py-24 text-center w-full">
        <div class="w-16 h-16 rounded-2xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-surface-400">
            <path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"/>
          </svg>
        </div>
        <p class="text-lg font-bold text-surface-700 dark:text-surface-200 mb-1">No rooms yet</p>
        <p class="text-sm text-surface-400 dark:text-surface-500">Create a new room or join one with a code from your group.</p>
      </div>

    {:else}
      <div class="flex flex-col gap-3.5 w-full">
        {#each rooms as room (room.id)}
          <a
            href="/rooms/{room.id}"
            class="
              group flex items-center gap-4.5
              px-5 py-4.5 rounded-2xl
              bg-surface-50 dark:bg-surface-900
              border border-surface-200 dark:border-surface-800
              shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none
              hover:border-brand-500/40 dark:hover:border-brand-500/40
              hover:shadow-[0_4px_16px_rgba(91,80,240,0.1)]
              transition-all duration-150 w-full
            "
          >
            <!-- Room avatar / initial -->
            <div
              class="shrink-0 w-12 h-12 rounded-xl bg-brand-500/10 dark:bg-brand-500/15 flex items-center justify-center text-brand-500 text-lg font-bold"
            >
              {room.name[0]?.toUpperCase()}
            </div>

            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-base sm:text-lg font-bold text-surface-900 dark:text-surface-100 truncate">{room.name}</span>
                {#if room.isOwner}
                  <span title="You own this room" class="text-base" aria-label="Owner">👑</span>
                {/if}
              </div>
              <p class="text-xs sm:text-sm text-surface-400 dark:text-surface-500 font-mono tracking-wider mt-0.5">{room.code}</p>
            </div>

            <!-- Chevron -->
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-surface-300 dark:text-surface-600 group-hover:text-brand-400 transition-colors shrink-0">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/>
            </svg>
          </a>
        {/each}
      </div>
    {/if}

  </main>
</div>