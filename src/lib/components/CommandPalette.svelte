<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { supabase } from '$lib/supabase';
  import {
    Search,
    LayoutGrid,
    Plus,
    Quote as QuoteIcon,
    Trophy,
    Brain,
    Users,
    Settings,
    User,
    CornerDownLeft
  } from 'lucide-svelte';

  let {
    open = $bindable(false)
  }: {
    open?: boolean;
  } = $props();

  type Room = { id: string; name: string; code: string };
  type Item = {
    id: string;
    label: string;
    sublabel?: string;
    icon: typeof Search;
    action: () => void;
    keywords?: string;
  };

  let query = $state('');
  let activeIndex = $state(0);
  let rooms = $state<Room[]>([]);
  let roomsLoaded = $state(false);
  let inputEl = $state<HTMLInputElement>();

  const roomId = $derived(page.params.id as string | undefined);
  const inRoom = $derived(!!roomId);

  async function ensureRoomsLoaded() {
    if (roomsLoaded) return;

    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('room_members')
      .select('rooms(id, name, code)')
      .eq('user_id', user.id);

    rooms = ((data ?? []) as any[])
      .map((r) => (Array.isArray(r.rooms) ? r.rooms[0] : r.rooms))
      .filter((r): r is Room => !!r);

    roomsLoaded = true;
  }

  function close() {
    open = false;
    query = '';
    activeIndex = 0;
  }

  // Reageert op elke manier waarop `open` true wordt — via Cmd+K, via de
  // knop in de topbar (bind:open), of vanuit een andere parent.
  $effect(() => {
    if (open) {
      ensureRoomsLoaded();
      tick().then(() => inputEl?.focus());
    }
  });

  function run(item: Item) {
    item.action();
    close();
  }

  // ---------- item lijsten ----------

  const globalItems = $derived.by((): Item[] => {
    const items: Item[] = [
      {
        id: 'nav-rooms',
        label: 'Your rooms',
        icon: LayoutGrid,
        action: () => goto('/rooms'),
        keywords: 'stashes overview home'
      },
      {
        id: 'nav-profile',
        label: 'Profile',
        icon: User,
        action: () => goto('/profile')
      },
      {
        id: 'nav-settings',
        label: 'Account settings',
        icon: Settings,
        action: () => goto('/settings')
      }
    ];

    if (inRoom && roomId) {
      items.unshift(
        {
          id: 'add-quote',
          label: 'Add a quote',
          icon: Plus,
          action: () => goto(`/rooms/${roomId}/quotes?new=1`),
          keywords: 'new create quote'
        },
        {
          id: 'room-quotes',
          label: 'View quotes',
          icon: QuoteIcon,
          action: () => goto(`/rooms/${roomId}/quotes`)
        },
        {
          id: 'room-leaderboard',
          label: 'Leaderboard',
          icon: Trophy,
          action: () => goto(`/rooms/${roomId}/leaderboard`)
        },
        {
          id: 'room-quiz',
          label: 'Quiz',
          icon: Brain,
          action: () => goto(`/rooms/${roomId}/quiz`)
        },
        {
          id: 'room-members',
          label: 'Members',
          icon: Users,
          action: () => goto(`/rooms/${roomId}/members`)
        },
        {
          id: 'room-settings',
          label: 'Room settings',
          icon: Settings,
          action: () => goto(`/rooms/${roomId}/settings`)
        }
      );
    }

    return items;
  });

  const roomItems = $derived.by((): Item[] =>
    rooms.map((r) => ({
      id: `room-${r.id}`,
      label: r.name,
      sublabel: `Room · ${r.code}`,
      icon: LayoutGrid,
      action: () => goto(`/rooms/${r.id}`),
      keywords: r.code
    }))
  );

  const allItems = $derived([...globalItems, ...roomItems]);

  const filteredItems = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter((item) => {
      const haystack = `${item.label} ${item.sublabel ?? ''} ${item.keywords ?? ''}`.toLowerCase();
      return haystack.includes(q);
    });
  });

  // reset selected index whenever the visible list changes
  $effect(() => {
    filteredItems;
    activeIndex = 0;
  });

  function handleGlobalKeydown(e: KeyboardEvent) {
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    const modifierPressed = isMac ? e.metaKey : e.ctrlKey;

    if (modifierPressed && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (open) {
        close();
      } else {
        open = true;
      }
      return;
    }

    if (!open) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, filteredItems.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filteredItems[activeIndex];
      if (item) run(item);
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleGlobalKeydown);
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') window.removeEventListener('keydown', handleGlobalKeydown);
  });
</script>

{#if open}
  <div class="fixed inset-0 z-200 flex items-start justify-center px-4 pt-[12vh] sm:pt-[16vh]">
    <button
      type="button"
      class="absolute inset-0 bg-black/30 backdrop-blur-md animate-fade-in"
      onclick={close}
      aria-label="Close"
    ></button>

    <div
      class="glass-panel relative w-full max-w-lg
             rounded-3xl
             overflow-hidden
             animate-palette-in"
    >
      <div class="flex items-center gap-3 px-4 h-14 border-b border-black/[0.05] dark:border-white/[0.08]">
        <Search size={17} class="text-surface-400 shrink-0" />
        <input
          bind:this={inputEl}
          bind:value={query}
          type="text"
          placeholder="Search rooms or jump to a page…"
          class="flex-1 min-w-0 bg-transparent text-[14px] text-surface-900 dark:text-surface-100 placeholder-surface-400 focus:outline-none"
        />
        <kbd class="hidden sm:flex items-center justify-center px-1.5 h-5 rounded-md text-[10px] font-semibold text-surface-400 bg-black/[0.05] dark:bg-white/[0.06] shrink-0">
          esc
        </kbd>
      </div>

      <div class="max-h-88 overflow-y-auto overscroll-contain p-1.5">
        {#if filteredItems.length === 0}
          <div class="flex flex-col items-center justify-center py-10 text-center">
            <p class="text-[12.5px] text-surface-400 dark:text-surface-500">No matches for "{query}"</p>
          </div>
        {:else}
          {#each filteredItems as item, i (item.id)}
            <button
              type="button"
              onclick={() => run(item)}
              onmouseenter={() => (activeIndex = i)}
              class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors
                     {i === activeIndex ? 'bg-brand-500/10' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.05]'}"
            >
              <div
                class="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg
                       {i === activeIndex ? 'bg-brand-500 text-white' : 'bg-black/[0.04] dark:bg-white/[0.06] text-surface-500 dark:text-surface-400'}"
              >
                <item.icon size={14} strokeWidth={2.25} />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-[13px] font-semibold text-surface-800 dark:text-surface-100 truncate">{item.label}</p>
                {#if item.sublabel}
                  <p class="text-[11px] text-surface-400 dark:text-surface-500 truncate">{item.sublabel}</p>
                {/if}
              </div>
              {#if i === activeIndex}
                <CornerDownLeft size={13} class="text-surface-400 shrink-0" />
              {/if}
            </button>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}