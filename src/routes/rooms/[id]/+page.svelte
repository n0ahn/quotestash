<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { supabase, getCurrentProfile } from '$lib/supabase';
  import {
    Sparkles,
    TrendingUp,
    TrendingDown,
    Minus,
    Heart,
    MessageCircle,
    Quote as QuoteIcon,
    Users,
    Flame,
    Trophy,
    Zap,
    Star,
    Crown,
    Hash,
    PartyPopper,
    Brain,
    Target,
    EyeOff,
    Ruler,
    CalendarDays,
    Rows3,
    CornerDownRight
  } from 'lucide-svelte';
  import type { QuoteWithDetails, NotificationType, NotificationWithDetails } from '$lib/database.types';

  const roomId = $derived(page.params.id!);

  type Member = { id: string; first_name: string };

  let loading = $state(true);
  let firstName = $state('');
  let quotes = $state<QuoteWithDetails[]>([]);
  let favoriteCounts = $state<Record<string, number>>({});
  let commentCounts = $state<Record<string, number>>({});
  let members = $state<Member[]>([]);
  let quizRows = $state<{ user_id: string; correct_count: number; total_count: number }[]>([]);
  let activityRows = $state<NotificationWithDetails[]>([]);

  // Zelfde icoon/kleur-stijl als NotificationBell — hier hergebruikt voor de
  // room-brede "Recent activity" feed op het dashboard.
  const ACTIVITY_ICON: Record<NotificationType, any> = {
    new_quote: QuoteIcon,
    new_comment: MessageCircle,
    new_reply: CornerDownRight,
    comment_like: Heart,
    quote_favorite: Star,
    reaction: Sparkles
  };

  const ACTIVITY_ICON_COLOR: Record<NotificationType, string> = {
    new_quote: 'text-brand-500',
    new_comment: 'text-brand-500',
    new_reply: 'text-brand-500',
    comment_like: 'text-red-500',
    quote_favorite: 'text-amber-500',
    reaction: 'text-fuchsia-500'
  };

  function activityAction(row: NotificationWithDetails): string {
    switch (row.type) {
      case 'new_quote':
        return 'added a new quote';
      case 'new_comment':
        return 'commented on a quote';
      case 'new_reply':
        return 'replied to a comment';
      case 'comment_like':
        return 'liked a comment';
      case 'quote_favorite':
        return 'favorited a quote';
      case 'reaction':
        return `reacted ${row.reaction_emoji ?? ''} to a quote`;
      default:
        return 'did something';
    }
  }

  function activityHref(row: NotificationWithDetails): string {
    if (row.quote_id) return `/rooms/${roomId}/quotes/${row.quote_id}`;
    return `/rooms/${roomId}/quotes`;
  }

  function formatRelativeTime(iso: string): string {
    const date = new Date(iso);
    const diffMs = Date.now() - date.getTime();
    const diffSec = Math.max(0, Math.floor(diffMs / 1000));

    if (diffSec < 60) return 'just now';

    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;

    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;

    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function colorFromString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 60%)`;
  }

  function quoteLength(q: QuoteWithDetails): number {
    return q.lines.reduce((sum, l) => sum + l.text.length, 0);
  }

  function daysAgo(n: number): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - n);
    return d;
  }

  function sameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  async function loadData() {
    loading = true;

    const profile = await getCurrentProfile();
    firstName = profile?.first_name ?? '';

    const { data: quotesData, error: quotesError } = await supabase
      .from('quotes')
      .select('*, adder:users!quotes_added_by_fkey(id, first_name)')
      .eq('room_id', roomId);

    if (quotesError) console.error('quotes load error', quotesError);

    quotes = ((quotesData ?? []) as any[]).map((q) => ({
      ...q,
      adder: Array.isArray(q.adder) ? q.adder[0] : q.adder
    })) as QuoteWithDetails[];

    const quoteIds = quotes.map((q) => q.id);

    if (quoteIds.length > 0) {
      const { data: favData } = await supabase.from('quote_favorites').select('quote_id').in('quote_id', quoteIds);
      const fCounts: Record<string, number> = {};
      for (const row of favData ?? []) fCounts[row.quote_id] = (fCounts[row.quote_id] ?? 0) + 1;
      favoriteCounts = fCounts;

      const { data: commentData } = await supabase.from('quote_comments').select('quote_id').in('quote_id', quoteIds);
      const cCounts: Record<string, number> = {};
      for (const row of commentData ?? []) cCounts[row.quote_id] = (cCounts[row.quote_id] ?? 0) + 1;
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

    members = ((membersData ?? []) as any[])
      .filter((m) => m.users)
      .map((m) => {
        const u = Array.isArray(m.users) ? m.users[0] : m.users;
        return { id: u!.id as string, first_name: u!.first_name as string };
      });

    const { data: quizData, error: quizError } = await supabase
      .from('quiz_results')
      .select('user_id, correct_count, total_count')
      .eq('room_id', roomId);

    if (quizError) console.error('quiz results load error', quizError);
    quizRows = quizData ?? [];

    // Room-brede "Recent activity": notifications zijn per-ontvanger gefanoutd
    // (bv. 1 rij per lid bij een nieuwe quote), dus we dedupliceren op de
    // onderliggende gebeurtenis zodat elke actie maar 1x in de feed staat.
    const { data: activityData, error: activityError } = await supabase
      .from('notifications')
      .select('*, actor:users!notifications_actor_id_fkey(id, first_name)')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (activityError) console.error('activity load error', activityError);

    const seen = new Set<string>();
    const deduped: NotificationWithDetails[] = [];
    for (const row of (activityData ?? []) as any[]) {
      const key = `${row.type}:${row.actor_id}:${row.quote_id}:${row.comment_id}:${row.created_at}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push({
        ...row,
        actor: Array.isArray(row.actor) ? row.actor[0] : row.actor
      });
      if (deduped.length >= 8) break;
    }
    activityRows = deduped;

    loading = false;
  }

  // ---------- headline stats ----------
  const totalQuotes = $derived(quotes.length);
  const totalLikes = $derived(Object.values(favoriteCounts).reduce((a, b) => a + b, 0));
  const totalComments = $derived(Object.values(commentCounts).reduce((a, b) => a + b, 0));
  const totalMembers = $derived(members.length);

  const quotesThisWeek = $derived.by(() => {
    const cutoff = daysAgo(7);
    return quotes.filter((q) => new Date(q.created_at) >= cutoff).length;
  });
  const quotesPrevWeek = $derived.by(() => {
    const start = daysAgo(14);
    const end = daysAgo(7);
    return quotes.filter((q) => {
      const d = new Date(q.created_at);
      return d >= start && d < end;
    }).length;
  });
  const weekTrend = $derived.by((): { direction: 'up' | 'down' | 'flat'; pct: number } => {
    if (quotesPrevWeek === 0) {
      return { direction: quotesThisWeek > 0 ? 'up' : 'flat', pct: quotesThisWeek > 0 ? 100 : 0 };
    }
    const diff = quotesThisWeek - quotesPrevWeek;
    const pct = Math.round((Math.abs(diff) / quotesPrevWeek) * 100);
    return { direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat', pct };
  });

  // ---------- 14-day activity chart ----------
  const activityDays = $derived.by(() => {
    const days: { date: Date; label: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = daysAgo(i);
      const count = quotes.filter((q) => sameDay(new Date(q.created_at), d)).length;
      days.push({
        date: d,
        label: d.toLocaleDateString(undefined, { weekday: 'narrow' }),
        count
      });
    }
    return days;
  });
  const maxDayCount = $derived(Math.max(1, ...activityDays.map((d) => d.count)));

  // ---------- spotlight: most loved quote ----------
  const spotlightQuote = $derived.by(() => {
    if (quotes.length === 0) return null;
    let best: { quote: QuoteWithDetails; favorites: number; comments: number } | null = null;
    for (const q of quotes) {
      const favorites = favoriteCounts[q.id] ?? 0;
      const comments = commentCounts[q.id] ?? 0;
      if (!best || favorites > best.favorites) {
        best = { quote: q, favorites, comments };
      }
    }
    return best;
  });

  // ---------- fun facts ----------
  const longestQuote = $derived.by(() => {
    if (quotes.length === 0) return null;
    return [...quotes].sort((a, b) => quoteLength(b) - quoteLength(a))[0];
  });

  const spiciestCount = $derived(quotes.filter((q) => q.is_nsfw).length);

  const avgLinesPerQuote = $derived.by(() => {
    if (quotes.length === 0) return 0;
    return quotes.reduce((sum, q) => sum + q.lines.length, 0) / quotes.length;
  });

  const busiestWeekday = $derived.by(() => {
    if (quotes.length === 0) return null;
    const counts: Record<number, number> = {};
    for (const q of quotes) {
      const day = new Date(q.created_at).getDay();
      counts[day] = (counts[day] ?? 0) + 1;
    }
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (!best) return null;
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return { name: names[Number(best[0])], count: best[1] };
  });

  const firstQuoteDate = $derived.by(() => {
    if (quotes.length === 0) return null;
    return quotes.reduce((min, q) => (new Date(q.created_at) < new Date(min.created_at) ? q : min), quotes[0]);
  });

  const daysSinceStart = $derived.by(() => {
    if (!firstQuoteDate) return 0;
    const diffMs = Date.now() - new Date(firstQuoteDate.created_at).getTime();
    return Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
  });

  // ---------- tag cloud ----------
  const tagCloud = $derived.by(() => {
    const counts: Record<string, number> = {};
    for (const q of quotes) {
      for (const tag of q.tags ?? []) counts[tag] = (counts[tag] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));
  });
  const maxTagCount = $derived(Math.max(1, ...tagCloud.map((t) => t.count)));

  // ---------- top quoter / top quoted / quiz champ ----------
  const topQuoter = $derived.by(() => {
    const counts: Record<string, { name: string; count: number; likes: number }> = {};
    for (const q of quotes) {
      if (!q.adder) continue;
      const fav = favoriteCounts[q.id] ?? 0;
      if (!counts[q.adder.id]) counts[q.adder.id] = { name: q.adder.first_name, count: 0, likes: 0 };
      counts[q.adder.id].count += 1;
      counts[q.adder.id].likes += fav;
    }
    const arr = Object.values(counts).sort((a, b) => b.count - a.count);
    return arr[0] ?? null;
  });

  const topQuoted = $derived.by(() => {
    const counts: Record<string, { name: string; favorites: number; quoteCount: number }> = {};
    for (const q of quotes) {
      const fav = favoriteCounts[q.id] ?? 0;
      const seen = new Set<string>();
      for (const line of q.lines) {
        if (seen.has(line.said_by)) continue;
        seen.add(line.said_by);
        if (!counts[line.said_by]) counts[line.said_by] = { name: line.said_by, favorites: 0, quoteCount: 0 };
        counts[line.said_by].favorites += fav;
        counts[line.said_by].quoteCount += 1;
      }
    }
    const arr = Object.values(counts).sort((a, b) => b.favorites - a.favorites);
    return arr[0] ?? null;
  });

  const quizChampion = $derived.by(() => {
    const stats: Record<string, { correct: number; total: number; played: number }> = {};
    for (const row of quizRows) {
      if (!stats[row.user_id]) stats[row.user_id] = { correct: 0, total: 0, played: 0 };
      stats[row.user_id].correct += row.correct_count;
      stats[row.user_id].total += row.total_count;
      stats[row.user_id].played += 1;
    }
    let best: { id: string; accuracy: number; played: number } | null = null;
    for (const [id, s] of Object.entries(stats)) {
      if (s.total === 0) continue;
      const accuracy = (s.correct / s.total) * 100;
      if (!best || accuracy > best.accuracy) best = { id, accuracy, played: s.played };
    }
    if (!best) return null;
    const member = members.find((m) => m.id === best!.id);
    return { name: member?.first_name ?? 'Someone', accuracy: best.accuracy, played: best.played };
  });

  const heroCards = $derived([
    { label: 'Quotes', value: totalQuotes, icon: QuoteIcon, gradient: 'from-brand-400 to-brand-600', glow: 'shadow-brand-500/25' },
    { label: 'Likes', value: totalLikes, icon: Heart, gradient: 'from-rose-400 to-red-500', glow: 'shadow-red-500/25' },
    { label: 'Comments', value: totalComments, icon: MessageCircle, gradient: 'from-sky-400 to-blue-500', glow: 'shadow-blue-500/25' },
    { label: 'Members', value: totalMembers, icon: Users, gradient: 'from-emerald-400 to-teal-500', glow: 'shadow-emerald-500/25' }
  ]);

  onMount(loadData);
</script>

<svelte:head>
  <title>Dashboard · QuoteStash</title>
</svelte:head>

<div class="px-5 sm:px-8 py-8 sm:py-10 max-w-5xl">
  <div class="flex items-center gap-2.5 mb-1">
    <div class="flex items-center justify-center w-9 h-9 rounded-2xl bg-linear-to-br from-brand-400 to-brand-600 shadow-sm shadow-brand-500/30 shrink-0">
      <Sparkles size={18} class="text-white" strokeWidth={2.2} />
    </div>
    <h1 class="text-xl font-bold text-surface-900 dark:text-surface-50">Dashboard</h1>
  </div>
  <p class="text-[13px] text-surface-500 dark:text-surface-400 mt-1 ml-11.5">
    {firstName ? `Welcome back, ${firstName}. ` : ''}Here's what's happening in this stash.
  </p>

  {#if loading}
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-7">
      {#each Array(4) as _}
        <div class="h-24 rounded-3xl bg-surface-100 dark:bg-surface-900 animate-pulse"></div>
      {/each}
    </div>
    <div class="h-40 rounded-3xl bg-surface-100 dark:bg-surface-900 animate-pulse mt-4"></div>
    <div class="grid sm:grid-cols-2 gap-4 mt-4">
      <div class="h-56 rounded-3xl bg-surface-100 dark:bg-surface-900 animate-pulse"></div>
      <div class="h-56 rounded-3xl bg-surface-100 dark:bg-surface-900 animate-pulse"></div>
    </div>
  {:else if totalQuotes === 0}
    <div class="flex flex-col items-center justify-center py-24 text-center px-4">
      <PartyPopper size={28} class="text-surface-300 dark:text-surface-700 mb-3" />
      <p class="text-[14px] font-medium text-surface-500 dark:text-surface-400 max-w-sm">
        No quotes yet — add the first one and this dashboard will come to life.
      </p>
    </div>
  {:else}
    <!-- Hero stat cards -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-7">
      {#each heroCards as card (card.label)}
        <div class="relative flex flex-col justify-between gap-4 p-4 sm:p-5 rounded-3xl bg-linear-to-br {card.gradient} shadow-lg {card.glow} overflow-hidden min-h-26">
          <div class="absolute -right-5 -bottom-5 w-20 h-20 rounded-full bg-white/10"></div>
          <div class="relative flex items-center justify-center w-8 h-8 rounded-xl bg-white/20 backdrop-blur-sm">
            <card.icon size={15} class="text-white" strokeWidth={2.3} />
          </div>
          <div class="relative">
            <p class="text-[24px] sm:text-[28px] font-extrabold text-white leading-none">{card.value}</p>
            <p class="text-[11px] font-semibold text-white/85 mt-1 uppercase tracking-wide">{card.label}</p>
          </div>
        </div>
      {/each}
    </div>

    <!-- Activity chart -->
    <div class="mt-4 p-5 sm:p-6 rounded-3xl glass">
      <div class="flex items-center justify-between flex-wrap gap-2 mb-5">
        <div>
          <h2 class="text-[13px] font-bold text-surface-700 dark:text-surface-200 uppercase tracking-wide">Last 14 days</h2>
          <p class="text-[11.5px] text-surface-400 dark:text-surface-500 mt-0.5">Quotes added per day</p>
        </div>
        <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-semibold
          {weekTrend.direction === 'up' ? 'bg-emerald-500/10 text-emerald-500' : weekTrend.direction === 'down' ? 'bg-red-500/10 text-red-500' : 'bg-surface-100 dark:bg-surface-800 text-surface-400'}">
          {#if weekTrend.direction === 'up'}
            <TrendingUp size={13} />
          {:else if weekTrend.direction === 'down'}
            <TrendingDown size={13} />
          {:else}
            <Minus size={13} />
          {/if}
          {weekTrend.pct}% vs last week
        </div>
      </div>

      <div class="flex items-end justify-between gap-1.5 sm:gap-2 h-32">
        {#each activityDays as day (day.date.toISOString())}
          <div class="flex-1 flex flex-col items-center justify-end gap-1.5 h-full group">
            <span class="text-[10px] font-bold text-surface-500 dark:text-surface-400 opacity-0 group-hover:opacity-100 transition-opacity">
              {day.count}
            </span>
            <div
              class="w-full rounded-lg bg-linear-to-t from-brand-500 to-brand-400 dark:from-brand-600 dark:to-brand-400 transition-all hover:opacity-80"
              style="height: {Math.max(6, (day.count / maxDayCount) * 100)}%; {day.count === 0 ? 'opacity: 0.15;' : ''}"
              title="{day.count} on {day.date.toLocaleDateString()}"
            ></div>
            <span class="text-[9.5px] font-semibold text-surface-400 dark:text-surface-500">{day.label}</span>
          </div>
        {/each}
      </div>
    </div>

    <!-- Spotlight quote -->
    {#if spotlightQuote && spotlightQuote.favorites > 0}
      {@const accentColor = spotlightQuote.quote.color || colorFromString(spotlightQuote.quote.id)}
      <a
        href="/rooms/{roomId}/quotes/{spotlightQuote.quote.id}"
        class="mt-4 relative flex flex-col gap-4 p-5 sm:p-6 rounded-3xl glass hover:shadow-[0_8px_30px_-6px_rgba(0,0,0,0.10)] dark:hover:shadow-[0_8px_30px_-6px_rgba(0,0,0,0.4)] hover:-translate-y-0.5 transition-all duration-200 overflow-hidden"
      >
        <div class="absolute top-0 left-0 right-0 h-1" style="background-color: {accentColor};"></div>

        <div class="flex items-center gap-1.5 text-amber-500">
          <Star size={13} fill="currentColor" />
          <span class="text-[11px] font-bold uppercase tracking-wide">Most loved quote</span>
        </div>

        <div class="flex flex-col gap-2">
          {#each spotlightQuote.quote.lines.slice(0, 3) as line, i (i)}
            <div class="flex items-start gap-2.5">
              <div
                class="shrink-0 flex items-center justify-center w-7 h-7 rounded-full text-white text-[11px] font-bold mt-0.5"
                style="background-color: {colorFromString(line.said_by)};"
              >
                {line.said_by.charAt(0).toUpperCase()}
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-[14px] font-medium text-surface-800 dark:text-surface-100 leading-snug wrap-break-word">"{line.text}"</p>
                <p class="text-[10.5px] text-surface-400 dark:text-surface-500 font-medium mt-0.5">{line.said_by}</p>
              </div>
            </div>
          {/each}
        </div>

        <div class="flex items-center gap-4 pt-3 border-t border-surface-100 dark:border-surface-800/70">
          <div class="flex items-center gap-1 text-red-400">
            <Heart size={14} fill="currentColor" />
            <span class="text-[12.5px] font-bold text-surface-700 dark:text-surface-200">{spotlightQuote.favorites}</span>
          </div>
          <div class="flex items-center gap-1 text-surface-400">
            <MessageCircle size={14} />
            <span class="text-[12.5px] font-semibold text-surface-500 dark:text-surface-400">{spotlightQuote.comments}</span>
          </div>
          {#if spotlightQuote.quote.adder?.first_name}
            <span class="text-[11px] font-medium text-surface-400 dark:text-surface-500 ml-auto truncate">
              Added by {spotlightQuote.quote.adder.first_name}
            </span>
          {/if}
        </div>
      </a>
    {/if}

    <!-- Mini leaderboards -->
    <div class="grid sm:grid-cols-3 gap-4 mt-4">
      <div class="p-5 rounded-3xl glass flex flex-col gap-3">
        <div class="flex items-center gap-1.5 text-brand-500">
          <Flame size={13} />
          <span class="text-[11px] font-bold uppercase tracking-wide">Top quoter</span>
        </div>
        {#if topQuoter}
          <div class="flex items-center gap-3">
            <div
              class="shrink-0 flex items-center justify-center w-10 h-10 rounded-2xl text-white text-[14px] font-bold shadow-sm"
              style="background-color: {colorFromString(topQuoter.name)};"
            >
              {topQuoter.name.charAt(0).toUpperCase()}
            </div>
            <div class="min-w-0">
              <p class="text-[14px] font-bold text-surface-900 dark:text-surface-50 truncate">{topQuoter.name}</p>
              <p class="text-[11px] text-surface-400 dark:text-surface-500 font-medium">
                {topQuoter.count} {topQuoter.count === 1 ? 'quote' : 'quotes'} added
              </p>
            </div>
          </div>
        {:else}
          <p class="text-[12.5px] text-surface-400">No data yet.</p>
        {/if}
      </div>

      <div class="p-5 rounded-3xl glass flex flex-col gap-3">
        <div class="flex items-center gap-1.5 text-amber-500">
          <Crown size={13} />
          <span class="text-[11px] font-bold uppercase tracking-wide">Most quoted</span>
        </div>
        {#if topQuoted}
          <div class="flex items-center gap-3">
            <div
              class="shrink-0 flex items-center justify-center w-10 h-10 rounded-2xl text-white text-[14px] font-bold shadow-sm"
              style="background-color: {colorFromString(topQuoted.name)};"
            >
              {topQuoted.name.charAt(0).toUpperCase()}
            </div>
            <div class="min-w-0">
              <p class="text-[14px] font-bold text-surface-900 dark:text-surface-50 truncate">{topQuoted.name}</p>
              <p class="text-[11px] text-surface-400 dark:text-surface-500 font-medium">
                {topQuoted.favorites} {topQuoted.favorites === 1 ? 'like' : 'likes'} earned
              </p>
            </div>
          </div>
        {:else}
          <p class="text-[12.5px] text-surface-400">No data yet.</p>
        {/if}
      </div>

      <div class="p-5 rounded-3xl glass flex flex-col gap-3">
        <div class="flex items-center gap-1.5 text-emerald-500">
          <Brain size={13} />
          <span class="text-[11px] font-bold uppercase tracking-wide">Quiz champ</span>
        </div>
        {#if quizChampion}
          <div class="flex items-center gap-3">
            <div
              class="shrink-0 flex items-center justify-center w-10 h-10 rounded-2xl text-white text-[14px] font-bold shadow-sm"
              style="background-color: {colorFromString(quizChampion.name)};"
            >
              {quizChampion.name.charAt(0).toUpperCase()}
            </div>
            <div class="min-w-0">
              <p class="text-[14px] font-bold text-surface-900 dark:text-surface-50 truncate">{quizChampion.name}</p>
              <p class="text-[11px] text-surface-400 dark:text-surface-500 font-medium">
                {quizChampion.accuracy.toFixed(0)}% accuracy · {quizChampion.played} played
              </p>
            </div>
          </div>
        {:else}
          <p class="text-[12.5px] text-surface-400">No quizzes played yet.</p>
        {/if}
      </div>
    </div>

    <!-- Fun facts + tag cloud -->
    <div class="grid sm:grid-cols-2 gap-4 mt-4">
      <div class="p-5 sm:p-6 rounded-3xl glass">
        <h2 class="text-[13px] font-bold text-surface-700 dark:text-surface-200 uppercase tracking-wide mb-4">Fun facts</h2>
        <div class="flex flex-col gap-3.5">
          <div class="flex items-center gap-3">
            <div class="shrink-0 flex items-center justify-center w-8 h-8 rounded-xl bg-brand-500/10 text-brand-500">
              <Ruler size={14} />
            </div>
            <p class="text-[12.5px] text-surface-600 dark:text-surface-300">
              Longest quote has <span class="font-bold text-surface-900 dark:text-surface-50">{longestQuote ? quoteLength(longestQuote) : 0} characters</span>
            </p>
          </div>
          <div class="flex items-center gap-3">
            <div class="shrink-0 flex items-center justify-center w-8 h-8 rounded-xl bg-red-500/10 text-red-500">
              <EyeOff size={14} />
            </div>
            <p class="text-[12.5px] text-surface-600 dark:text-surface-300">
              <span class="font-bold text-surface-900 dark:text-surface-50">{spiciestCount}</span> {spiciestCount === 1 ? 'quote is' : 'quotes are'} marked NSFW 🌶️
            </p>
          </div>
          <div class="flex items-center gap-3">
            <div class="shrink-0 flex items-center justify-center w-8 h-8 rounded-xl bg-amber-500/10 text-amber-500">
              <Rows3 size={14} />
            </div>
            <p class="text-[12.5px] text-surface-600 dark:text-surface-300">
              Average of <span class="font-bold text-surface-900 dark:text-surface-50">{avgLinesPerQuote.toFixed(1)} lines</span> per quote
            </p>
          </div>
          {#if busiestWeekday}
            <div class="flex items-center gap-3">
              <div class="shrink-0 flex items-center justify-center w-8 h-8 rounded-xl bg-sky-500/10 text-sky-500">
                <CalendarDays size={14} />
              </div>
              <p class="text-[12.5px] text-surface-600 dark:text-surface-300">
                <span class="font-bold text-surface-900 dark:text-surface-50">{busiestWeekday.name}s</span> are the busiest, with {busiestWeekday.count} quotes total
              </p>
            </div>
          {/if}
          {#if firstQuoteDate}
            <div class="flex items-center gap-3">
              <div class="shrink-0 flex items-center justify-center w-8 h-8 rounded-xl bg-violet-500/10 text-violet-500">
                <Zap size={14} />
              </div>
              <p class="text-[12.5px] text-surface-600 dark:text-surface-300">
                This stash has been running for <span class="font-bold text-surface-900 dark:text-surface-50">{daysSinceStart} {daysSinceStart === 1 ? 'day' : 'days'}</span>
              </p>
            </div>
          {/if}
        </div>
      </div>

      <div class="p-5 sm:p-6 rounded-3xl glass">
        <h2 class="text-[13px] font-bold text-surface-700 dark:text-surface-200 uppercase tracking-wide mb-4 flex items-center gap-1.5">
          <Hash size={13} />
          Popular tags
        </h2>
        {#if tagCloud.length === 0}
          <div class="flex flex-col items-center justify-center py-8 text-center">
            <p class="text-[12.5px] text-surface-400 dark:text-surface-500">No tags used yet.</p>
          </div>
        {:else}
          <div class="flex flex-wrap gap-2 items-center">
            {#each tagCloud as t (t.tag)}
              {@const scale = 0.75 + (t.count / maxTagCount) * 0.6}
              <span
                class="font-bold px-2.5 py-1 rounded-xl transition-transform hover:scale-105"
                style:color={colorFromString(t.tag)}
                style:background-color={`${colorFromString(t.tag)}17`}
                style:font-size={`${scale * 12.5}px`}
              >
                #{t.tag}
                <span class="opacity-60 font-medium">· {t.count}</span>
              </span>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <!-- Recent activity -->
    <div class="mt-4 p-5 sm:p-6 rounded-3xl glass">
      <h2 class="text-[13px] font-bold text-surface-700 dark:text-surface-200 uppercase tracking-wide mb-4">Recent activity</h2>
      {#if activityRows.length === 0}
        <div class="flex flex-col items-center justify-center py-8 text-center">
          <p class="text-[12.5px] text-surface-400 dark:text-surface-500">Nothing yet — activity will show up here.</p>
        </div>
      {:else}
        <div class="flex flex-col gap-1">
          {#each activityRows as row (`${row.type}:${row.actor_id}:${row.quote_id}:${row.comment_id}:${row.created_at}`)}
            <a
              href={activityHref(row)}
              class="flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-xl hover:bg-surface-50 dark:hover:bg-surface-800/60 transition-colors"
            >
              <div
                class="shrink-0 flex items-center justify-center w-8 h-8 rounded-xl {ACTIVITY_ICON_COLOR[row.type]} bg-surface-100 dark:bg-surface-800"
              >
                <!-- svelte-ignore svelte_component_deprecated -->
                <svelte:component this={ACTIVITY_ICON[row.type]} size={14} strokeWidth={2.25} />
              </div>
              <p class="min-w-0 flex-1 text-[12.5px] text-surface-600 dark:text-surface-300 truncate">
                <span class="font-semibold text-surface-800 dark:text-surface-100">{row.actor?.first_name ?? 'Someone'}</span>
                {activityAction(row)}
                {#if row.preview_text}
                  <span class="text-surface-400 dark:text-surface-500">— "{row.preview_text}"</span>
                {/if}
              </p>
              <span
                class="shrink-0 text-[10.5px] text-surface-400 dark:text-surface-500"
                title={new Date(row.created_at).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit'
                })}
              >
                {formatRelativeTime(row.created_at)}
              </span>
            </a>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>