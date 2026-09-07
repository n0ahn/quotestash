<script lang="ts">
  import { onMount } from 'svelte';
  import { Download, X, Share } from 'lucide-svelte';

  let deferredPrompt = $state<any>(null);
  let showBanner = $state(false);
  let showIosHint = $state(false);
  let dismissed = $state(false);

  const DISMISS_KEY = 'quotestash-install-dismissed';

  function isStandalone(): boolean {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true
    );
  }

  function isIos(): boolean {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;
  }

  onMount(() => {
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISS_KEY) === '1') return;

    if (isIos()) {
      // iOS Safari never fires beforeinstallprompt — show manual instructions instead.
      showIosHint = true;
      showBanner = true;
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt = e;
      showBanner = true;
    };

    window.addEventListener('beforeinstallprompt', handler);

    window.addEventListener('appinstalled', () => {
      showBanner = false;
      deferredPrompt = null;
    });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  });

  async function install() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted' || outcome === 'dismissed') {
      deferredPrompt = null;
      showBanner = false;
    }
  }

  function dismiss() {
    showBanner = false;
    dismissed = true;
    localStorage.setItem(DISMISS_KEY, '1');
  }
</script>

{#if showBanner && !dismissed}
  <div
    class="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-[200] glass-panel rounded-2xl p-4 flex items-start gap-3 animate-modal-in"
  >
    <div class="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center shrink-0">
      {#if showIosHint}
        <Share size={16} class="text-white" strokeWidth={2.2} />
      {:else}
        <Download size={16} class="text-white" strokeWidth={2.2} />
      {/if}
    </div>

    <div class="min-w-0 flex-1">
      {#if showIosHint}
        <p class="text-[13px] font-semibold text-surface-900 dark:text-surface-50">Install QuoteStash</p>
        <p class="text-[12px] text-surface-500 dark:text-surface-400 mt-0.5 leading-snug">
          Tap <Share size={11} class="inline -mt-0.5" /> then "Add to Home Screen" to install.
        </p>
      {:else}
        <p class="text-[13px] font-semibold text-surface-900 dark:text-surface-50">Install QuoteStash</p>
        <p class="text-[12px] text-surface-500 dark:text-surface-400 mt-0.5 leading-snug">
          Add QuoteStash to your device for quick access and a fullscreen experience.
        </p>
        <button
          type="button"
          onclick={install}
          class="mt-2.5 h-8 px-3.5 rounded-lg text-[12px] font-semibold bg-brand-500 text-white hover:bg-brand-600 transition-colors"
        >
          Install
        </button>
      {/if}
    </div>

    <button
      type="button"
      onclick={dismiss}
      aria-label="Dismiss"
      class="text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 transition-colors shrink-0"
    >
      <X size={16} />
    </button>
  </div>
{/if}