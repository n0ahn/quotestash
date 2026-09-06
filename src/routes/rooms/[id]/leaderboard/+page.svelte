<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { supabase } from '$lib/supabase';
  import {
    Trophy,
    Heart,
    MessageCircle,
    Quote,
    Flame,
    Sparkles,
    Star,
    Crown,
    Medal,
    Brain,
    Target,
    Maximize2,
    Minimize2
  } from 'lucide-svelte';
  import type { QuoteWithDetails } from '$lib/database.types';

  const roomId = $derived(page.params.id!);

  type Tab = 'quotes' | 'quoted' | 'quoters' | 'quiz';
  let activeTab = $state<Tab>('quotes');

  type QuotesSort = 'likes' | 'comments' | 'longest' | 'shortest';
  type QuotedSort = 'likes' | 'comments';
  type QuotersSort = 'quotes' | 'likes';

  let quotesSort = $state<QuotesSort>('likes');
  let quotedSort = $state<QuotedSort>('likes');
  let quotersSort = $state<QuotersSort>('quotes');

  const subTabs: {
    quotes: { id: QuotesSort; label: string; icon: typeof Heart }[];
    quoted: { id: QuotedSort; label: string; icon: typeof Heart }[];
    quoters: { id: QuotersSort; label: string; icon: typeof Heart }[];
  } = {
    quotes: [
      { id: 'likes', label: 'Likes', icon: Heart },
      { id: 'comments', label: 'Comments', icon: MessageCircle },
      { id: 'longest', label: 'Longest', icon: Maximize2 },
      { id: 'shortest', label: 'Shortest', icon: Minimize2 }
    ],
    quoted: [
      { id: 'likes', label: 'Likes', icon: Heart },
      { id: 'comments', label: 'Comments', icon: MessageCircle }
    ],
    quoters: [
      { id: 'quotes', label: 'Quotes', icon: Quote },
      { id: 'likes', label: 'Likes', icon: Heart }
    ]
  };

  let loading = $state(true);
  let quotes = $state<QuoteWithDetails[]>([]);
  let favoriteCounts = $state<Record<string, number>>({});
  let commentCounts = $state<Record<string, number>>({});
  let quizRows = $state<{ user_id: string; correct_count: number; total_count: number }[]>([]);
  let memberNames = $state<Record<string, string>>({});

  const tabs: { id: Tab; label: string; icon: typeof Trophy }[] = [
    { id: 'quotes', label: 'Top quotes', icon: Quote },
    { id: 'quoted', label: 'Top quoted people', icon: Star },
    { id: 'quoters', label: 'Top quoters', icon: Flame },
    { id: 'quiz', label: 'Quiz whizzes', icon: Brain }
  ];

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

    const { data: quotesData } = await supabase
      .from('quotes')
      .select('*, adder:users!quotes_added_by_fkey(id, first_name)')
      .eq('room_id', roomId);

    quotes = ((quotesData ?? []) as any[]).map((q) => ({
      ...q,
      adder: Array.isArray(q.adder) ? q.adder[0] : q.adder
    })) as QuoteWithDetails[];

    const quoteIds = quotes.map((q) => q.id);

    if (quoteIds.length > 0) {
      const { data: favData } = await supabase
        .from('quote_favorites')
        .select('quote_id, user_id')
        .in('quote_id', quoteIds);

      const fCounts: Record<string, number> = {};
      for (const row of favData ?? []) {
        fCounts[row.quote_id] = (fCounts[row.quote_id] ?? 0) + 1;
      }
      favoriteCounts = fCounts;

      const { data: commentData } = await supabase
        .from('quote_comments')
        .select('quote_id')
        .in('quote_id', quoteIds);

      const cCounts: Record<string, number> = {};
      for (const row of commentData ?? []) {
        cCounts[row.quote_id] = (cCounts[row.quote_id] ?? 0) + 1;
      }
      commentCounts = cCounts;
    } else {
      favoriteCounts = {};
      commentCounts = {};
    }

    const { data: membersData, error: membersError } = await supabase
      .from('room_members')
      .select('user_id, users(id, first_name)')
      .eq('room_id', roomId);

    if (membersError) console.error('members load error', membersError);

    const names: Record<string, string> = {};
    for (const m of (membersData ?? []) as any[]) {
      const u = Array.isArray(m.users) ? m.users[0] : m.users;
      if (u) names[u.id] = u.first_name;
    }
    memberNames = names;

    const { data: quizData, error: quizError } = await supabase
      .from('quiz_results')
      .select('user_id, correct_count, total_count')
      .eq('room_id', roomId);

    if (quizError) console.error('quiz results load error', quizError);
    quizRows = quizData ?? [];

    loading = false;
  }

  // ---------- Top quotes ----------
  const topQuotes = $derived.by(() => {
    const withStats = [...quotes].map((q) => ({
      quote: q,
      favorites: favoriteCounts[q.id] ?? 0,
      comments: commentCounts[q.id] ?? 0,
      length: q.lines.reduce((sum, line) => sum + line.text.length, 0)
    }));

    let filtered = withStats;
    let sorted: typeof withStats;

    if (quotesSort === 'likes') {
      filtered = withStats.filter((x) => x.favorites > 0);
      sorted = filtered.sort((a, b) => b.favorites - a.favorites);
    } else if (quotesSort === 'comments') {
      filtered = withStats.filter((x) => x.comments > 0);
      sorted = filtered.sort((a, b) => b.comments - a.comments);
    } else if (quotesSort === 'longest') {
      sorted = filtered.sort((a, b) => b.length - a.length);
    } else {
      sorted = filtered.sort((a, b) => a.length - b.length);
    }

    return sorted.slice(0, 10);
  });

  // ---------- Top quoted people (said_by) ----------
  type QuotedStat = {
    name: string;
    quoteCount: number;
    totalFavorites: number;
    totalComments: number;
    tagCounts: Record<string, number>;
    bestQuote: { text: string; favorites: number } | null;
    nsfwCount: number;
  };

  const topQuoted = $derived.by(() => {
    const map = new Map<string, QuotedStat>();

    for (const q of quotes) {
      const fav = favoriteCounts[q.id] ?? 0;
      const com = commentCounts[q.id] ?? 0;
      const seenInThisQuote = new Set<string>();

      for (const line of q.lines) {
        const name = line.said_by;
        if (seenInThisQuote.has(name)) continue;
        seenInThisQuote.add(name);

        if (!map.has(name)) {
          map.set(name, {
            name,
            quoteCount: 0,
            totalFavorites: 0,
            totalComments: 0,
            tagCounts: {},
            bestQuote: null,
            nsfwCount: 0
          });
        }
        const stat = map.get(name)!;
        stat.quoteCount += 1;
        stat.totalFavorites += fav;
        stat.totalComments += com;
        if (q.is_nsfw) stat.nsfwCount += 1;
        for (const tag of q.tags ?? []) {
          stat.tagCounts[tag] = (stat.tagCounts[tag] ?? 0) + 1;
        }
        if (!stat.bestQuote || fav > stat.bestQuote.favorites) {
          stat.bestQuote = { text: line.text, favorites: fav };
        }
      }
    }

    return Array.from(map.values())
      .sort((a, b) =>
        quotedSort === 'comments'
          ? b.totalComments - a.totalComments || b.totalFavorites - a.totalFavorites
          : b.totalFavorites - a.totalFavorites || b.quoteCount - a.quoteCount
      )
      .map((s) => ({
        ...s,
        topTag: Object.entries(s.tagCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
        avgFavorites: s.quoteCount > 0 ? s.totalFavorites / s.quoteCount : 0
      }));
  });

  // ---------- Top quoters (added_by) ----------
  type QuoterStat = {
    id: string;
    name: string;
    quoteCount: number;
    totalFavoritesEarned: number;
    totalCommentsEarned: number;
    tagCounts: Record<string, number>;
    peopleQuoted: Set<string>;
  };

  const topQuoters = $derived.by(() => {
    const map = new Map<string, QuoterStat>();

    for (const q of quotes) {
      if (!q.adder) continue;
      const id = q.adder.id;
      const fav = favoriteCounts[q.id] ?? 0;
      const com = commentCounts[q.id] ?? 0;

      if (!map.has(id)) {
        map.set(id, {
          id,
          name: q.adder.first_name,
          quoteCount: 0,
          totalFavoritesEarned: 0,
          totalCommentsEarned: 0,
          tagCounts: {},
          peopleQuoted: new Set()
        });
      }
      const stat = map.get(id)!;
      stat.quoteCount += 1;
      stat.totalFavoritesEarned += fav;
      stat.totalCommentsEarned += com;
      for (const tag of q.tags ?? []) {
        stat.tagCounts[tag] = (stat.tagCounts[tag] ?? 0) + 1;
      }
      for (const line of q.lines) {
        stat.peopleQuoted.add(line.said_by);
      }
    }

    return Array.from(map.values())
      .sort((a, b) =>
        quotersSort === 'likes'
          ? b.totalFavoritesEarned - a.totalFavoritesEarned || b.quoteCount - a.quoteCount
          : b.quoteCount - a.quoteCount || b.totalFavoritesEarned - a.totalFavoritesEarned
      )
      .map((s) => ({
        ...s,
        topTag: Object.entries(s.tagCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
        avgFavorites: s.quoteCount > 0 ? s.totalFavoritesEarned / s.quoteCount : 0
      }));
  });

  // ---------- Quiz whizzes ----------
  type QuizStat = {
    id: string;
    name: string;
    quizzesPlayed: number;
    totalCorrect: number;
    totalQuestions: number;
    accuracy: number;
  };

  const topQuizzers = $derived.by(() => {
    const map = new Map<string, QuizStat>();

    for (const row of quizRows) {
      const name = memberNames[row.user_id];
      if (!name) continue;

      if (!map.has(row.user_id)) {
        map.set(row.user_id, {
          id: row.user_id,
          name,
          quizzesPlayed: 0,
          totalCorrect: 0,
          totalQuestions: 0,
          accuracy: 0
        });
      }
      const stat = map.get(row.user_id)!;
      stat.quizzesPlayed += 1;
      stat.totalCorrect += row.correct_count;
      stat.totalQuestions += row.total_count;
    }

    return Array.from(map.values())
      .map((s) => ({ ...s, accuracy: s.totalQuestions > 0 ? (s.totalCorrect / s.totalQuestions) * 100 : 0 }))
      .sort((a, b) => b.accuracy - a.accuracy || b.totalQuestions - a.totalQuestions);
  });

  const medalStyles = [
    { bg: 'bg-gradient-to-br from-amber-300 to-amber-500', ring: 'ring-amber-300/50' },
    { bg: 'bg-gradient-to-br from-slate-300 to-slate-400', ring: 'ring-slate-300/50' },
    { bg: 'bg-gradient-to-br from-orange-400 to-orange-600', ring: 'ring-orange-400/50' }
  ];
  const medalLineColors = ['#f59e0b', '#94a3b8', '#f97316'];

  onMount(loadData);
</script>

<svelte:head>
  <title>Leaderboard · QuoteStash</title>
</svelte:head>

<div class="px-5 sm:px-8 py-8 sm:py-10 max-w-4xl">
  <div class="flex items-center gap-2.5 mb-1">
    <div class="flex items-center justify-center w-9 h-9 rounded-2xl bg-linear-to-br from-amber-400 to-orange-500 shadow-sm shadow-amber-500/30 shrink-0">
      <Trophy size={18} class="text-white" strokeWidth={2.2} />
    </div>
    <h1 class="text-xl font-bold text-surface-900 dark:text-surface-50">Leaderboard</h1>
  </div>
  <p class="text-[13px] text-surface-500 dark:text-surface-400 mt-1 ml-11.5">Who's stealing the show in this room?</p>

  <!-- Tabs -->
  <div class="flex items-center gap-1 mt-7 mb-4 p-1 rounded-2xl glass-chrome w-fit max-w-full overflow-x-auto">
    {#each tabs as tab (tab.id)}
      <button
        onclick={() => (activeTab = tab.id)}
        class="flex items-center gap-1.5 px-3.5 sm:px-4 h-9 rounded-xl text-[12.5px] font-semibold whitespace-nowrap transition-all shrink-0 {activeTab === tab.id
          ? 'bg-white dark:bg-surface-950 text-brand-500 shadow-sm'
          : 'text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200'}"
      >
        <tab.icon size={14} strokeWidth={2.3} />
        {tab.label}
      </button>
    {/each}
  </div>

  <!-- Sub-tabs (sort by) -->
  {#if activeTab === 'quotes' || activeTab === 'quoted' || activeTab === 'quoters'}
    <div class="flex items-center gap-1.5 mb-7 flex-wrap">
      {#each subTabs[activeTab] as sub (sub.id)}
        {@const active =
          (activeTab === 'quotes' && quotesSort === sub.id) ||
          (activeTab === 'quoted' && quotedSort === sub.id) ||
          (activeTab === 'quoters' && quotersSort === sub.id)}
        <button
          onclick={() => {
            if (activeTab === 'quotes') quotesSort = sub.id as QuotesSort;
            else if (activeTab === 'quoted') quotedSort = sub.id as QuotedSort;
            else quotersSort = sub.id as QuotersSort;
          }}
          class="flex items-center gap-1.5 px-3 h-7.5 rounded-full text-[11.5px] font-semibold whitespace-nowrap transition-colors border {active
            ? 'bg-brand-500/10 text-brand-500 border-brand-500/30'
            : 'text-surface-400 dark:text-surface-500 border-surface-200 dark:border-surface-800 hover:text-surface-600 dark:hover:text-surface-300'}"
        >
          <sub.icon size={12} strokeWidth={2.3} />
          {sub.label}
        </button>
      {/each}
    </div>
  {/if}

  {#if loading}
    <div class="space-y-3">
      {#each Array(5) as _}
        <div class="h-20 rounded-3xl bg-surface-100 dark:bg-surface-900 animate-pulse"></div>
      {/each}
    </div>
  {:else if activeTab === 'quotes'}
    <!-- ============ TOP QUOTES (by favorites) ============ -->
    {#if topQuotes.length === 0}
      <div class="flex flex-col items-center justify-center py-24 text-center px-4">
        <Sparkles size={28} class="text-surface-300 dark:text-surface-700 mb-3" />
        <p class="text-[14px] font-medium text-surface-500 dark:text-surface-400">
          {quotesSort === 'likes'
            ? 'No favorites yet — go like some quotes!'
            : quotesSort === 'comments'
              ? 'No comments yet — start the conversation!'
              : 'No quotes yet.'}
        </p>
      </div>
    {:else}
      <div class="flex flex-col gap-3">
        {#each topQuotes as entry, i (entry.quote.id)}
          {@const accentColor = entry.quote.color || colorFromString(entry.quote.id)}
          <a
            href="/rooms/{roomId}/quotes/{entry.quote.id}"
            class="group relative flex gap-3 sm:gap-4 p-4 sm:p-5 rounded-3xl glass hover:shadow-[0_8px_30px_-6px_rgba(0,0,0,0.10)] dark:hover:shadow-[0_8px_30px_-6px_rgba(0,0,0,0.4)] hover:-translate-y-0.5 transition-all duration-200 overflow-hidden"
          >
            <div
              class="absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-[3px] rounded-full blur-[1px] opacity-70"
              style="background: linear-gradient(90deg, transparent, {accentColor}, transparent);"
            ></div>

            <div class="shrink-0 flex flex-col items-center justify-center w-8 sm:w-10">
              {#if i < 3}
                <div class="flex items-center justify-center w-8 h-8 rounded-full {medalStyles[i].bg} shadow-sm ring-4 {medalStyles[i].ring}">
                  <span class="text-[12px] font-extrabold text-white">{i + 1}</span>
                </div>
              {:else}
                <span class="text-[13px] font-bold text-surface-300 dark:text-surface-600">#{i + 1}</span>
              {/if}
            </div>

            <div class="flex-1 min-w-0 flex flex-col gap-2.5">
              <div class="flex flex-col gap-2">
                {#each entry.quote.lines.slice(0, 2) as line, li (li)}
                  <div class="flex items-start gap-2 min-w-0">
                    <div
                      class="shrink-0 flex items-center justify-center w-5 h-5 rounded-full text-white text-[9px] font-bold mt-0.5"
                      style="background-color: {colorFromString(line.said_by)};"
                    >
                      {line.said_by.charAt(0).toUpperCase()}
                    </div>
                    <p class="min-w-0 flex-1 text-[13px] font-medium text-surface-800 dark:text-surface-100 leading-snug wrap-break-word">
                      "{line.text}" 
                    </p>
                  </div>
                  <p class="text-surface-400 dark:text-surface-500 font-normal text-sm">— {line.said_by}</p>
                {/each}
                {#if entry.quote.lines.length > 2}
                  <p class="text-[11px] text-surface-400 pl-7">+{entry.quote.lines.length - 2} more...</p>
                {/if}
              </div>

              <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-surface-400 dark:text-surface-500">
                <div class="flex items-center gap-1 shrink-0" title="Favorites">
                  <Heart size={14} class="text-red-400" fill="currentColor" />
                  <span class="text-[12px] font-bold text-surface-600 dark:text-surface-300">{entry.favorites}</span>
                </div>
                <div class="flex items-center gap-1 shrink-0" title="Comments">
                  <MessageCircle size={14} />
                  <span class="text-[12px] font-semibold">{entry.comments}</span>
                </div>
                {#if entry.quote.adder?.first_name}
                  <span class="text-[11px] font-medium truncate">Added by <span class="text-surface-500 dark:text-surface-400">{entry.quote.adder.first_name}</span></span>
                {/if}
              </div>
            </div>
          </a>
        {/each}
      </div>
    {/if}
  {:else if activeTab === 'quoted'}
    <!-- ============ TOP QUOTED PEOPLE ============ -->
    {#if topQuoted.length === 0}
      <div class="flex flex-col items-center justify-center py-24 text-center px-4">
        <Star size={28} class="text-surface-300 dark:text-surface-700 mb-3" />
        <p class="text-[14px] font-medium text-surface-500 dark:text-surface-400">No one has been quoted yet.</p>
      </div>
    {:else}
      <div class="grid gap-3 sm:grid-cols-2">
        {#each topQuoted as person, i (person.name)}
          <div class="relative flex flex-col gap-3 p-5 rounded-3xl glass hover:shadow-[0_8px_30px_-6px_rgba(0,0,0,0.10)] dark:hover:shadow-[0_8px_30px_-6px_rgba(0,0,0,0.4)] transition-all duration-200 overflow-hidden">
            {#if i < 3}
              <div
                class="absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-[3px] rounded-full blur-[1px] opacity-70"
                style="background: linear-gradient(90deg, transparent, {medalLineColors[i]}, transparent);"
              ></div>
            {/if}

            <div class="flex items-center gap-3 min-w-0">
              <div class="relative shrink-0">
                <div
                  class="flex items-center justify-center w-12 h-12 rounded-2xl text-white text-[16px] font-bold shadow-sm"
                  style="background-color: {colorFromString(person.name)};"
                >
                  {person.name.charAt(0).toUpperCase()}
                </div>
                {#if i < 3}
                  <div class="absolute -bottom-1.5 -right-1.5 flex items-center justify-center w-5 h-5 rounded-full {medalStyles[i].bg} ring-2 ring-white dark:ring-surface-900">
                    {#if i === 0}
                      <Crown size={11} class="text-white" fill="currentColor" />
                    {:else}
                      <Medal size={10} class="text-white" fill="currentColor" />
                    {/if}
                  </div>
                {/if}
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-[15px] font-bold text-surface-900 dark:text-surface-50 truncate">{person.name}</p>
                <p class="text-[11.5px] text-surface-400 dark:text-surface-500 font-medium truncate">
                  {person.quoteCount} {person.quoteCount === 1 ? 'quote' : 'quotes'}
                  {#if person.nsfwCount > 0}
                    · {person.nsfwCount} nsfw 🌶️
                  {/if}
                </p>
              </div>
            </div>

            <div class="grid grid-cols-3 gap-2">
              <div class="flex flex-col items-center justify-center gap-0.5 py-2 rounded-2xl glass-inset">
                <div class="flex items-center gap-1 text-red-400">
                  <Heart size={12} fill="currentColor" />
                  <span class="text-[13px] font-extrabold text-surface-800 dark:text-surface-100">{person.totalFavorites}</span>
                </div>
                <span class="text-[9px] font-medium text-surface-400 uppercase tracking-wide">Likes</span>
              </div>
              <div class="flex flex-col items-center justify-center gap-0.5 py-2 rounded-2xl glass-inset">
                <div class="flex items-center gap-1 text-surface-400">
                  <MessageCircle size={12} />
                  <span class="text-[13px] font-extrabold text-surface-800 dark:text-surface-100">{person.totalComments}</span>
                </div>
                <span class="text-[9px] font-medium text-surface-400 uppercase tracking-wide">Comments</span>
              </div>
              <div class="flex flex-col items-center justify-center gap-0.5 py-2 rounded-2xl glass-inset">
                <div class="flex items-center gap-1 text-amber-500">
                  <Sparkles size={12} />
                  <span class="text-[13px] font-extrabold text-surface-800 dark:text-surface-100">{person.avgFavorites.toFixed(1)}</span>
                </div>
                <span class="text-[9px] font-medium text-surface-400 uppercase tracking-wide">Avg/quote</span>
              </div>
            </div>

            {#if person.topTag}
              <div class="flex items-center gap-1.5 min-w-0">
                <span
                  class="shrink-0 text-[10.5px] font-semibold px-2 py-0.5 rounded-lg"
                  style:color={colorFromString(person.topTag)}
                  style:background-color={`${colorFromString(person.topTag)}17`}
                >
                  #{person.topTag}
                </span>
                <span class="text-[10.5px] text-surface-400 truncate">is their signature tag</span>
              </div>
            {/if}

            {#if person.bestQuote}
              <div class="pt-2.5 border-t border-surface-100 dark:border-surface-800/70">
                <p class="text-[11px] text-surface-400 dark:text-surface-500 font-medium mb-0.5">Most loved line</p>
                <p class="text-[12.5px] text-surface-600 dark:text-surface-300 italic leading-snug wrap-break-word">"{person.bestQuote.text}"</p>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {:else if activeTab === 'quiz'}
    <!-- ============ QUIZ WHIZZES ============ -->
    {#if topQuizzers.length === 0}
      <div class="flex flex-col items-center justify-center py-24 text-center px-4">
        <Brain size={28} class="text-surface-300 dark:text-surface-700 mb-3" />
        <p class="text-[14px] font-medium text-surface-500 dark:text-surface-400">No quizzes played yet — be the first!</p>
        <a
          href="/rooms/{roomId}/quiz"
          class="mt-4 flex items-center gap-1.5 h-9 px-4 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-[12.5px] font-semibold shadow-sm shadow-brand-500/25 transition-colors"
        >
          Take the quiz
        </a>
      </div>
    {:else}
      <div class="flex flex-col gap-3">
        {#each topQuizzers as quizzer, i (quizzer.id)}
          <div class="relative flex flex-col sm:flex-row sm:items-center gap-4 p-5 rounded-3xl glass hover:shadow-[0_8px_30px_-6px_rgba(0,0,0,0.10)] dark:hover:shadow-[0_8px_30px_-6px_rgba(0,0,0,0.4)] transition-all duration-200 overflow-hidden">
            {#if i < 3}
              <div
                class="absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-[3px] rounded-full blur-[1px] opacity-70"
                style="background: linear-gradient(90deg, transparent, {medalLineColors[i]}, transparent);"
              ></div>
            {/if}

            <div class="flex items-center gap-3 sm:w-52 shrink-0 min-w-0">
              <div class="shrink-0 flex items-center justify-center w-7 h-7">
                {#if i < 3}
                  <div class="flex items-center justify-center w-7 h-7 rounded-full {medalStyles[i].bg} shadow-sm">
                    <span class="text-[11px] font-extrabold text-white">{i + 1}</span>
                  </div>
                {:else}
                  <span class="text-[13px] font-bold text-surface-300 dark:text-surface-600">#{i + 1}</span>
                {/if}
              </div>
              <div
                class="shrink-0 flex items-center justify-center w-10 h-10 rounded-2xl text-white text-[14px] font-bold shadow-sm"
                style="background-color: {colorFromString(quizzer.name)};"
              >
                {quizzer.name.charAt(0).toUpperCase()}
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-[14px] font-bold text-surface-900 dark:text-surface-50 truncate">{quizzer.name}</p>
                <p class="text-[11px] text-surface-400 dark:text-surface-500 font-medium truncate">
                  {quizzer.quizzesPlayed} {quizzer.quizzesPlayed === 1 ? 'quiz' : 'quizzes'} played
                </p>
              </div>
            </div>

            <div class="flex-1 grid grid-cols-3 gap-2 min-w-0">
              <div class="flex flex-col items-center justify-center gap-0.5 py-2 rounded-2xl glass-inset">
                <div class="flex items-center gap-1 text-brand-500">
                  <Target size={12} />
                  <span class="text-[13px] font-extrabold text-surface-800 dark:text-surface-100">{quizzer.accuracy.toFixed(0)}%</span>
                </div>
                <span class="text-[9px] font-medium text-surface-400 uppercase tracking-wide">Accuracy</span>
              </div>
              <div class="flex flex-col items-center justify-center gap-0.5 py-2 rounded-2xl glass-inset">
                <div class="flex items-center gap-1 text-emerald-500">
                  <Brain size={12} />
                  <span class="text-[13px] font-extrabold text-surface-800 dark:text-surface-100">{quizzer.totalCorrect}</span>
                </div>
                <span class="text-[9px] font-medium text-surface-400 uppercase tracking-wide">Correct</span>
              </div>
              <div class="flex flex-col items-center justify-center gap-0.5 py-2 rounded-2xl glass-inset">
                <div class="flex items-center gap-1 text-surface-400">
                  <Sparkles size={12} />
                  <span class="text-[13px] font-extrabold text-surface-800 dark:text-surface-100">{quizzer.totalQuestions}</span>
                </div>
                <span class="text-[9px] font-medium text-surface-400 uppercase tracking-wide">Answered</span>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {:else}
    <!-- ============ TOP QUOTERS ============ -->
    {#if topQuoters.length === 0}
      <div class="flex flex-col items-center justify-center py-24 text-center px-4">
        <Flame size={28} class="text-surface-300 dark:text-surface-700 mb-3" />
        <p class="text-[14px] font-medium text-surface-500 dark:text-surface-400">No one has added a quote yet.</p>
      </div>
    {:else}
      <div class="flex flex-col gap-3">
        {#each topQuoters as quoter, i (quoter.id)}
          <div class="relative flex flex-col sm:flex-row sm:items-center gap-4 p-5 rounded-3xl glass hover:shadow-[0_8px_30px_-6px_rgba(0,0,0,0.10)] dark:hover:shadow-[0_8px_30px_-6px_rgba(0,0,0,0.4)] transition-all duration-200 overflow-hidden">
            {#if i < 3}
              <div
                class="absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-[3px] rounded-full blur-[1px] opacity-70"
                style="background: linear-gradient(90deg, transparent, {medalLineColors[i]}, transparent);"
              ></div>
            {/if}

            <div class="flex items-center gap-3 sm:w-52 shrink-0 min-w-0">
              <div class="shrink-0 flex items-center justify-center w-7 h-7">
                {#if i < 3}
                  <div class="flex items-center justify-center w-7 h-7 rounded-full {medalStyles[i].bg} shadow-sm">
                    <span class="text-[11px] font-extrabold text-white">{i + 1}</span>
                  </div>
                {:else}
                  <span class="text-[13px] font-bold text-surface-300 dark:text-surface-600">#{i + 1}</span>
                {/if}
              </div>
              <div
                class="shrink-0 flex items-center justify-center w-10 h-10 rounded-2xl text-white text-[14px] font-bold shadow-sm"
                style="background-color: {colorFromString(quoter.name)};"
              >
                {quoter.name.charAt(0).toUpperCase()}
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-[14px] font-bold text-surface-900 dark:text-surface-50 truncate">{quoter.name}</p>
                <p class="text-[11px] text-surface-400 dark:text-surface-500 font-medium truncate">{quoter.peopleQuoted.size} {quoter.peopleQuoted.size === 1 ? 'person' : 'people'} quoted</p>
              </div>
            </div>

            <div class="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2 min-w-0">
              <div class="flex flex-col items-center justify-center gap-0.5 py-2 rounded-2xl glass-inset">
                <div class="flex items-center gap-1 text-brand-500">
                  <Quote size={12} />
                  <span class="text-[13px] font-extrabold text-surface-800 dark:text-surface-100">{quoter.quoteCount}</span>
                </div>
                <span class="text-[9px] font-medium text-surface-400 uppercase tracking-wide">Quotes</span>
              </div>
              <div class="flex flex-col items-center justify-center gap-0.5 py-2 rounded-2xl glass-inset">
                <div class="flex items-center gap-1 text-red-400">
                  <Heart size={12} fill="currentColor" />
                  <span class="text-[13px] font-extrabold text-surface-800 dark:text-surface-100">{quoter.totalFavoritesEarned}</span>
                </div>
                <span class="text-[9px] font-medium text-surface-400 uppercase tracking-wide">Likes</span>
              </div>
              <div class="flex flex-col items-center justify-center gap-0.5 py-2 rounded-2xl glass-inset">
                <div class="flex items-center gap-1 text-surface-400">
                  <MessageCircle size={12} />
                  <span class="text-[13px] font-extrabold text-surface-800 dark:text-surface-100">{quoter.totalCommentsEarned}</span>
                </div>
                <span class="text-[9px] font-medium text-surface-400 uppercase tracking-wide">Comments</span>
              </div>
              <div class="flex flex-col items-center justify-center gap-0.5 py-2 rounded-2xl glass-inset">
                <div class="flex items-center gap-1 text-amber-500">
                  <Sparkles size={12} />
                  <span class="text-[13px] font-extrabold text-surface-800 dark:text-surface-100">{quoter.avgFavorites.toFixed(1)}</span>
                </div>
                <span class="text-[9px] font-medium text-surface-400 uppercase tracking-wide">Avg/quote</span>
              </div>
            </div>

            {#if quoter.topTag}
              <div class="hidden sm:flex items-center shrink-0">
                <span
                  class="text-[10.5px] font-semibold px-2 py-0.5 rounded-lg whitespace-nowrap"
                  style:color={colorFromString(quoter.topTag)}
                  style:background-color={`${colorFromString(quoter.topTag)}17`}
                >
                  #{quoter.topTag}
                </span>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>