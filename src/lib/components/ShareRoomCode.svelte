<script lang="ts">
  import { Copy, Check, Share2, Link2 } from 'lucide-svelte';

  let {
    code,
    roomName,
    variant = 'full'
  }: {
    code: string;
    roomName: string;
    /** 'full' shows the code box + copy + share buttons (settings page). 'compact' shows a share button + copy-link button (post-create moment). */
    variant?: 'full' | 'compact';
  } = $props();

  let copied = $state(false);
  let linkCopied = $state(false);

  function joinUrl(): string {
    // Falls back gracefully during SSR; only ever called from a click handler in the browser.
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/rooms/join?code=${code}`;
  }

  function shareText(): string {
    return `Join "${roomName}" on QuoteStash! Use code ${code} or tap the link: ${joinUrl()}`;
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch (err) {
      console.error('Failed to copy code', err);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(joinUrl());
      linkCopied = true;
      setTimeout(() => (linkCopied = false), 1500);
    } catch (err) {
      console.error('Failed to copy link', err);
    }
  }

  async function shareCode() {
    const text = shareText();

    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join my QuoteStash room', text, url: joinUrl() });
      } catch (err) {
        // AbortError just means the user closed the native share sheet — not a real error.
        if ((err as Error)?.name !== 'AbortError') console.error('Share failed', err);
      }
      return;
    }

    // No native share support (most desktop browsers) — fall back to clipboard.
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch (err) {
      console.error('Failed to copy share text', err);
    }
  }
</script>

{#if variant === 'compact'}
  <div class="w-full flex flex-col gap-2">
    <button
      type="button"
      onclick={shareCode}
      class="w-full h-11 rounded-2xl text-[14px] font-semibold text-white bg-brand-500 hover:bg-brand-600 shadow-[0_1px_0_0_rgba(255,255,255,0.25)_inset,0_8px_20px_-6px_var(--color-brand-500)] transition-all flex items-center justify-center gap-2"
    >
      {#if copied}
        <Check size={16} />
        Copied!
      {:else}
        <Share2 size={16} />
        Share invite
      {/if}
    </button>
    <button
      type="button"
      onclick={copyLink}
      class="w-full h-11 rounded-2xl text-[14px] font-semibold border border-surface-200 dark:border-surface-700 text-surface-700 dark:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-800 transition-all flex items-center justify-center gap-2"
    >
      {#if linkCopied}
        <Check size={16} class="text-emerald-500" />
        Link copied!
      {:else}
        <Link2 size={16} />
        Copy link
      {/if}
    </button>
    <div
      class="h-10 px-3 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-950 flex items-center justify-between gap-2"
    >
      <span class="text-[14px] font-mono tracking-widest text-surface-900 dark:text-surface-50">{code}</span>
      <button
        type="button"
        onclick={copyCode}
        aria-label="Copy code"
        title="Copy code"
        class="h-7 w-7 shrink-0 flex items-center justify-center rounded-lg text-surface-500 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
      >
        {#if copied}
          <Check size={14} class="text-emerald-500" />
        {:else}
          <Copy size={14} />
        {/if}
      </button>
    </div>
  </div>
{:else}
  <div class="flex items-center gap-2">
    <div
      class="flex-1 h-10 px-3 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-950 flex items-center"
    >
      <span class="text-[14px] font-mono tracking-widest text-surface-900 dark:text-surface-50">{code}</span>
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
      onclick={shareCode}
      aria-label="Share invite"
      title="Share invite"
      class="h-10 w-10 shrink-0 flex items-center justify-center rounded-xl border border-surface-200 dark:border-surface-700 text-surface-500 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
    >
      <Share2 size={15} />
    </button>
  </div>
{/if}