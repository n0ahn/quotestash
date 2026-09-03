<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { supabase, getCurrentProfile } from '$lib/supabase';
  import type { QuoteWithDetails } from '$lib/database.types';

  const COLOR_PALETTE = [
    '#5B50F0', // Brand purple
    '#EC4899', // Pink
    '#F59E0B', // Amber
    '#10B981', // Emerald
    '#3B82F6', // Blue
    '#8B5CF6'  // Violet
  ];

  let roomId = $derived(page.params.id);
  let profile = $state<any>(null);
  let room = $state<any>(null);
  let quotes = $state<QuoteWithDetails[]>([]);
  let loading = $state(true);

  // Add Quote State
  let showAdd = $state(false);
  let content = $state('');
  let saidBy = $state('');
  let selectedColor = $state(COLOR_PALETTE[0]);
  let rawTags = $state('');
  let isNsfw = $state(false);
  let addLoading = $state(false);
  let addError = $state('');

  // UI state
  let copiedCode = $state(false);

  async function loadData() {
    loading = true;
    const p = (await getCurrentProfile()) as any;
    if (!p) { goto('/auth/login'); return; }
    profile = p;

    // Fetch Room
    const { data: roomData, error: roomError } = await (supabase
      .from('rooms') as any)
      .select('*')
      .eq('id', roomId)
      .single();

    if (roomError || !roomData) {
      goto('/rooms');
      return;
    }
    room = roomData;

    // Fetch Quotes for this room with author profile info
    await fetchQuotes();
    loading = false;
  }

  async function fetchQuotes() {
    const { data, error } = await (supabase
      .from('quotes') as any)
      .select(`
        *,
        adder:users!quotes_added_by_fkey(first_name)
      `)
      .eq('room_id', roomId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      quotes = data;
    }
  }

  async function handleAddQuote(e: SubmitEvent) {
    e.preventDefault();
    if (!content.trim() || !saidBy.trim() || !profile) return;

    addLoading = true;
    addError = '';

    const parsedTags = rawTags
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);

    const { error } = await (supabase.from('quotes') as any).insert({
      room_id: roomId,
      added_by: profile.id,
      said_by: saidBy.trim(),
      content: content.trim(),
      color: selectedColor,
      tags: parsedTags,
      is_nsfw: isNsfw
    });

    addLoading = false;

    if (error) {
      addError = error.message;
      return;
    }

    // Reset Form
    content = '';
    saidBy = '';
    rawTags = '';
    isNsfw = false;
    showAdd = false;

    await fetchQuotes();
  }

  async function deleteQuote(quoteId: string) {
    if (!confirm('Are you sure you want to delete this quote?')) return;

    const { error } = await (supabase.from('quotes') as any)
      .delete()
      .eq('id', quoteId);

    if (!error) {
      quotes = quotes.filter((q) => q.id !== quoteId);
    }
  }

  function copyCode() {
    if (!room?.code) return;
    navigator.clipboard.writeText(room.code);
    copiedCode = true;
    setTimeout(() => { copiedCode = false; }, 2000);
  }

  onMount(loadData);
</script>

<svelte:head>
  <title>{room ? room.name : 'Room'} · QuoteStash</title>
</svelte:head>

