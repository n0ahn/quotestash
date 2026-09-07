<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  import { LayoutDashboard, MessageSquareQuote, Trophy, Users, Puzzle, Crown, Settings } from 'lucide-svelte';
  import type { Database } from '$lib/database.types';

  type Room = Database['public']['Tables']['rooms']['Row'];

  let { children } = $props();

  let room = $state<Room | null>(null);
  let loading = $state(true);
  let isOwner = $state(false);

  const roomId = $derived(page.params.id!);

  const navItems = [
    { href: '', icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/quotes', icon: MessageSquareQuote, label: 'Quotes' },
    { href: '/leaderboard', icon: Trophy, label: 'Leaderboard' },
    { href: '/members', icon: Users, label: 'Members' },
    { href: '/quiz', icon: Puzzle, label: 'Quiz' }
  ];

  // Owner-only — appended to the desktop sidebar, kept off the mobile bottom
  // nav (which only has room for 5 items) since it's reachable from there
  // via the "All rooms" back-link → room card → ⌘K, or by widening the app.
  const ownerNavItems = $derived(
    isOwner ? [...navItems, { href: '/settings', icon: Settings, label: 'Settings' }] : navItems
  );

  function isActive(href: string): boolean {
    const target = `/rooms/${roomId}${href}`;
    return href === ''
      ? page.url.pathname === target
      : page.url.pathname.startsWith(target);
  }

  async function loadRoom() {
    loading = true;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      goto('/auth/login');
      return;
    }

    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single();

    if (error || !data) {
      goto('/rooms');
      return;
    }

    room = data;
    isOwner = data.owner_id === user.id;
    loading = false;
  }

  onMount(loadRoom);
</script>

{#if loading}
  <div class="min-h-screen flex items-center justify-center">
    <div class="w-6 h-6 rounded-full border-2 border-surface-200 dark:border-surface-700 border-t-brand-500 animate-spin"></div>
  </div>
{:else if room}
  <div class="sm:h-screen sm:overflow-hidden flex flex-col sm:flex-row">
    <!-- Sidebar (desktop) — fixed so only the main content scrolls -->
    <aside
      class="hidden sm:flex flex-col w-60 shrink-0
             sm:fixed sm:inset-y-0 sm:left-0 sm:h-screen sm:z-30
             border-r border-black/[0.06] dark:border-white/[0.08]
             bg-white/20 backdrop-blur-xl dark:bg-surface-900/18
             px-4 pt-24 pb-6"
    >
      <div class="px-2 mb-6 flex items-center gap-2.5">
        {#if room.photo_url}
          <img
            src={room.photo_url}
            alt={room.name}
            class="w-9 h-9 rounded-xl object-cover shrink-0 shadow-[0_1px_0_0_rgba(255,255,255,0.3)_inset,0_4px_12px_-2px_rgba(0,0,0,0.25)]"
          />
        {/if}
        <div class="min-w-0">
          <p class="text-[15px] font-bold text-surface-900 dark:text-surface-50 truncate flex items-center gap-1.5">
            {room.name}
            {#if isOwner}
              <Crown size={13} class="text-amber-400 shrink-0" fill="currentColor" />
            {/if}
          </p>
          <p class="text-[11px] font-mono tracking-widest text-surface-400 dark:text-surface-500 mt-0.5">{room.code}</p>
        </div>
      </div>

      <nav class="flex flex-col gap-1 overflow-y-auto">
        {#each ownerNavItems as item (item.label)}
        <a
            href="/rooms/{roomId}{item.href}"
            class="flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-colors {isActive(item.href)
              ? 'bg-brand-500/10 text-brand-500'
              : 'text-surface-600 dark:text-surface-400 hover:bg-black/[0.03] hover:backdrop-blur-md dark:hover:bg-white/[0.05]'}"
          >
            <item.icon size={16} strokeWidth={2} />
            {item.label}
          </a>
        {/each}
      </nav>

      <a
        href="/rooms"
        class="mt-auto px-3 py-2 text-[12px] font-medium text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 transition-colors"
      >
        ← All rooms
      </a>
    </aside>

    <!-- Main content — offset by sidebar width on desktop, scrolls independently -->
    <main class="flex-1 sm:ml-60 sm:h-screen sm:overflow-y-auto pt-20 sm:pt-6 pb-24 sm:pb-10">
      {@render children()}
    </main>

    <!-- Bottom nav (mobile) -->
    <nav class="glass-panel sm:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around !rounded-none border-x-0 border-b-0 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {#each ownerNavItems as item (item.label)}
        <a
          href="/rooms/{roomId}{item.href}"
          class="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-[10px] font-medium transition-colors {isActive(item.href)
            ? 'text-brand-500'
            : 'text-surface-400 dark:text-surface-500'}"
        >
          <item.icon size={19} strokeWidth={2} />
          {item.label}
        </a>
      {/each}
    </nav>
  </div>
{/if}