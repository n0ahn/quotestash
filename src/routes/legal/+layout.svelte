<script lang="ts">
  import { ArrowLeft } from 'lucide-svelte';

  let { children } = $props();
</script>

<div class="relative min-h-screen px-5 py-24 sm:py-28 overflow-hidden">
  <div class="app-ambient default-blobs"></div>

  <div class="relative z-10 mx-auto w-full max-w-2xl">
    <a
      href="/"
      class="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 transition-colors mb-6"
    >
      <ArrowLeft size={14} />
      Back to QuoteStash
    </a>

    <div class="glass-panel rounded-3xl p-6 sm:p-9">
      {@render children()}
    </div>

    <p class="text-center text-[11.5px] text-surface-400 dark:text-surface-500 mt-6">
      <a href="/legal/privacy" class="hover:text-surface-600 dark:hover:text-surface-300 transition-colors">Privacy Policy</a>
      <span class="mx-1.5">·</span>
      <a href="/legal/terms" class="hover:text-surface-600 dark:hover:text-surface-300 transition-colors">Terms &amp; Conditions</a>
      <span class="mx-1.5">·</span>
      <a href="/legal/cookies" class="hover:text-surface-600 dark:hover:text-surface-300 transition-colors">Cookie Policy</a>
    </p>
  </div>
</div>