<div class="min-h-screen w-full px-70 bg-surface-50 dark:bg-zinc-950 transition-colors duration-200">

  <!-- Header -->
  <header class="relative z-10 flex items-center justify-between px-6 sm:px-12 pt-6 pb-4 w-full border-b border-surface-200/60 dark:border-surface-800/60">
    <div class="flex items-center gap-4">
      <a
        href="/rooms"
        class="h-10 w-10 flex items-center justify-center rounded-xl bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
        aria-label="Back to rooms"
      >
        ←
      </a>
      {#if room}
        <div>
          <h1 class="text-xl font-extrabold text-surface-900 dark:text-surface-50 flex items-center gap-2">
            {room.name}
            {#if room.owner_id === profile?.id}
              <span class="text-sm" title="Owner">👑</span>
            {/if}
          </h1>
          <button
            onclick={copyCode}
            class="text-xs font-mono text-surface-400 dark:text-surface-500 hover:text-brand-500 transition-colors flex items-center gap-1.5 mt-0.5"
          >
            CODE: <span class="font-bold tracking-wider underline">{room.code}</span>
            <span>{copiedCode ? '✓ Copied!' : '📋'}</span>
          </button>
        </div>
      {/if}
    </div>

    <button
      onclick={() => { showAdd = !showAdd; }}
      class="h-10 sm:h-11 px-4.5 sm:px-5 rounded-xl text-sm sm:text-base font-semibold text-brand-50 bg-brand-500 hover:bg-brand-600 shadow-md shadow-brand-500/25 transition-colors"
    >
      + Add quote
    </button>
  </header>

  <!-- Main content -->
  <main class="relative z-10 px-70 sm:px-12 py-8 w-full">

    <!-- Add Quote Modal/Drawer -->
    {#if showAdd}
      <div class="mb-8 bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-2xl shadow-xl px-6 py-6 w-full">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-bold text-surface-900 dark:text-surface-100">Add new quote</h2>
          <button
            type="button"
            onclick={() => { showAdd = false; }}
            class="text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 text-lg"
          >✕</button>
        </div>

        <form onsubmit={handleAddQuote} class="flex flex-col gap-4">
          {#if addError}
            <p class="text-sm text-red-500">{addError}</p>
          {/if}

          <div>
            <label for="content" class="block text-xs font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400 mb-1">Quote content</label>
            <textarea
              id="content"
              required
              rows={3}
              bind:value={content}
              placeholder="What did they say?"
              class="w-full p-3.5 rounded-xl bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-surface-900 dark:text-surface-100 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 text-sm"
            ></textarea>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label for="saidBy" class="block text-xs font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400 mb-1">Who said it?</label>
              <input
                id="saidBy"
                type="text"
                required
                bind:value={saidBy}
                placeholder="Name"
                class="w-full h-11 px-4 rounded-xl bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-surface-900 dark:text-surface-100 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 text-sm"
              />
            </div>

            <div>
              <label for="tags" class="block text-xs font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400 mb-1">Tags (comma separated)</label>
              <input
                id="tags"
                type="text"
                bind:value={rawTags}
                placeholder="funny, late-night, classic"
                class="w-full h-11 px-4 rounded-xl bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-surface-900 dark:text-surface-100 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 text-sm"
              />
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-4 pt-2">
            <!-- Accent color selection -->
            <div class="flex items-center gap-2">
              <span class="text-xs font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400">Card Color:</span>
              <div class="flex items-center gap-1.5">
                {#each COLOR_PALETTE as c}
                  <button
                    type="button"
                    onclick={() => { selectedColor = c; }}
                    class="w-7 h-7 rounded-full transition-transform border-2 {selectedColor === c ? 'scale-110 border-surface-900 dark:border-surface-50' : 'border-transparent'}"
                    style="background-color: {c};"
                    aria-label="Color selector"
                  ></button>
                {/each}
              </div>
            </div>

            <!-- NSFW Toggle -->
            <label class="flex items-center gap-2 cursor-pointer text-sm font-medium text-surface-700 dark:text-surface-300">
              <input
                type="checkbox"
                bind:checked={isNsfw}
                class="w-4 h-4 rounded text-brand-500 focus:ring-brand-500/40"
              />
              Mark as 🔞 NSFW
            </label>
          </div>

          <div class="flex justify-end gap-2.5 pt-3">
            <button
              type="button"
              onclick={() => { showAdd = false; }}
              class="h-10 px-4 rounded-xl text-sm font-medium text-surface-500 hover:bg-surface-200 dark:hover:bg-surface-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={addLoading || !content.trim() || !saidBy.trim()}
              class="h-10 px-5 rounded-xl text-sm font-semibold text-brand-50 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 transition-colors"
            >
              {addLoading ? 'Saving…' : 'Save quote'}
            </button>
          </div>
        </form>
      </div>
    {/if}

    <!-- Quotes Grid/Feed -->
    {#if loading}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
        {#each [1, 2, 3, 4] as _}
          <div class="h-40 rounded-2xl bg-surface-100 dark:bg-surface-800/50 animate-pulse"></div>
        {/each}
      </div>

    {:else if quotes.length === 0}
      <div class="flex flex-col items-center justify-center py-20 text-center w-full">
        <p class="text-lg font-bold text-surface-700 dark:text-surface-200 mb-1">No quotes in this room yet</p>
        <p class="text-sm text-surface-400 dark:text-surface-500">Be the first to stash a memorable line!</p>
      </div>

    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 w-full">
        {#each quotes as quote (quote.id)}
          <div
            class="relative flex flex-col justify-between p-6 rounded-2xl bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 shadow-sm hover:shadow-md transition-shadow w-full overflow-hidden"
            style="border-left: 5px solid {quote.color || '#5B50F0'};"
          >
            <div>
              <div class="flex items-start justify-between gap-2 mb-3">
                <span class="text-2xl font-black opacity-30 leading-none" style="color: {quote.color}">”</span>
                <div class="flex items-center gap-1.5">
                  {#if quote.is_nsfw}
                    <span class="px-2 py-0.5 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-bold">NSFW</span>
                  {/if}
                  {#if quote.added_by === profile?.id || room?.owner_id === profile?.id}
                    <button
                      onclick={() => deleteQuote(quote.id)}
                      class="text-surface-400 hover:text-red-500 text-sm px-1 transition-colors"
                      title="Delete quote"
                    >
                      🗑️
                    </button>
                  {/if}
                </div>
              </div>

              <!-- Content -->
              <p class="text-base sm:text-lg font-medium text-surface-900 dark:text-surface-100 mb-4 whitespace-pre-wrap">
                "{quote.content}"
              </p>
            </div>

            <div>
              <!-- Author -->
              <p class="text-sm font-bold text-surface-800 dark:text-surface-200">— {quote.said_by}</p>

              <!-- Meta & Tags -->
              <div class="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-surface-100 dark:border-surface-800 text-xs text-surface-400 dark:text-surface-500">
                <span>Added by <strong class="text-surface-600 dark:text-surface-400">{quote.adder?.first_name || 'Someone'}</strong></span>
                
                {#if quote.tags && quote.tags.length > 0}
                  <div class="flex flex-wrap gap-1">
                    {#each quote.tags as tag}
                      <span class="px-2 py-0.5 rounded-md bg-surface-100 dark:bg-surface-800 text-surface-500 dark:text-surface-400 font-mono">#{tag}</span>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}

  </main>
</div>