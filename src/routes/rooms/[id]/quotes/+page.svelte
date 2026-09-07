<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/state';
  import { replaceState } from '$app/navigation';
  import { supabase } from '$lib/supabase';
  import QuoteCard from '$lib/components/QuoteCard.svelte';
  import QuoteModal from '$lib/components/QuoteModal.svelte';
  import Dropdown from '$lib/components/Dropdown.svelte';
  import { Plus, Search, X, Heart, Quote as QuoteIcon } from 'lucide-svelte';
  import type { QuoteWithDetails } from '$lib/database.types';
  import type { RealtimeChannel } from '@supabase/supabase-js';

  const roomId = $derived(page.params.id!);

  type Member = { id: string; first_name: string; avatar_url: string | null };

  let quotes = $state<QuoteWithDetails[]>([]);
  let members = $state<Member[]>([]);
  let loading = $state(true);
  let modalOpen = $state(false);
  let currentUserId = $state('');
  let isRoomOwner = $state(false);

  let filterUser = $state('');
  let filterQuoter = $state(''); // Nieuw: filter voor wie het heeft toegevoegd
  let filterTag = $state('');
  let filterFavorites = $state(false);
  let hideNsfw = $state(true);
  let sortBy = $state<'recent' | 'favorites'>('recent');
  let searchQuery = $state('');

  let favoriteCounts = $state<Record<string, number>>({});
  let myFavorites = $state<string[]>([]);
  let commentCounts = $state<Record<string, number>>({});

  // De "master list" van tags komt uit room_tags
  let allTags = $state<string[]>([]);

  let realtimeChannel: RealtimeChannel | null = null;

  const filteredQuotes = $derived.by(() => {
    let result = quotes;

    if (filterUser) {
      const fu = filterUser.toLowerCase();
      result = result.filter((q) => q.lines.some((l) => l.said_by.toLowerCase() === fu));
    }
    if (filterQuoter) {
      result = result.filter((q) => q.added_by === filterQuoter);
    }
    if (filterTag === '__nsfw__') {
      result = result.filter((q) => q.is_nsfw);
    } 
    // Anders filteren op de normale tag
    else if (filterTag) {
      result = result.filter((q) => q.tags && q.tags.includes(filterTag));
    }

    // Alleen NSFW verbergen als we NIET specifiek om de NSFW tag vragen
    if (hideNsfw) {
      result = result.filter((q) => !q.is_nsfw);
    }
    if (filterFavorites) {
      result = result.filter((q) => myFavorites.includes(q.id));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((quote) =>
        quote.lines.some((l) => l.text.toLowerCase().includes(q) || l.said_by.toLowerCase().includes(q))
      );
    }

    if (sortBy === 'favorites') {
      result = [...result].sort((a, b) => (favoriteCounts[b.id] ?? 0) - (favoriteCounts[a.id] ?? 0));
    } else if (sortBy === 'recent') {
      result = [...result].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else {
        result = [...result].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }

    return result;
  });

  // Infinite scroll: alle quotes worden nog steeds in één keer opgehaald
  // (nodig voor de client-side filters/sort hierboven), maar we renderen
  // ze in batches zodat lange lijsten niet in één keer de DOM in gaan.
  const PAGE_SIZE = 20;
  let visibleCount = $state(PAGE_SIZE);
  let sentinel = $state<HTMLDivElement>();
  let observer: IntersectionObserver | null = null;

  const visibleQuotes = $derived(filteredQuotes.slice(0, visibleCount));
  const hasMore = $derived(visibleCount < filteredQuotes.length);

  // Zodra de filters/sort/zoekopdracht veranderen, begint de "pagina" weer
  // vanaf het begin. We reageren bewust op de filter-inputs zelf (niet op
  // filteredQuotes/quotes), zodat een realtime update van iemand anders'
  // nieuwe quote de scroll-positie niet resettet.
  $effect(() => {
    filterUser;
    filterQuoter;
    filterTag;
    filterFavorites;
    hideNsfw;
    sortBy;
    searchQuery;
    visibleCount = PAGE_SIZE;
  });

  function setupInfiniteScroll(node: HTMLDivElement) {
    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore) {
          visibleCount += PAGE_SIZE;
        }
      },
      { rootMargin: '400px' }
    );
    observer.observe(node);

    return {
      destroy() {
        observer?.disconnect();
        observer = null;
      }
    };
  }

  async function loadData() {
    loading = true;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    currentUserId = user.id;

    const { data: roomData } = await supabase.from('rooms').select('owner_id').eq('id', roomId).single();
    isRoomOwner = roomData?.owner_id === user.id;

    const { data: quotesData, error: quotesError } = await supabase
      .from('quotes')
      .select('*, adder:users!quotes_added_by_fkey(id, first_name, avatar_url)')
      .eq('room_id', roomId);

    if (quotesError) console.error('quotes load error', quotesError);
    quotes = ((quotesData ?? []) as any[]).map((q) => ({
      ...q,
      adder: Array.isArray(q.adder) ? q.adder[0] : q.adder
    })) as QuoteWithDetails[];

    const { data: membersData, error: membersError } = await supabase
      .from('room_members')
      .select('user_id, users(id, first_name, avatar_url)')
      .eq('room_id', roomId);

    if (membersError) {
      console.error('members load error', membersError);
    } else if (membersData) {
      members = membersData
        .filter((m) => m.users)
        .map((m) => {
          const userObj = Array.isArray(m.users) ? m.users[0] : m.users;
          return {
            id: userObj!.id,
            first_name: userObj!.first_name,
            avatar_url: userObj!.avatar_url ?? null
          };
        });
    }

    const { data: tagsData, error: tagsError } = await supabase
      .from('room_tags')
      .select('name')
      .eq('room_id', roomId)
      .order('name', { ascending: true });

    if (tagsError) {
      console.error('tags load error', tagsError);
    } else {
      allTags = (tagsData ?? []).map((t) => t.name);
    }

    const quoteIds = quotes.map((q) => q.id);

    if (quoteIds.length > 0) {
      const { data: favData, error: favError } = await supabase
        .from('quote_favorites')
        .select('quote_id, user_id')
        .in('quote_id', quoteIds);

      if (favError) console.error('favorites load error', favError);

      const counts: Record<string, number> = {};
      const mine: string[] = [];
      for (const row of favData ?? []) {
        counts[row.quote_id] = (counts[row.quote_id] ?? 0) + 1;
        if (row.user_id === user.id) mine.push(row.quote_id);
      }
      favoriteCounts = counts;
      myFavorites = mine;

      const { data: commentData, error: commentError } = await supabase
        .from('quote_comments')
        .select('quote_id')
        .in('quote_id', quoteIds);

      if (commentError) console.error('comments count load error', commentError);

      const cCounts: Record<string, number> = {};
      for (const row of commentData ?? []) {
        cCounts[row.quote_id] = (cCounts[row.quote_id] ?? 0) + 1;
      }
      commentCounts = cCounts;
    } else {
      favoriteCounts = {};
      myFavorites = [];
      commentCounts = {};
    }

    loading = false;
  }

  /**
   * Eén losse quote (met adder-join) ophalen en in de lokale state zetten.
   * Gebruikt na een realtime INSERT/UPDATE, zodat we niet de hele lijst
   * opnieuw hoeven te laden voor één wijziging.
   */
  async function fetchAndUpsertQuote(id: string) {
    const { data, error } = await supabase
      .from('quotes')
      .select('*, adder:users!quotes_added_by_fkey(id, first_name, avatar_url)')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) {
      if (error) console.error('realtime quote fetch failed', error);
      return;
    }

    const normalized = {
      ...(data as any),
      adder: Array.isArray((data as any).adder) ? (data as any).adder[0] : (data as any).adder
    } as QuoteWithDetails;

    const exists = quotes.some((q) => q.id === normalized.id);
    quotes = exists
      ? quotes.map((q) => (q.id === normalized.id ? normalized : q))
      : [normalized, ...quotes];
  }

  function subscribeToRealtime() {
    realtimeChannel = supabase
      .channel(`room-quotes:${roomId}`)
      // Nieuwe / gewijzigde quotes in deze room
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'quotes', filter: `room_id=eq.${roomId}` },
        (payload) => {
          fetchAndUpsertQuote((payload.new as any).id);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'quotes', filter: `room_id=eq.${roomId}` },
        (payload) => {
          fetchAndUpsertQuote((payload.new as any).id);
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'quotes', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const deletedId = (payload.old as any).id;
          quotes = quotes.filter((q) => q.id !== deletedId);
        }
      )
      // Favorites — geen room_id kolom op quote_favorites, dus niet server-side
      // te filteren op room; we filteren client-side op quote_id in deze room.
      // Onze eigen acties zijn al optimistic verwerkt in toggleFavorite(),
      // dus die negeren we hier om dubbeltellingen te voorkomen — deze
      // listener is puur voor wat ándere leden doen.
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'quote_favorites' },
        (payload) => {
          const row = payload.new as any;
          if (row.user_id === currentUserId) return;
          if (!quotes.some((q) => q.id === row.quote_id)) return;

          favoriteCounts = { ...favoriteCounts, [row.quote_id]: (favoriteCounts[row.quote_id] ?? 0) + 1 };
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'quote_favorites' },
        (payload) => {
          const row = payload.old as any;
          if (row.user_id === currentUserId) return;
          if (!quotes.some((q) => q.id === row.quote_id)) return;

          favoriteCounts = {
            ...favoriteCounts,
            [row.quote_id]: Math.max(0, (favoriteCounts[row.quote_id] ?? 1) - 1)
          };
        }
      )
      // Comments — zelfde verhaal: client-side filteren op quote_id in deze
      // room, en onze eigen comments (toegevoegd op de detailpagina) hier
      // negeren zodat de teller niet dubbel telt.
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'quote_comments' },
        (payload) => {
          const row = payload.new as any;
          if (row.user_id === currentUserId) return;
          if (!quotes.some((q) => q.id === row.quote_id)) return;

          commentCounts = { ...commentCounts, [row.quote_id]: (commentCounts[row.quote_id] ?? 0) + 1 };
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'quote_comments' },
        (payload) => {
          const row = payload.old as any;
          if (row.user_id === currentUserId) return;
          if (!quotes.some((q) => q.id === row.quote_id)) return;

          commentCounts = {
            ...commentCounts,
            [row.quote_id]: Math.max(0, (commentCounts[row.quote_id] ?? 1) - 1)
          };
        }
      )
      .subscribe();
  }

  async function removeTagFromQuote(quoteId: string, tagToRemove: string) {
    const targetQuote = quotes.find((q) => q.id === quoteId);
    if (!targetQuote) return;

    const updatedTags = targetQuote.tags.filter((t) => t !== tagToRemove);

    quotes = quotes.map((q) => (q.id === quoteId ? { ...q, tags: updatedTags } : q));

    const { error } = await supabase
      .from('quotes')
      .update({ tags: updatedTags })
      .eq('id', quoteId);

    if (error) {
      console.error('Failed to remove tag', error);
      await loadData();
    }
  }

  async function deleteTagFromAllQuotes(tagToDelete: string) {
    const affectedQuotes = quotes.filter((q) => q.tags && q.tags.includes(tagToDelete));

    quotes = quotes.map((q) => ({
      ...q,
      tags: q.tags ? q.tags.filter((t) => t !== tagToDelete) : []
    }));
    allTags = allTags.filter((t) => t !== tagToDelete);
    if (filterTag === tagToDelete) filterTag = '';

    for (const q of affectedQuotes) {
      const updatedTags = q.tags.filter((t) => t !== tagToDelete);
      await supabase.from('quotes').update({ tags: updatedTags }).eq('id', q.id);
    }

    const { error } = await supabase
      .from('room_tags')
      .delete()
      .eq('room_id', roomId)
      .eq('name', tagToDelete);

    if (error) {
      console.error('Failed to delete tag from room_tags', error);
    }
  }

  function registerNewTags(newTags: string[]) {
    const merged = new Set([...allTags, ...newTags]);
    allTags = Array.from(merged).sort();
  }

  async function toggleFavorite(quoteId: string) {
    const isFav = myFavorites.includes(quoteId);

    if (isFav) {
      myFavorites = myFavorites.filter((id) => id !== quoteId);
    } else {
      myFavorites = [...myFavorites, quoteId];
    }
    favoriteCounts = {
      ...favoriteCounts,
      [quoteId]: Math.max(0, (favoriteCounts[quoteId] ?? 0) + (isFav ? -1 : 1))
    };

    if (isFav && myFavorites.length === 0) {
      filterFavorites = false;
    }

    const { error } = isFav
      ? await supabase.from('quote_favorites').delete().eq('quote_id', quoteId).eq('user_id', currentUserId)
      : await supabase.from('quote_favorites').insert({ quote_id: quoteId, user_id: currentUserId });

    if (error) {
      console.error('toggle favorite failed', error);
      await loadData();
    }
  }

  async function deleteQuote(quoteId: string) {
    const { error } = await supabase.from('quotes').delete().eq('id', quoteId);

    if (error) {
      console.error('delete quote failed', error);
      return;
    }

    quotes = quotes.filter((q) => q.id !== quoteId);
  }

  function canDeleteQuote(quote: QuoteWithDetails): boolean {
    return isRoomOwner || quote.added_by === currentUserId;
  }

  function selectTag(tag: string) {
    filterTag = filterTag === tag ? '' : tag;
  }

  function clearFilters() {
    filterUser = '';
    filterQuoter = '';
    filterTag = '';
    filterFavorites = false;
    hideNsfw = true;
    searchQuery = '';
  }

  const hasActiveFilters = $derived(!!filterUser || !!filterQuoter || !!filterTag || filterFavorites || !hideNsfw || !!searchQuery);

  // userOptions gebruikt first_name als value, want l.said_by is een naam (string)
  const userOptions = $derived([{ value: '', label: 'All people' }, ...members.map((m) => ({ value: m.first_name, label: m.first_name }))]);
  
  // quoterOptions gebruikt ID als value, want q.added_by is een referentie naar het user_id
  const quoterOptions = $derived([{ value: '', label: 'Added by anyone' }, ...members.map((m) => ({ value: m.id, label: m.first_name }))]);
  
  const tagOptions = $derived([
    { value: '', label: 'All tags' },
    { value: '__nsfw__', label: 'NSFW' }, // <-- Nieuwe NSFW optie
    ...allTags.map((t) => ({ value: t, label: `#${t}` }))
  ]);
  const sortOptions: { value: 'recent' | 'favorites' | 'oldest'; label: string }[] = [
    { value: 'recent', label: 'Newest' },
    { value: 'oldest', label: 'Oldest' },
    { value: 'favorites', label: 'Top favorites' }
  ];

  onMount(async () => {
    await loadData();
    subscribeToRealtime();
  });

  onDestroy(() => {
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  });

  // Command palette / deep links: ?new=1 opent meteen de "add quote" modal,
  // ?tag=xyz zet meteen het tag-filter.
  //
  // Dit staat bewust in een $effect en niet (alleen) in onMount: onMount
  // draait maar één keer, bij het eerste mounten van deze component. Als je
  // al op /rooms/[id]/quotes staat en via Cmd+K nogmaals naar
  // /rooms/[id]/quotes?new=1 navigeert, blijft SvelteKit op dezelfde route
  // en wordt de component niet opnieuw gemount — dus onMount vuurt niet
  // opnieuw af en de modal ging nooit open. Een $effect reageert wél elke
  // keer dat page.url verandert, ook binnen een al-gemounte component.
  $effect(() => {
    const params = page.url.searchParams;
    let cleaned = false;

    if (params.get('new') === '1') {
      modalOpen = true;
      cleaned = true;
    }

    const tagParam = params.get('tag');
    if (tagParam) {
      filterTag = tagParam;
      cleaned = true;
    }

    if (cleaned) {
      const url = new URL(page.url);
      url.searchParams.delete('new');
      url.searchParams.delete('tag');
      replaceState(url, {});
    }
  });
