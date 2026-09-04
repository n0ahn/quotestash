<script lang="ts">
  import { goto } from '$app/navigation';
  import { supabase, getCurrentProfile } from '$lib/supabase';
  import { onMount } from 'svelte';
  import { User, Settings, LayoutGrid, LogOut, ChevronDown } from 'lucide-svelte';

  let open = $state(false);
  let firstName = $state('');
  let menuEl = $state<HTMLDivElement>();

  onMount(async () => {
    const profile = await getCurrentProfile();
    firstName = profile?.first_name ?? '';
  });

  function handleClickOutside(e: MouseEvent) {
    if (menuEl && !menuEl.contains(e.target as Node)) open = false;
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    goto('/');
  }
</script>

<svelte:window onclick={handleClickOutside} />

<div class="relative" bind:this={menuEl}>
  <button
    onclick={() => (open = !open)}
    class="flex items-center gap-2 h-9 pl-1.5 pr-2.5 rounded-full border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 hover:bg-surface-50 dark:hover:bg-surface-800 shadow-sm transition-colors"
  >
    <div class="w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center text-white text-[11px] font-bold">
      {firstName ? firstName.charAt(0).toUpperCase() : '·'}
    </div>
    <ChevronDown size={13} class="text-surface-400" />
  </button>

  {#if open}
    <div class="absolute right-0 mt-2 w-52 rounded-2xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 shadow-lg overflow-hidden">
      {#if firstName}
        <div class="px-4 py-3 border-b border-surface-100 dark:border-surface-800">
          <p class="text-[13px] font-semibold text-surface-900 dark:text-surface-50">{firstName}</p>
        </div>
      {/if}

      <div class="p-1.5">
        <a
          href="/rooms"
          onclick={() => (open = false)}
          class="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
        >
          <LayoutGrid size={15} />
          Your rooms
        </a>
        <a
          href="/profile"
          onclick={() => (open = false)}
          class="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
        >
          <User size={15} />
          Profile
        </a>
        <a
          href="/settings"
          onclick={() => (open = false)}
          class="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
        >
          <Settings size={15} />
          Settings
        </a>
      </div>

      <div class="p-1.5 border-t border-surface-100 dark:border-surface-800">
        <button
          onclick={handleLogout}
          class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
        >
          <LogOut size={15} />
          Log out
        </button>
      </div>
    </div>
  {/if}
</div>