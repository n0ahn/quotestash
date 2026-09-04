<script lang="ts">
  import { supabase } from '$lib/supabase';
  import { goto } from '$app/navigation';
  import { X } from 'lucide-svelte';
  import type { Database } from '$lib/database.types';

  type Room = Database['public']['Tables']['rooms']['Row'];

  let { open = $bindable(false), onCreated }: { open: boolean; onCreated: () => void } = $props();

  let tab = $state<'create' | 'join'>('create');
  let roomName = $state('');
  let joinCode = $state('');
  let loading = $state(false);
  let errorMsg = $state('');

  function generateCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  async function handleCreate(e: SubmitEvent) {
    e.preventDefault();
    if (!roomName.trim()) return;

    loading = true;
    errorMsg = '';

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { loading = false; return; }

    const code = generateCode();

    const { data: room, error } = await supabase
      .from('rooms')
      .insert({ name: roomName.trim(), code, owner_id: user.id })
      .select()
      .single<Room>();

    if (error || !room) {
      errorMsg = error?.message ?? 'Something went wrong.';
      loading = false;
      return;
    }

    await supabase.from('room_members').insert({ room_id: room.id, user_id: user.id });

    loading = false;
    close();
    onCreated();
    goto(`/rooms/${room.id}`);
  }

  async function handleJoin(e: SubmitEvent) {
    e.preventDefault();
    if (!joinCode.trim()) return;

    loading = true;
    errorMsg = '';

    const code = joinCode.trim().toUpperCase();

    const { error: rpcError } = await supabase.rpc('join_room', { room_code: code } as never);

    if (rpcError) {
      loading = false;
      errorMsg = rpcError.message.includes('duplicate') ? "You're already in this room." : rpcError.message;
      return;
    }

    const { data: room, error: fetchError } = await supabase
      .from('rooms')
      .select('id')
      .eq('code', code)
      .single<Pick<Room, 'id'>>();

    loading = false;

    if (fetchError || !room) {
      errorMsg = 'Joined, but could not open the room. Try refreshing.';
      return;
    }

    close();
    onCreated();
    goto(`/rooms/${room.id}`);
  }

  function close() {
    open = false;
    roomName = '';
    joinCode = '';
    errorMsg = '';
    tab = 'create';
  }
</script>

{#if open}
  <div class="fixed inset-0 z-100 flex items-center justify-center px-5">
    <button class="absolute inset-0 bg-black/40 backdrop-blur-sm" onclick={close} aria-label="Close"></button>

    <div class="relative w-full max-w-sm bg-white dark:bg-surface-900 rounded-3xl shadow-2xl p-6">
      <button
        onclick={close}
        class="absolute top-4 right-4 text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 transition-colors"
        aria-label="Close"
      >
        <X size={18} />
      </button>

      <h2 class="text-lg font-bold text-surface-900 dark:text-surface-50 mb-1">
        {tab === 'create' ? 'Create a room' : 'Join a room'}
      </h2>
      <p class="text-[13px] text-surface-500 dark:text-surface-400 mb-5">
        {tab === 'create' ? 'Start a new quote stash for your group' : 'Enter the 6-character code'}
      </p>

      <div class="flex items-center gap-1 bg-surface-100 dark:bg-surface-800 rounded-2xl p-1 mb-5">
        <button
          onclick={() => (tab = 'create')}
          class="flex-1 h-9 rounded-xl text-[13px] font-semibold transition-colors {tab === 'create' ? 'bg-white dark:bg-surface-700 text-surface-900 dark:text-white shadow-sm' : 'text-surface-500 dark:text-surface-400'}"
        >
          Create
        </button>
        <button
          onclick={() => (tab = 'join')}
          class="flex-1 h-9 rounded-xl text-[13px] font-semibold transition-colors {tab === 'join' ? 'bg-white dark:bg-surface-700 text-surface-900 dark:text-white shadow-sm' : 'text-surface-500 dark:text-surface-400'}"
        >
          Join
        </button>
      </div>

      {#if tab === 'create'}
        <form onsubmit={handleCreate} class="space-y-4">
          <div>
            <label for="roomName" class="block text-[12px] font-semibold text-surface-600 dark:text-surface-400 mb-1.5">Room name</label>
            <input
              id="roomName"
              type="text"
              required
              bind:value={roomName}
              placeholder="Team Legends"
              class="w-full h-11 px-4 rounded-2xl text-[14px] bg-surface-100 dark:bg-surface-800 border border-transparent text-surface-900 dark:text-surface-100 placeholder-surface-400 dark:placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
            />
          </div>

          {#if errorMsg}
            <p class="text-[13px] text-red-500 dark:text-red-400">{errorMsg}</p>
          {/if}

          <button
            type="submit"
            disabled={loading || !roomName.trim()}
            class="w-full h-11 rounded-2xl text-[14px] font-semibold text-white bg-brand-500 hover:bg-brand-600 shadow-sm shadow-brand-500/25 disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            {loading ? 'Creating…' : 'Create room'}
          </button>
        </form>
      {:else}
        <form onsubmit={handleJoin} class="space-y-4">
          <div>
            <label for="joinCode" class="block text-[12px] font-semibold text-surface-600 dark:text-surface-400 mb-1.5">Room code</label>
            <input
              id="joinCode"
              type="text"
              required
              maxlength="6"
              bind:value={joinCode}
              placeholder="A1B2C3"
              class="w-full h-11 px-4 rounded-2xl text-[14px] font-mono tracking-widest uppercase bg-surface-100 dark:bg-surface-800 border border-transparent text-surface-900 dark:text-surface-100 placeholder-surface-400 dark:placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
            />
          </div>

          {#if errorMsg}
            <p class="text-[13px] text-red-500 dark:text-red-400">{errorMsg}</p>
          {/if}

          <button
            type="submit"
            disabled={loading || !joinCode.trim()}
            class="w-full h-11 rounded-2xl text-[14px] font-semibold text-white bg-brand-500 hover:bg-brand-600 shadow-sm shadow-brand-500/25 disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            {loading ? 'Joining…' : 'Join room'}
          </button>
        </form>
      {/if}
    </div>
  </div>
{/if}