</script>

<svelte:head>
  <title>Quotes · QuoteStash</title>
</svelte:head>

<div class="px-5 sm:px-8 py-8 sm:py-10 max-w-5xl">
  <div class="flex items-start justify-between mb-6">
    <div>
      <div class="flex items-center gap-2.5 mb-1">
        <div class="flex items-center justify-center w-9 h-9 rounded-2xl bg-linear-to-br from-brand-400 to-brand-600 shadow-sm shadow-brand-500/30 shrink-0">
          <QuoteIcon size={18} class="text-white" strokeWidth={2.2} />
        </div>
        <h1 class="text-xl font-bold text-surface-900 dark:text-surface-50">Quotes</h1>
      </div>
      <p class="text-[13px] text-surface-500 dark:text-surface-400 mt-1 ml-11.5">{filteredQuotes.length} of {quotes.length} quotes</p>
    </div>

    <button
      onclick={() => (modalOpen = true)}
      class="flex items-center gap-1.5 h-10 px-4 rounded-2xl bg-brand-500 hover:bg-brand-600 text-white text-[13px] font-semibold shadow-sm shadow-brand-500/25 transition-colors shrink-0"
    >
      <Plus size={16} strokeWidth={2.5} />
      Add quote
    </button>
  </div>

  <div class="relative mb-3">
    <Search size={16} class="absolute left-4 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none z-50" />
    <input
      type="text"
      bind:value={searchQuery}
      placeholder="Search quotes..."
      class="w-full h-11 pl-11 pr-4 rounded-2xl text-[13.5px] glass-inset border border-transparent text-surface-900 dark:text-surface-100 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 transition-all"
    />
  </div>

  <div class="flex flex-wrap items-center gap-2 mb-6">
    <Dropdown options={userOptions} bind:value={filterUser} />
    <Dropdown options={quoterOptions} bind:value={filterQuoter} />

    {#if allTags.length > 0}
      <Dropdown options={tagOptions} bind:value={filterTag} />
    {/if}

    <Dropdown options={sortOptions} bind:value={sortBy} />

    {#if myFavorites.length > 0}
      <button
        type="button"
        onclick={() => (filterFavorites = !filterFavorites)}
        class="flex items-center gap-1.5 h-9 px-3 rounded-xl text-[12px] font-medium transition-colors select-none {filterFavorites ? 'bg-red-500/10 text-red-500 dark:bg-red-500/20' : 'glass-inset text-surface-700 dark:text-surface-300 hover:bg-black/[0.06] dark:hover:bg-white/[0.08]'}"
      >
        <Heart size={14} fill={filterFavorites ? 'currentColor' : 'none'} class={filterFavorites ? 'text-red-500' : 'text-surface-400'} />
        <span>Favorites ({myFavorites.length})</span>
      </button>
    {/if}

    <label class="flex items-center gap-2 h-9 px-3 rounded-xl bg-surface-100 dark:bg-surface-800 cursor-pointer select-none">
      <span class="text-[12px] font-medium text-surface-700 dark:text-surface-300">Hide NSFW</span>
      <button
        type="button"
        onclick={() => (hideNsfw = !hideNsfw)}
        class="relative w-8 h-4.5 rounded-full transition-colors {hideNsfw ? 'bg-brand-500' : 'bg-surface-300 dark:bg-surface-600'}"
        aria-label="Toggle hide NSFW"
      >
        <span class="absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform {hideNsfw ? 'translate-x-3.5' : ''}"></span>
      </button>
    </label>

    {#if hasActiveFilters}
      <button
        onclick={clearFilters}
        class="flex items-center gap-1 px-2.5 h-9 rounded-xl text-[12px] font-medium text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 transition-colors"
      >
        <X size={13} />
        Clear
      </button>
    {/if}
  </div>

  {#if loading}
    <div class="columns-1 sm:columns-2 gap-4 space-y-4">
      {#each Array(4) as _}
        <div class="h-32 rounded-3xl bg-surface-100 dark:bg-surface-900 animate-pulse break-inside-avoid"></div>
      {/each}
    </div>
  {:else if filteredQuotes.length === 0}
    <div class="flex flex-col items-center justify-center py-20 text-center">
      <p class="text-[14px] font-medium text-surface-500 dark:text-surface-400">
        {quotes.length === 0 ? 'No quotes yet — add the first one!' : 'No quotes match your filters.'}
      </p>
    </div>
  {:else}
    <div class="columns-1 sm:columns-2 gap-4 *:mb-4">
      {#each visibleQuotes as quote (quote.id)}
        <div class="break-inside-avoid">
          <QuoteCard
            {quote}
            favoriteCount={favoriteCounts[quote.id] ?? 0}
            isFavorited={myFavorites.includes(quote.id)}
            canDelete={canDeleteQuote(quote)}
            commentCount={commentCounts[quote.id] ?? 0}
            onToggleFavorite={() => toggleFavorite(quote.id)}
            onDelete={() => deleteQuote(quote.id)}
            onTagClick={selectTag}
            onRemoveTag={(tag) => removeTagFromQuote(quote.id, tag)}
          />
        </div>
      {/each}
    </div>

    {#if hasMore}
      <div bind:this={sentinel} use:setupInfiniteScroll class="flex justify-center py-8">
        <div class="w-5 h-5 rounded-full border-2 border-surface-200 dark:border-surface-700 border-t-brand-500 animate-spin"></div>
      </div>
    {/if}
  {/if}
</div>

<QuoteModal
  bind:open={modalOpen}
  {members}
  {allTags}
  canManageTags={isRoomOwner}
  onCreated={loadData}
  onTagsSaved={registerNewTags}
  onDeleteTagFromDatabase={deleteTagFromAllQuotes}
/>