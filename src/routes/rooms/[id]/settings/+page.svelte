<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabase';
  import {
    Settings,
    Copy,
    Check,
    RefreshCw,
    Loader2,
    Trash2,
    ShieldAlert
  } from 'lucide-svelte';
  import type { Database } from '$lib/database.types';

  type Room = Database['public']['Tables']['rooms']['Row'];

  const roomId = $derived(page.params.id!);

  let loading = $state(true);
  let notAuthorized = $state(false);

  let room = $state<Room | null>(null);
  let nameDraft = $state('');
  let savingName = $state(false);
  let nameSaved = $state(false);

  const nameDirty = $derived(nameDraft.trim() !== '' && nameDraft.trim() !== room?.name);

  let copied = $state(false);
  let regenerating = $state(false);
  let regenError = $state('');

  let showDeleteConfirm = $state(false);
  let deleteConfirmText = $state('');
  let deleting = $state(false);
  let deleteError = $state('');

  function generateCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  async function loadData() {
    loading = true;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      goto('/auth/login');
      return;
    }

    const { data, error } = await supabase.from('rooms').select('*').eq('id', roomId).single<Room>();

    if (error || !data) {
      goto('/rooms');
      return;
    }

    if (data.owner_id !== user.id) {
      notAuthorized = true;
      loading = false;
      return;
    }

    room = data;
    nameDraft = data.name;
    loading = false;
  }

  async function saveName() {
    if (!room || !nameDirty || savingName) return;
    savingName = true;
    nameSaved = false;

    const trimmed = nameDraft.trim();
    const { error } = await supabase.from('rooms').update({ name: trimmed }).eq('id', roomId);

    if (!error) {
      room = { ...room, name: trimmed };
      nameSaved = true;
      setTimeout(() => (nameSaved = false), 2000);
    } else {
      console.error('Failed to update room name', error);
    }
    savingName = false;
  }

  async function copyCode() {
    if (!room) return;
    await navigator.clipboard.writeText(room.code);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  async function regenerateCode() {
    if (!room || regenerating) return;
    regenerating = true;
    regenError = '';

    const newCode = generateCode();
    const { error } = await supabase.from('rooms').update({ code: newCode }).eq('id', roomId);

    if (error) {
      console.error('Failed to regenerate code', error);
      regenError = "Couldn't generate a new code. Try again.";
    } else {
      room = { ...room, code: newCode };
    }
    regenerating = false;
  }

  async function deleteRoom() {
    if (!room || deleteConfirmText !== room.name || deleting) return;
    deleting = true;
    deleteError = '';

    const { error } = await supabase.from('rooms').delete().eq('id', roomId);

    if (error) {
      console.error('Failed to delete room', error);
      deleteError = "Couldn't delete this room. Please try again.";
      deleting = false;
      return;
    }

    goto('/rooms');
  }

  onMount(loadData);
</script>

<svelte:head>
  <title>Room settings · QuoteStash</title>
</svelte:head>

<div class="px-5 sm:px-8 py-8 sm:py-10 max-w-3xl">
  {#if loading}
    <div class="flex items-center gap-2.5 mb-8">
      <div class="w-9 h-9 rounded-2xl bg-surface-100 dark:bg-surface-900 animate-pulse"></div>
      <div class="h-5 w-32 rounded-lg bg-surface-100 dark:bg-surface-900 animate-pulse"></div>
    </div>
    <div class="h-40 rounded-3xl bg-surface-100 dark:bg-surface-900 animate-pulse mb-4"></div>
    <div class="h-32 rounded-3xl bg-surface-100 dark:bg-surface-900 animate-pulse"></div>
  {:else if notAuthorized}
    <div class="flex flex-col items-center justify-center py-20 text-center px-4">
      <div class="w-11 h-11 rounded-2xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center text-surface-400 mb-3">
        <ShieldAlert size={20} />
      </div>
      <p class="text-[14px] font-semibold text-surface-700 dark:text-surface-200">Owners only</p>
      <p class="text-[12.5px] text-surface-400 dark:text-surface-500 mt-1 max-w-xs">
        Only the room owner can access these settings.
      </p>
    </div>
  {:else if room}
    <div class="flex items-center gap-2.5 mb-1">
      <div class="flex items-center justify-center w-9 h-9 rounded-2xl bg-linear-to-br from-brand-400 to-brand-600 shadow-sm shadow-brand-500/30 shrink-0">
        <Settings size={18} class="text-white" strokeWidth={2.2} />
      </div>
      <h1 class="text-xl font-bold text-surface-900 dark:text-surface-50">Room settings</h1>
    </div>
    <p class="text-[13px] text-surface-500 dark:text-surface-400 mt-1 ml-11.5">
      Manage {room.name}
    </p>

    <div class="mt-6 flex flex-col gap-4">
      <!-- General -->
      <div class="p-5 rounded-3xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800">
        <h2 class="text-[13px] font-bold text-surface-700 dark:text-surface-200 uppercase tracking-wide mb-4">
          General
        </h2>

        <label for="room-name" class="block text-[12px] font-medium text-surface-500 dark:text-surface-400 mb-1.5">
          Room name
        </label>
        <div class="flex items-center gap-2">
          <input
            id="room-name"
            type="text"
            bind:value={nameDraft}
            maxlength="60"
            class="flex-1 h-10 px-3 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-950 text-[13.5px] text-surface-900 dark:text-surface-50 outline-none focus:border-brand-400 dark:focus:border-brand-500 transition-colors"
          />
          <button
            type="button"
            onclick={saveName}
            disabled={!nameDirty || savingName}
            class="h-10 px-4 rounded-xl text-[12.5px] font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 disabled:hover:bg-brand-500 transition-colors flex items-center gap-1.5 shrink-0"
          >
            {#if savingName}
              <Loader2 size={14} class="animate-spin" />
            {:else if nameSaved}
              <Check size={14} />
            {:else}
              Save
            {/if}
          </button>
        </div>
      </div>

      <!-- Room code -->
      <div class="p-5 rounded-3xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800">
        <h2 class="text-[13px] font-bold text-surface-700 dark:text-surface-200 uppercase tracking-wide mb-1">
          Room code
        </h2>
        <p class="text-[11.5px] text-surface-400 dark:text-surface-500 mb-4">
          Share this code so others can join. Regenerating it invalidates the old code.
        </p>

        <div class="flex items-center gap-2">
          <div class="flex-1 h-10 px-3 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-950 flex items-center">
            <span class="text-[14px] font-mono tracking-widest text-surface-900 dark:text-surface-50">{room.code}</span>
          </div>
          <button
            type="button"
            onclick={copyCode}
            aria-label="Copy code"
            title="Copy code"
            class="h-10 w-10 shrink-0 flex items-center justify-center rounded-xl border border-surface-200 dark:border-surface-700 text-surface-500 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
          >
            {#if copied}
              <Check size={15} class="text-emerald-500" />
            {:else}
              <Copy size={15} />
            {/if}
          </button>
          <button
            type="button"
            onclick={regenerateCode}
            disabled={regenerating}
            class="h-10 px-4 rounded-xl text-[12.5px] font-semibold border border-surface-200 dark:border-surface-700 text-surface-700 dark:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-800 disabled:opacity-40 transition-colors flex items-center gap-1.5 shrink-0"
          >
            {#if regenerating}
              <Loader2 size={14} class="animate-spin" />
            {:else}
              <RefreshCw size={14} />
            {/if}
            New code
          </button>
        </div>
        {#if regenError}
          <p class="text-[11.5px] text-red-500 mt-2">{regenError}</p>
        {/if}
      </div>

      <!-- Danger zone -->
      <div class="p-5 rounded-3xl bg-red-50/60 dark:bg-red-500/5 border border-red-200 dark:border-red-500/20">
        <h2 class="text-[13px] font-bold text-red-500 uppercase tracking-wide mb-1 flex items-center gap-1.5">
          <Trash2 size={13} />
          Danger zone
        </h2>
        <p class="text-[11.5px] text-red-400/90 dark:text-red-400/70 mb-4">
          Permanently delete this room, its quotes, and its members. This can't be undone.
        </p>

        {#if !showDeleteConfirm}
          <button
            type="button"
            onclick={() => (showDeleteConfirm = true)}
            class="h-9 px-4 rounded-xl text-[12.5px] font-semibold bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
          >
            Delete room
          </button>
        {:else}
          <div class="flex flex-col gap-2.5">
            <p class="text-[12px] text-red-500 dark:text-red-400 font-medium">
              Type <span class="font-mono font-bold">{room.name}</span> to confirm.
            </p>
            <input
              type="text"
              bind:value={deleteConfirmText}
              placeholder={room.name}
              class="w-full max-w-xs h-9 px-3 rounded-xl border border-red-300 dark:border-red-500/40 bg-white dark:bg-surface-950 text-[13px] text-surface-900 dark:text-surface-50 outline-none"
            />
            {#if deleteError}
              <p class="text-[11.5px] text-red-500">{deleteError}</p>
            {/if}
            <div class="flex items-center gap-2">
              <button
                type="button"
                onclick={deleteRoom}
                disabled={deleteConfirmText !== room.name || deleting}
                class="h-9 px-4 rounded-xl text-[12.5px] font-semibold bg-red-500 text-white hover:bg-red-600 disabled:opacity-40 transition-colors flex items-center gap-1.5"
              >
                {#if deleting}
                  <Loader2 size={14} class="animate-spin" />
                {/if}
                Confirm delete
              </button>
              <button
                type="button"
                onclick={() => {
                  showDeleteConfirm = false;
                  deleteConfirmText = '';
                  deleteError = '';
                }}
                class="h-9 px-4 rounded-xl text-[12.5px] font-semibold text-surface-500 hover:text-surface-800 dark:hover:text-surface-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>