<script lang="ts">
  import { Heart, EyeOff, Trash2, X, MessageCircle } from 'lucide-svelte';
  import { page } from '$app/state';
  import type { QuoteWithDetails } from '$lib/database.types';
  import Avatar from './Avatar.svelte';

  let {
    quote,
    favoriteCount,
    isFavorited,
    canDelete,
    commentCount = 0,
    onToggleFavorite,
    onDelete,
    onTagClick,
    onRemoveTag
  }: {
    quote: QuoteWithDetails;
    favoriteCount: number;
    isFavorited: boolean;
    canDelete: boolean;
    commentCount?: number;
    onToggleFavorite: () => void;
    onDelete: () => void;
    onTagClick: (tag: string) => void;
    onRemoveTag?: (tag: string) => void;
  } = $props();

  const roomId = $derived(page.params.id!);

  function colorFromString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 60%)`;
  }

  // svelte-ignore state_referenced_locally
  const accentColor = quote.color || colorFromString(quote.id);
  let confirmingDelete = $state(false);
</script>

<div class="glass group relative flex flex-col gap-3 p-5 rounded-3xl hover:-translate-y-0.5 transition-all duration-300 overflow-hidden">
  <div
    class="absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-[3px] rounded-full blur-[1px] opacity-70"
    style="background: linear-gradient(90deg, transparent, {accentColor}, transparent);"
  ></div>

  <a href="/rooms/{roomId}/quotes/{quote.id}" class="absolute inset-0 z-0" aria-label="View quote"></a>
  {#if quote.is_nsfw}
        <div class="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/15 backdrop-blur-sm text-red-500 w-15">
          <EyeOff size={10} />
          <span class="text-[9px] font-bold uppercase tracking-wide">NSFW</span>
        </div>
      {/if}
  <div class="absolute top-4 right-4 z-50 flex items-start justify-between pointer-events-none">
    <div></div>
    <div class="flex items-center gap-1.5 pointer-events-auto">

      {#if canDelete}
        {#if confirmingDelete}
          <button
            onclick={(e) => { e.preventDefault(); onDelete(); }}
            class="text-[10px] font-bold text-white bg-red-500 hover:bg-red-600 active:scale-95 px-2 py-1 rounded-full transition-all"
          >
            Confirm?
          </button>
          <button
            onclick={(e) => { e.preventDefault(); confirmingDelete = false; }}
            aria-label="Cancel delete"
            class="text-[10px] font-medium text-surface-400 hover:text-surface-600 dark:hover:text-surface-300"
          >
            Cancel
          </button>
        {:else}
          <button
            onclick={(e) => { e.preventDefault(); confirmingDelete = true; }}
            aria-label="Delete quote"
            class="p-1 rounded-full text-surface-300 hover:text-red-500 hover:bg-red-50/70 dark:hover:bg-red-500/10 backdrop-blur-sm active:scale-90 transition-all"
          >
            <Trash2 size={14} />
          </button>
        {/if}
      {/if}
    </div>
  </div>

  <div class="relative z-10 flex flex-col gap-2.5 pointer-events-none">
    {#each quote.lines as line, i (i)}
      <div class="flex items-start gap-2.5">
        <div
          class="shrink-0 flex items-center justify-center w-7 h-7 rounded-full text-white text-[11px] font-bold mt-0.5 ring-2 ring-white/70 dark:ring-surface-900/70 shadow-[0_1px_0_0_rgba(255,255,255,0.3)_inset,0_4px_10px_-2px_rgba(0,0,0,0.2)]"
          style="background-color: {colorFromString(line.said_by)};"
        >
          {line.said_by.charAt(0).toUpperCase()}
        </div>
        <div class="flex-1 min-w-0 wrap-break-word max-w-[80%]">
          <p class="text-[13.5px] font-medium text-surface-800 dark:text-surface-100 leading-snug">
            "{line.text}"
          </p>
          <p class="text-[10.5px] text-surface-400 dark:text-surface-500 font-medium mt-0.5">{line.said_by}</p>
        </div>
      </div>
    {/each}
  </div>

  {#if quote.tags && quote.tags.length > 0}
    <div class="relative z-10 flex flex-wrap gap-1.5 pointer-events-auto">
      {#each quote.tags as tag, index (tag + index)}
        <div
          class="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-lg backdrop-blur-sm
                 hover:opacity-80 active:scale-95 transition-all"
          style:color={colorFromString(tag)}
          style:background-color={`${colorFromString(tag)}17`}
        >
          <button
            onclick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onTagClick(tag);
            }}
          >
            #{tag}
          </button>

          {#if canDelete && onRemoveTag}
            <button
              onclick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRemoveTag(tag);
              }}
              class="flex items-center justify-center w-3 h-3 rounded-full hover:bg-red-500/20 hover:text-red-500 transition-colors"
              aria-label="Remove tag"
            >
              <X size={9} strokeWidth={2.5} />
            </button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <div class="relative z-10 flex items-center justify-between pointer-events-none pt-1 mt-auto border-t border-black/[0.05] dark:border-white/[0.08]">
    {#if quote.adder?.first_name}
      <div class="flex items-center gap-1.5 min-w-0 pt-2.5" title={`Quoted by ${quote.adder.first_name}`}>
        <Avatar name={quote.adder.first_name} avatarUrl={quote.adder.avatar_url} size={20} ring />
        <span class="text-[11px] font-medium text-surface-400 dark:text-surface-500 truncate">
          Quoted by <span class="text-surface-500 dark:text-surface-400">{quote.adder.first_name}</span>
        </span>
      </div>
    {:else}
      <div class="pt-2.5"></div>
    {/if}

    <div class="flex items-center gap-3 shrink-0 pt-2.5">
      <div class="flex items-center gap-1 text-surface-400 dark:text-surface-500" title="Comments">
        <MessageCircle size={15} />
        <span class="text-[12px] font-semibold">{commentCount}</span>
      </div>

      <button onclick={(e) => { e.preventDefault(); onToggleFavorite(); }} class="pointer-events-auto flex items-center gap-1 group/heart" aria-label="Toggle favorite">
        <Heart
          size={16}
          class="transition-colors {isFavorited ? 'text-red-500' : 'text-surface-300 dark:text-surface-600 group-hover/heart:text-red-300'}"
          fill={isFavorited ? 'currentColor' : 'none'}
        />
        <span class="text-[12px] font-semibold text-surface-400 dark:text-surface-500">{favoriteCount}</span>
      </button>
    </div>
  </div>
</div>