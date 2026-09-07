<script lang="ts">
  import { supabase, uploadRoomPhoto } from '$lib/supabase';
  import { goto } from '$app/navigation';
  import { X, Camera, Loader2 } from 'lucide-svelte';
  import type { Database } from '$lib/database.types';

  type Room = Database['public']['Tables']['rooms']['Row'];

  let { open = $bindable(false), onCreated }: { open: boolean; onCreated: () => void } = $props();

  let tab = $state<'create' | 'join'>('create');
  let roomName = $state('');
  let joinCode = $state('');
  let loading = $state(false);
  let errorMsg = $state('');

  let photoFile = $state<File | null>(null);
  let photoPreviewUrl = $state<string | null>(null);
  let photoInput = $state<HTMLInputElement>();

  const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

  function handlePhotoChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    errorMsg = '';

    if (!file.type.startsWith('image/')) {
      errorMsg = 'Please choose an image file.';
      input.value = '';
      return;
    }

    if (file.size > MAX_PHOTO_BYTES) {
      errorMsg = 'Image must be smaller than 5MB.';
      input.value = '';
      return;
    }

    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    photoFile = file;
    photoPreviewUrl = URL.createObjectURL(file);
  }

  function clearPhoto() {
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    photoFile = null;
    photoPreviewUrl = null;
    if (photoInput) photoInput.value = '';
  }

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

    if (photoFile) {
      await uploadRoomPhoto(room.id, photoFile);
    }

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
    clearPhoto();
  }
</script>

{#if open}
  <div class="fixed inset-0 z-100 flex items-center justify-center px-5">
    <button
      class="absolute inset-0 bg-black/30 backdrop-blur-md animate-fade-in"
      onclick={close}
      aria-label="Close"
    ></button>

    <div class="glass-panel relative w-full max-w-sm rounded-3xl p-6 animate-modal-in">
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

      <div class="flex items-center gap-1 bg-black/[0.03] dark:bg-white/[0.04] backdrop-blur-sm rounded-2xl p-1 mb-5 border border-black/[0.04] dark:border-white/[0.06]">
        <button
          onclick={() => (tab = 'create')}
          class="flex-1 h-9 rounded-xl text-[13px] font-semibold transition-all {tab === 'create' ? 'bg-white/80 dark:bg-white/10 text-surface-900 dark:text-white shadow-sm backdrop-blur-sm' : 'text-surface-500 dark:text-surface-400'}"
        >
          Create
        </button>
        <button
          onclick={() => (tab = 'join')}
          class="flex-1 h-9 rounded-xl text-[13px] font-semibold transition-all {tab === 'join' ? 'bg-white/80 dark:bg-white/10 text-surface-900 dark:text-white shadow-sm backdrop-blur-sm' : 'text-surface-500 dark:text-surface-400'}"
        >
          Join
        </button>
      </div>

      {#if tab === 'create'}
        <form onsubmit={handleCreate} class="space-y-4">
          <div class="flex justify-center">
            <div class="relative shrink-0 group/photo">
              {#if photoPreviewUrl}
                <img src={photoPreviewUrl} alt="Room photo preview" class="w-16 h-16 rounded-2xl object-cover shadow-sm" />
              {:else}
                <div class="w-16 h-16 rounded-2xl flex items-center justify-center bg-black/[0.03] dark:bg-white/[0.05] backdrop-blur-sm border border-black/[0.05] dark:border-white/[0.08] text-surface-400 dark:text-surface-500">
                  <Camera size={20} />
                </div>
              {/if}

              <button
                type="button"
                onclick={() => photoInput?.click()}
                aria-label="Add group photo"
                class="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/0 group-hover/photo:bg-black/40 text-white opacity-0 group-hover/photo:opacity-100 transition-all"
              >
                <Camera size={16} />
              </button>

              {#if photoPreviewUrl}
                <button
                  type="button"
                  onclick={clearPhoto}
                  aria-label="Remove photo"
                  class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-surface-900 dark:bg-white text-white dark:text-surface-900 flex items-center justify-center shadow-sm"
                >
                  <X size={11} />
                </button>
              {/if}

              <input
                bind:this={photoInput}
                type="file"
                accept="image/*"
                class="hidden"
                onchange={handlePhotoChange}
              />
            </div>
          </div>
          <p class="text-center text-[11.5px] text-surface-400 dark:text-surface-500 -mt-2">
            {photoPreviewUrl ? 'Group photo added' : 'Add a group photo (optional)'}
          </p>

          <div>
            <label for="roomName" class="block text-[12px] font-semibold text-surface-600 dark:text-surface-400 mb-1.5">Room name</label>
            <input
              id="roomName"
              type="text"
              required
              bind:value={roomName}
              placeholder="Team Legends"
              class="w-full h-11 px-4 rounded-2xl text-[14px] bg-black/[0.03] dark:bg-white/[0.05] backdrop-blur-sm border border-black/[0.05] dark:border-white/[0.08] text-surface-900 dark:text-surface-100 placeholder-surface-400 dark:placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/50 focus:bg-white/60 dark:focus:bg-white/[0.08] transition-all"
            />
          </div>

          {#if errorMsg}
            <p class="text-[13px] text-red-500 dark:text-red-400">{errorMsg}</p>
          {/if}

          <button
            type="submit"
            disabled={loading || !roomName.trim()}
            class="w-full h-11 rounded-2xl text-[14px] font-semibold text-white bg-brand-500 hover:bg-brand-600 shadow-[0_1px_0_0_rgba(255,255,255,0.25)_inset,0_8px_20px_-6px_var(--color-brand-500)] disabled:opacity-40 disabled:pointer-events-none transition-all"
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
              class="w-full h-11 px-4 rounded-2xl text-[14px] font-mono tracking-widest uppercase bg-black/[0.03] dark:bg-white/[0.05] backdrop-blur-sm border border-black/[0.05] dark:border-white/[0.08] text-surface-900 dark:text-surface-100 placeholder-surface-400 dark:placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/50 focus:bg-white/60 dark:focus:bg-white/[0.08] transition-all"
            />
          </div>

          {#if errorMsg}
            <p class="text-[13px] text-red-500 dark:text-red-400">{errorMsg}</p>
          {/if}

          <button
            type="submit"
            disabled={loading || !joinCode.trim()}
            class="w-full h-11 rounded-2xl text-[14px] font-semibold text-white bg-brand-500 hover:bg-brand-600 shadow-[0_1px_0_0_rgba(255,255,255,0.25)_inset,0_8px_20px_-6px_var(--color-brand-500)] disabled:opacity-40 disabled:pointer-events-none transition-all"
          >
            {loading ? 'Joining…' : 'Join room'}
          </button>
        </form>
      {/if}
    </div>
  </div>
{/if}