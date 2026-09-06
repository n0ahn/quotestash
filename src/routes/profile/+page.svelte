<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase, getCurrentProfile, uploadAvatar, removeAvatar } from '$lib/supabase';
  import { Quote, Heart, MessageCircle, Sparkles, Star, LayoutGrid, Brain, Target, Trophy, Camera, Loader2, X } from 'lucide-svelte';
  import { summarizeQuizResults, QUIZ_MODE_LABELS, type QuizStats } from '$lib/database.types';

  let loading = $state(true);
  let notFound = $state(false);

  let avatarUrl = $state<string | null>(null);
  let avatarUploading = $state(false);
  let avatarError = $state<string | null>(null);
  let fileInput = $state<HTMLInputElement>();

  let userId = $state('');
  let firstName = $state('');
  let email = $state('');

  let roomCount = $state(0);
  let addedQuotes = $state<{ id: string; room_id: string; lines: { said_by: string; text: string }[] }[]>([]);
  let favoriteCounts = $state<Record<string, number>>({});
  let commentCounts = $state<Record<string, number>>({});

  let quotedLineCount = $state(0);
  let quotedFavorites = $state(0);
  let bestQuoted = $state<{ text: string; favorites: number } | null>(null);
  let topTag = $state<string | null>(null);
  let quizStats = $state<QuizStats>({ quizzesPlayed: 0, totalCorrect: 0, totalQuestions: 0, accuracy: 0, bestMode: null });

  const totalFavoritesEarned = $derived(addedQuotes.reduce((sum, q) => sum + (favoriteCounts[q.id] ?? 0), 0));
  const totalCommentsEarned = $derived(addedQuotes.reduce((sum, q) => sum + (commentCounts[q.id] ?? 0), 0));
  const avgFavorites = $derived(addedQuotes.length > 0 ? totalFavoritesEarned / addedQuotes.length : 0);
  const bestAdded = $derived.by(() => {
    let best: { quote: (typeof addedQuotes)[number]; favorites: number } | null = null;
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

    const profile = await getCurrentProfile();
    if (!profile) {
      goto('/auth/login');
      return;
    }

    userId = profile.id;
    firstName = profile.first_name;
    email = profile.email;
    avatarUrl = profile.avatar_url ?? null;

    // Rooms this user belongs to
    const { data: memberRows, error: memberError } = await supabase
      .from('room_members')
      .select('room_id')
      .eq('user_id', userId);

    if (memberError) console.error('room_members load error', memberError);

    const roomIds = (memberRows ?? []).map((r) => r.room_id);
    roomCount = roomIds.length;

    if (roomIds.length === 0) {
      addedQuotes = [];
      favoriteCounts = {};
      commentCounts = {};
      quotedLineCount = 0;
      quotedFavorites = 0;
      bestQuoted = null;
      topTag = null;
      quizStats = { quizzesPlayed: 0, totalCorrect: 0, totalQuestions: 0, accuracy: 0, bestMode: null };
      loading = false;
      return;
    }

    // Quotes this user added, across every room they're in
    const { data: quotesData, error: quotesError } = await supabase
      .from('quotes')
      .select('id, room_id, lines')
      .in('room_id', roomIds)
      .eq('added_by', userId);

    if (quotesError) console.error('quotes load error', quotesError);

    addedQuotes = (quotesData ?? []) as typeof addedQuotes;
    const addedQuoteIds = addedQuotes.map((q) => q.id);

    if (addedQuoteIds.length > 0) {
      const { data: favData } = await supabase
        .from('quote_favorites')
        .select('quote_id')
        .in('quote_id', addedQuoteIds);

      const fCounts: Record<string, number> = {};
      for (const row of favData ?? []) {
        fCounts[row.quote_id] = (fCounts[row.quote_id] ?? 0) + 1;
      }
      favoriteCounts = fCounts;

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
    }

    // Stats about being quoted (said_by === firstName), across every quote in every room this user is in
    const { data: allQuotesData, error: allQuotesError } = await supabase
      .from('quotes')
      .select('id, lines, tags')
      .in('room_id', roomIds);

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
        if (line.said_by.toLowerCase() === firstName.toLowerCase()) {
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

    // Quiz stats across every room this user is in
    const { data: quizData, error: quizError } = await supabase
      .from('quiz_results')
      .select('mode, correct_count, total_count')
      .in('room_id', roomIds)
      .eq('user_id', userId);

    if (quizError) console.error('quiz results load error', quizError);
    quizStats = summarizeQuizResults(quizData ?? []);

    loading = false;
  }

  const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

  async function handleAvatarChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    avatarError = null;

    if (!file.type.startsWith('image/')) {
      avatarError = 'Please choose an image file.';
      input.value = '';
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      avatarError = 'Image must be smaller than 5MB.';
      input.value = '';
      return;
    }

    avatarUploading = true;
    const newUrl = await uploadAvatar(file);
    avatarUploading = false;
    input.value = '';

    if (!newUrl) {
      avatarError = 'Failed to upload image. Please try again.';
      return;
    }

    avatarUrl = newUrl;
  }

  async function handleRemoveAvatar() {
    avatarError = null;
    avatarUploading = true;
    const ok = await removeAvatar();
    avatarUploading = false;

    if (!ok) {
      avatarError = 'Failed to remove picture. Please try again.';
      return;
    }

    avatarUrl = null;
  }

  onMount(loadData);
</script>

<svelte:head>
  <title>Profile · QuoteStash</title>
</svelte:head>

<div class="px-5 sm:px-8 py-20 sm:p-10 sm:py-20 max-w-3xl mx-auto">
  <a
    href="/rooms"
    class="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 transition-colors mb-6"
  >
    <LayoutGrid size={14} />
    All rooms
  </a>

  {#if loading}
    <div class="flex items-center gap-4 mb-8">
      <div class="w-16 h-16 rounded-full bg-surface-100 dark:bg-surface-900 animate-pulse"></div>
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
  {:else}
    <!-- Header -->
    <div class="flex items-center gap-4 mb-8 min-w-0">
      <div class="relative shrink-0 group/avatar">
        {#if avatarUrl}
          <img
            src={avatarUrl}
            alt={firstName}
            class="w-16 h-16 rounded-full object-cover shadow-sm"
          />
        {:else}
          <div
            class="flex items-center justify-center rounded-full text-white text-[24px] font-bold shadow-sm"
            style="width: 4rem; height: 4rem; background-color: {colorFromString(firstName)};"
          >
            {firstName.charAt(0).toUpperCase()}
          </div>
        {/if}

        <button
          type="button"
          onclick={() => fileInput?.click()}
          disabled={avatarUploading}
          aria-label="Change profile picture"
          class="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 group-hover/avatar:bg-black/40 text-white opacity-0 group-hover/avatar:opacity-100 transition-all disabled:cursor-wait"
        >
          {#if avatarUploading}
            <Loader2 size={18} class="animate-spin" />
          {:else}
            <Camera size={18} />
          {/if}
        </button>

        <input
          bind:this={fileInput}
          type="file"
          accept="image/*"
          class="hidden"
          onchange={handleAvatarChange}
        />
      </div>
      <div class="min-w-0 flex-1">
        <h1 class="text-xl font-bold text-surface-900 dark:text-surface-50 truncate">{firstName}</h1>
        <p class="text-[13px] text-surface-500 dark:text-surface-400 mt-0.5 truncate">
          {email} · in {roomCount} {roomCount === 1 ? 'room' : 'rooms'}
        </p>
        <div class="flex items-center gap-3 mt-1.5">
          <button
            type="button"
            onclick={() => fileInput?.click()}
            disabled={avatarUploading}
            class="text-[11.5px] font-semibold text-brand-500 hover:text-brand-600 transition-colors disabled:opacity-50"
          >
            {avatarUrl ? 'Change picture' : 'Add picture'}
          </button>
          {#if avatarUrl}
            <button
              type="button"
              onclick={handleRemoveAvatar}
              disabled={avatarUploading}
              class="flex items-center gap-1 text-[11.5px] font-medium text-surface-400 hover:text-red-500 transition-colors disabled:opacity-50"
            >
              <X size={12} />
              Remove
            </button>
          {/if}
        </div>
        {#if avatarError}
          <p class="text-[11.5px] text-red-500 mt-1">{avatarError}</p>
        {/if}
      </div>
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
      <div class="flex flex-col items-center justify-center gap-1 p-4 rounded-3xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800">
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
        <p class="text-[11px] font-semibold text-surface-400 uppercase tracking-wide mb-1.5">Your most popular addition</p>
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
      <p class="text-[13px] text-surface-400 dark:text-surface-500">No one has quoted you yet.</p>
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
            class="shrink-0 text-[11px] font-semibold px-2 p-0.5 rounded-lg"
            style:color={colorFromString(topTag)}
            style:background-color={`${colorFromString(topTag)}17`}
          >
            #{topTag}
          </span>
          <span class="text-[11px] text-surface-400">is your signature tag</span>
        </div>
      {/if}

      {#if bestQuoted}
        <div class="mb-4 p-4 rounded-3xl bg-surface-50 dark:bg-surface-800 border border-surface-100 dark:border-surface-800">
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
      <p class="text-[13px] text-surface-400 dark:text-surface-500">
        You haven't taken a quiz yet — head into a room and give one a shot.
      </p>
    {:else}
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
  {/if}
</div>