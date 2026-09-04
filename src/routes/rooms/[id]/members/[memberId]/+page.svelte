<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabase';
  import QuoteCard from '$lib/components/QuoteCard.svelte';
  import {
    ArrowLeft,
    Crown,
    Quote,
    Heart,
    MessageCircle,
    Sparkles,
    Star,
    UserMinus,
    X,
    Brain,
    Target,
    Trophy
  } from 'lucide-svelte';
  import type { QuoteWithDetails } from '$lib/database.types';
  import { summarizeQuizResults, QUIZ_MODE_LABELS, type QuizStats } from '$lib/database.types';

  const roomId = $derived(page.params.id!);
  const memberId = $derived(page.params.memberId!);

  let loading = $state(true);
  let notFound = $state(false);

  let memberName = $state('');
  let ownerId = $state('');
  let currentUserId = $state('');

  let addedQuotes = $state<QuoteWithDetails[]>([]);
  let favoriteCounts = $state<Record<string, number>>({});
  let commentCounts = $state<Record<string, number>>({});
  let myFavorites = $state<string[]>([]);
  let isRoomOwner = $state(false);

  // Stats about quotes where this person is the one being quoted (said_by)
  let quotedLineCount = $state(0);
  let quotedFavorites = $state(0);
  let bestQuoted = $state<{ text: string; favorites: number } | null>(null);
  let topTag = $state<string | null>(null);

  let removing = $state(false);
  let quizStats = $state<QuizStats>({ quizzesPlayed: 0, totalCorrect: 0, totalQuestions: 0, accuracy: 0, bestMode: null });

  const isTargetOwner = $derived(memberId === ownerId);
  const viewerIsOwner = $derived(currentUserId === ownerId);
  const isSelf = $derived(memberId === currentUserId);

  const totalFavoritesEarned = $derived(addedQuotes.reduce((sum, q) => sum + (favoriteCounts[q.id] ?? 0), 0));
  const totalCommentsEarned = $derived(addedQuotes.reduce((sum, q) => sum + (commentCounts[q.id] ?? 0), 0));
  const avgFavorites = $derived(addedQuotes.length > 0 ? totalFavoritesEarned / addedQuotes.length : 0);
  const bestAdded = $derived.by(() => {
    let best: { quote: QuoteWithDetails; favorites: number } | null = null;
    for (const q of addedQuotes) {
      const fav = favoriteCounts[q.id] ?? 0;
      if (!best || fav > best.favorites) best = { quote: q, favorites: fav };
    }
    return best;
  });

  function colorFromString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 60%)`;
  }

  async function loadData() {
    loading = true;
    notFound = false;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    currentUserId = user.id;

    const { data: roomData } = await supabase.from('rooms').select('owner_id').eq('id', roomId).single();
    ownerId = roomData?.owner_id ?? '';
    isRoomOwner = ownerId === user.id;

    const { data: memberRow, error: memberError } = await supabase
      .from('room_members')
      .select('user_id, users(id, first_name)')
      .eq('room_id', roomId)
      .eq('user_id', memberId)
      .maybeSingle();

    if (memberError || !memberRow || !memberRow.users) {
      notFound = true;
      loading = false;
      return;
    }

    const u = Array.isArray(memberRow.users) ? memberRow.users[0] : memberRow.users;
    memberName = u!.first_name;

    // Quotes this member added
    const { data: quotesData, error: quotesError } = await supabase
      .from('quotes')
      .select('*, adder:users!quotes_added_by_fkey(id, first_name)')
      .eq('room_id', roomId)
      .eq('added_by', memberId);

    if (quotesError) console.error('quotes load error', quotesError);

    addedQuotes = ((quotesData ?? []) as any[]).map((q) => ({
      ...q,
      adder: Array.isArray(q.adder) ? q.adder[0] : q.adder
    })) as QuoteWithDetails[];

    const addedQuoteIds = addedQuotes.map((q) => q.id);

    if (addedQuoteIds.length > 0) {
      const { data: favData } = await supabase
        .from('quote_favorites')
        .select('quote_id, user_id')
        .in('quote_id', addedQuoteIds);

      const fCounts: Record<string, number> = {};
      const mine: string[] = [];
      for (const row of favData ?? []) {
        fCounts[row.quote_id] = (fCounts[row.quote_id] ?? 0) + 1;
        if (row.user_id === user.id) mine.push(row.quote_id);
      }
      favoriteCounts = fCounts;
      myFavorites = mine;

      const { data: commentData } = await supabase
        .from('quote_comments')
        .select('quote_id')
        .in('quote_id', addedQuoteIds);

      const cCounts: Record<string, number> = {};
      for (const row of commentData ?? []) {
        cCounts[row.quote_id] = (cCounts[row.quote_id] ?? 0) + 1;
      }
      commentCounts = cCounts;
    } else {
      favoriteCounts = {};
      commentCounts = {};
      myFavorites = [];
    }

    // Stats about being quoted (said_by === memberName), across ALL quotes in the room
    const { data: allQuotesData, error: allQuotesError } = await supabase
      .from('quotes')
      .select('id, lines, tags, is_nsfw')
      .eq('room_id', roomId);

    if (allQuotesError) console.error('all quotes load error', allQuotesError);

    const allQuotes = allQuotesData ?? [];
    const allQuoteIds = allQuotes.map((q) => q.id);
    let favByQuoteId: Record<string, number> = {};

    if (allQuoteIds.length > 0) {
      const { data: allFavData } = await supabase
        .from('quote_favorites')
        .select('quote_id')
        .in('quote_id', allQuoteIds);

      for (const row of allFavData ?? []) {
        favByQuoteId[row.quote_id] = (favByQuoteId[row.quote_id] ?? 0) + 1;
      }
    }

    let lineCount = 0;
    let favSum = 0;
    let best: { text: string; favorites: number } | null = null;
    const tagCounts: Record<string, number> = {};

    for (const q of allQuotes as any[]) {
      const fav = favByQuoteId[q.id] ?? 0;
      let matchedThisQuote = false;
      for (const line of q.lines as { said_by: string; text: string }[]) {
        if (line.said_by.toLowerCase() === memberName.toLowerCase()) {
          matchedThisQuote = true;
          lineCount += 1;
          favSum += fav;
          if (!best || fav > best.favorites) {
            best = { text: line.text, favorites: fav };
          }
        }
      }
      if (matchedThisQuote) {
        for (const tag of (q.tags as string[]) ?? []) {
          tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
        }
      }
    }

    quotedLineCount = lineCount;
    quotedFavorites = favSum;
    bestQuoted = best;
    topTag = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    // Quiz stats for this member, within this room
    const { data: quizData, error: quizError } = await supabase
      .from('quiz_results')
      .select('mode, correct_count, total_count')
      .eq('room_id', roomId)
      .eq('user_id', memberId);

    if (quizError) console.error('quiz results load error', quizError);
    quizStats = summarizeQuizResults(quizData ?? []);

    loading = false;
  }

  async function toggleFavorite(quoteId: string) {
    const isFav = myFavorites.includes(quoteId);

    if (isFav) {
      myFavorites = myFavorites.filter((id) => id !== quoteId);
      favoriteCounts = { ...favoriteCounts, [quoteId]: Math.max(0, (favoriteCounts[quoteId] ?? 1) - 1) };
    } else {
      myFavorites = [...myFavorites, quoteId];
      favoriteCounts = { ...favoriteCounts, [quoteId]: (favoriteCounts[quoteId] ?? 0) + 1 };
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
    addedQuotes = addedQuotes.filter((q) => q.id !== quoteId);
  }

  function canDeleteQuote(quote: QuoteWithDetails): boolean {
    return isRoomOwner || quote.added_by === currentUserId;
  }

  async function removeMember() {
    const { error } = await supabase.from('room_members').delete().eq('room_id', roomId).eq('user_id', memberId);

    if (error) {
      console.error('Failed to remove member', error);
      return;
    }

    goto(`/rooms/${roomId}/members`);
  }

  onMount(loadData);
</script>

<svelte:head>
  <title>{memberName || 'Member'} · QuoteStash</title>
</svelte:head>

<div class="px-5 sm:px-8 py-8 sm:py-10 max-w-5xl">
  <a
    href="/rooms/{roomId}/members"
    class="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 transition-colors mb-6"
  >
    <ArrowLeft size={14} />
    All members
  </a>

  {#if loading}
    <div class="flex items-center gap-4 mb-8">
      <div class="w-16 h-16 rounded-3xl bg-surface-100 dark:bg-surface-900 animate-pulse"></div>
      <div class="flex flex-col gap-2">
        <div class="h-5 w-32 rounded-lg bg-surface-100 dark:bg-surface-900 animate-pulse"></div>
        <div class="h-3 w-24 rounded-lg bg-surface-100 dark:bg-surface-900 animate-pulse"></div>
      </div>
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
      {#each Array(4) as _}
        <div class="h-20 rounded-3xl bg-surface-100 dark:bg-surface-900 animate-pulse"></div>
      {/each}
    </div>
  {:else if notFound}
    <div class="flex flex-col items-center justify-center py-24 text-center px-4">
      <p class="text-[14px] font-medium text-surface-500 dark:text-surface-400">This member could not be found.</p>
    </div>
  {:else}
    <!-- Header -->
    <div class="flex items-start justify-between gap-4 mb-8">
      <div class="flex items-center gap-4 min-w-0">
        <div
            class="shrink-0 flex items-center justify-center rounded-3xl text-white text-[24px] font-bold shadow-sm"
            style="width: 4rem; height: 4rem; background-color: {colorFromString(memberName)};"
            >
          {memberName.charAt(0).toUpperCase()}
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-2 min-w-0">
            <h1 class="text-xl font-bold text-surface-900 dark:text-surface-50 truncate">{memberName}</h1>
            {#if isTargetOwner}
              <Crown size={16} class="text-amber-400 shrink-0" fill="currentColor" />
            {/if}
          </div>
          <p class="text-[13px] text-surface-500 dark:text-surface-400 mt-0.5">
            {#if isSelf}
              This is you
            {:else if isTargetOwner}
              Room owner
            {:else}
              Member of this room
            {/if}
          </p>
        </div>
      </div>

      {#if viewerIsOwner && !isTargetOwner}
        <div class="shrink-0">
          {#if removing}
            <div class="flex items-center gap-1">
              <button
                onclick={removeMember}
                class="text-[12px] font-bold text-white bg-red-500 hover:bg-red-600 active:scale-95 px-3 py-1.5 rounded-full transition-all whitespace-nowrap"
              >
                Confirm remove?
              </button>
              <button
                onclick={() => (removing = false)}
                aria-label="Cancel remove"
                class="p-1.5 rounded-full text-surface-400 hover:text-surface-600 dark:hover:text-surface-300"
              >
                <X size={16} />
              </button>
            </div>
          {:else}
            <button
              onclick={() => (removing = true)}
              class="flex items-center gap-1.5 h-9 px-3 rounded-xl text-[12.5px] font-semibold text-red-500 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors whitespace-nowrap"
            >
              <UserMinus size={14} />
              Remove
            </button>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Quoter stats -->
    <div class="mb-3 flex items-center gap-2">
      <Quote size={14} class="text-brand-500" />
      <h2 class="text-[13px] font-bold text-surface-700 dark:text-surface-200 uppercase tracking-wide">As a quoter</h2>
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
      <div class="flex flex-col items-center justify-center gap-1 p-4 rounded-3xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800">
        <div class="flex items-center gap-1.5 text-brand-500">
          <Quote size={14} />
          <span class="text-[18px] font-extrabold text-surface-900 dark:text-surface-50">{addedQuotes.length}</span>
        </div>
        <span class="text-[10px] font-medium text-surface-400 uppercase tracking-wide">Quotes added</span>
      </div>
      <div class="flex flex-col items-center justify-center gap-1 -4 rounded-3xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800">
        <div class="flex items-center gap-1.5 text-red-400">
          <Heart size={14} fill="currentColor" />
          <span class="text-[18px] font-extrabold text-surface-900 dark:text-surface-50">{totalFavoritesEarned}</span>
        </div>
        <span class="text-[10px] font-medium text-surface-400 uppercase tracking-wide">Likes earned</span>
      </div>
      <div class="flex flex-col items-center justify-center gap-1 p-4 rounded-3xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800">
        <div class="flex items-center gap-1.5 text-surface-400">
          <MessageCircle size={14} />
          <span class="text-[18px] font-extrabold text-surface-900 dark:text-surface-50">{totalCommentsEarned}</span>
        </div>
        <span class="text-[10px] font-medium text-surface-400 uppercase tracking-wide">Comments earned</span>
      </div>
      <div class="flex flex-col items-center justify-center gap-1 p-4 rounded-3xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800">
        <div class="flex items-center gap-1.5 text-amber-500">
          <Sparkles size={14} />
          <span class="text-[18px] font-extrabold text-surface-900 dark:text-surface-50">{avgFavorites.toFixed(1)}</span>
        </div>
        <span class="text-[10px] font-medium text-surface-400 uppercase tracking-wide">Avg likes/quote</span>
      </div>
    </div>

    {#if bestAdded}
      <div class="mb-8 p-4 rounded-3xl bg-surface-50 dark:bg-surface-800 border border-surface-100 dark:border-surface-800">
        <p class="text-[11px] font-semibold text-surface-400 uppercase tracking-wide mb-1.5">Their most popular addition</p>
        {#each bestAdded.quote.lines.slice(0, 1) as line}
          <p class="text-[13.5px] font-medium text-surface-800 dark:text-surface-100 leading-snug wrap-break-word">
            "{line.text}" <span class="text-surface-400 dark:text-surface-500 font-normal">— {line.said_by}</span>
          </p>
        {/each}
      </div>
    {/if}

    <!-- Quoted stats -->
    <div class="mb-3 flex items-center gap-2">
      <Star size={14} class="text-amber-500" />
      <h2 class="text-[13px] font-bold text-surface-700 dark:text-surface-200 uppercase tracking-wide">As someone quoted</h2>
    </div>

    {#if quotedLineCount === 0}
      <p class="text-[13px] text-surface-400 dark:text-surface-500 mb-8">No one has quoted {memberName} yet.</p>
    {:else}
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <div class="flex flex-col items-center justify-center gap-1 p-4 rounded-3xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800">
          <div class="flex items-center gap-1.5 text-brand-500">
            <Quote size={14} />
            <span class="text-[18px] font-extrabold text-surface-900 dark:text-surface-50">{quotedLineCount}</span>
          </div>
          <span class="text-[10px] font-medium text-surface-400 uppercase tracking-wide">Times quoted</span>
        </div>
        <div class="flex flex-col items-center justify-center gap-1 p-4 rounded-3xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800">
          <div class="flex items-center gap-1.5 text-red-400">
            <Heart size={14} fill="currentColor" />
            <span class="text-[18px] font-extrabold text-surface-900 dark:text-surface-50">{quotedFavorites}</span>
          </div>
          <span class="text-[10px] font-medium text-surface-400 uppercase tracking-wide">Total likes</span>
        </div>
        <div class="flex flex-col items-center justify-center gap-1 p-4 rounded-3xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800">
          <div class="flex items-center gap-1.5 text-amber-500">
            <Sparkles size={14} />
            <span class="text-[18px] font-extrabold text-surface-900 dark:text-surface-50">{(quotedFavorites / quotedLineCount).toFixed(1)}</span>
          </div>
          <span class="text-[10px] font-medium text-surface-400 uppercase tracking-wide">Avg likes/line</span>
        </div>
      </div>

      {#if topTag}
        <div class="flex items-center gap-1.5 mb-4">
          <span
            class="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-lg"
            style:color={colorFromString(topTag)}
            style:background-color={`${colorFromString(topTag)}17`}
          >
            #{topTag}
          </span>
          <span class="text-[11px] text-surface-400">is their signature tag</span>
        </div>
      {/if}

      {#if bestQuoted}
        <div class="mb-8 p-4 rounded-3xl bg-surface-50 dark:bg-surface-800 border border-surface-100 dark:border-surface-800">
          <p class="text-[11px] font-semibold text-surface-400 uppercase tracking-wide mb-1.5">Most loved line</p>
          <p class="text-[13.5px] font-medium text-surface-800 dark:text-surface-100 leading-snug wrap-break-word">"{bestQuoted.text}"</p>
        </div>
      {/if}
    {/if}

    <!-- Quiz stats -->
    <div class="mb-3 flex items-center gap-2">
      <Brain size={14} class="text-emerald-500" />
      <h2 class="text-[13px] font-bold text-surface-700 dark:text-surface-200 uppercase tracking-wide">Quiz performance</h2>
    </div>

    {#if quizStats.quizzesPlayed === 0}
      <p class="text-[13px] text-surface-400 dark:text-surface-500 mb-8">{memberName} hasn't taken the quiz yet.</p>
    {:else}
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <div class="flex flex-col items-center justify-center gap-1 p-4 rounded-3xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800">
          <div class="flex items-center gap-1.5 text-brand-500">
            <Trophy size={14} />
            <span class="text-[18px] font-extrabold text-surface-900 dark:text-surface-50">{quizStats.quizzesPlayed}</span>
          </div>
          <span class="text-[10px] font-medium text-surface-400 uppercase tracking-wide">Quizzes played</span>
        </div>
        <div class="flex flex-col items-center justify-center gap-1 p-4 rounded-3xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800">
          <div class="flex items-center gap-1.5 text-emerald-500">
            <Target size={14} />
            <span class="text-[18px] font-extrabold text-surface-900 dark:text-surface-50">{quizStats.accuracy.toFixed(0)}%</span>
          </div>
          <span class="text-[10px] font-medium text-surface-400 uppercase tracking-wide">Accuracy</span>
        </div>
        <div class="flex flex-col items-center justify-center gap-1 p-4 rounded-3xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800">
          <div class="flex items-center gap-1.5 text-surface-400">
            <Brain size={14} />
            <span class="text-[18px] font-extrabold text-surface-900 dark:text-surface-50">{quizStats.totalCorrect}/{quizStats.totalQuestions}</span>
          </div>
          <span class="text-[10px] font-medium text-surface-400 uppercase tracking-wide">Correct answers</span>
        </div>
        <div class="flex flex-col items-center justify-center gap-1 p-4 rounded-3xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800">
          <div class="flex items-center gap-1.5 text-amber-500">
            <Sparkles size={14} />
            <span class="text-[13px] font-extrabold text-surface-900 dark:text-surface-50 truncate">
              {quizStats.bestMode ? QUIZ_MODE_LABELS[quizStats.bestMode] : '—'}
            </span>
          </div>
          <span class="text-[10px] font-medium text-surface-400 uppercase tracking-wide">Best mode</span>
        </div>
      </div>
    {/if}

    <!-- Quotes added by this member -->
    <div class="mb-3 flex items-center gap-2">
      <Quote size={14} class="text-surface-400" />
      <h2 class="text-[13px] font-bold text-surface-700 dark:text-surface-200 uppercase tracking-wide">
        Quotes added by {memberName}
      </h2>
    </div>

    {#if addedQuotes.length === 0}
      <p class="text-[13px] text-surface-400 dark:text-surface-500">No quotes added yet.</p>
    {:else}
      <div class="columns-1 sm:columns-2 gap-4 *:mb-4">
        {#each addedQuotes as quote (quote.id)}
          <div class="break-inside-avoid">
            <QuoteCard
              {quote}
              favoriteCount={favoriteCounts[quote.id] ?? 0}
              isFavorited={myFavorites.includes(quote.id)}
              canDelete={canDeleteQuote(quote)}
              commentCount={commentCounts[quote.id] ?? 0}
              onToggleFavorite={() => toggleFavorite(quote.id)}
              onDelete={() => deleteQuote(quote.id)}
              onTagClick={() => {}}
            />
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>