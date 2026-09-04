<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/state';
  import { supabase } from '$lib/supabase';
  import {
    Users,
    Shuffle,
    ArrowLeft,
    Trophy,
    PartyPopper,
    RotateCcw,
    Zap,
    Timer,
    CheckCircle2,
    XCircle,
    Triangle,
    Diamond,
    Circle,
    Square,
    Flame,
    Sparkles
  } from 'lucide-svelte';
  import type { QuizMode } from '$lib/database.types';

  const roomId = $derived(page.params.id!);

  type Member = { id: string; first_name: string };
  type PoolEntry = { text: string; memberId: string; memberName: string };

  type WhoQuestion = {
    kind: 'who_said_it';
    text: string;
    options: { id: string; name: string }[];
    correctId: string;
  };
  type FactQuestion = {
    kind: 'fact_or_fluff';
    text: string;
    shownName: string;
    isTrue: boolean;
  };
  type Question = WhoQuestion | FactQuestion;

  type Stage = 'loading' | 'empty' | 'select-mode' | 'configure' | 'playing' | 'results';

  let stage = $state<Stage>('loading');
  let currentUserId = $state('');
  let members = $state<Member[]>([]);
  let pool = $state<PoolEntry[]>([]);

  let selectedMode = $state<QuizMode | null>(null);
  let questionCount = $state(10);

  let questions = $state<Question[]>([]);
  let currentIndex = $state(0);
  let score = $state(0);
  let streak = $state(0);
  let bestStreak = $state(0);
  let selectedOptionId = $state<string | null>(null);
  let locked = $state(false);

  const QUESTION_TIME_MS = 12000;
  let timeLeftPct = $state(100);
  let timerInterval: ReturnType<typeof setInterval> | null = null;
  let timerStart = 0;

  let saving = $state(false);
  let saved = $state(false);

  const currentQuestion = $derived(questions[currentIndex] as Question | undefined);
  const percentScore = $derived(questions.length > 0 ? Math.round((score / questions.length) * 100) : 0);

  const modeMeta: Record<QuizMode, { title: string; subtitle: string; icon: typeof Users; gradient: string; glow: string }> = {
    who_said_it: {
      title: 'Who Said It?',
      subtitle: 'A line from the stash — pick who actually said it, multiple choice style.',
      icon: Users,
      gradient: 'from-brand-400 to-brand-600',
      glow: 'shadow-brand-500/30'
    },
    fact_or_fluff: {
      title: 'Fact or Fluff',
      subtitle: 'We show you a line and a name — decide if the pairing is true or totally made up.',
      icon: Shuffle,
      gradient: 'from-amber-400 to-orange-500',
      glow: 'shadow-orange-500/30'
    }
  };

  const tileStyles = [
    { bg: 'bg-red-500 hover:bg-red-600', icon: Triangle },
    { bg: 'bg-blue-500 hover:bg-blue-600', icon: Diamond },
    { bg: 'bg-amber-400 hover:bg-amber-500', icon: Circle },
    { bg: 'bg-emerald-500 hover:bg-emerald-600', icon: Square }
  ];

  function colorFromString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 60%)`;
  }

  function shuffle<T>(arr: T[]): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  async function loadData() {
    stage = 'loading';

    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return;
    currentUserId = user.id;

    const { data: membersData, error: membersError } = await supabase
      .from('room_members')
      .select('user_id, users(id, first_name)')
      .eq('room_id', roomId);

    if (membersError) console.error('members load error', membersError);

    members = (membersData ?? [])
      .filter((m: any) => m.users)
      .map((m: any) => {
        const u = Array.isArray(m.users) ? m.users[0] : m.users;
        return { id: u!.id as string, first_name: u!.first_name as string };
      });

    const { data: quotesData, error: quotesError } = await supabase
      .from('quotes')
      .select('id, lines')
      .eq('room_id', roomId);

    if (quotesError) console.error('quotes load error', quotesError);

    const nameToMember = new Map(members.map((m) => [m.first_name.toLowerCase(), m]));
    const entries: PoolEntry[] = [];

    for (const q of quotesData ?? []) {
      for (const line of q.lines as { said_by: string; text: string }[]) {
        const match = nameToMember.get(line.said_by.toLowerCase());
        if (match) {
          entries.push({ text: line.text, memberId: match.id, memberName: match.first_name });
        }
      }
    }

    pool = entries;

    stage = pool.length === 0 || members.length < 2 ? 'empty' : 'select-mode';
  }

  function chooseMode(mode: QuizMode) {
    selectedMode = mode;
    const maxAvailable = mode === 'who_said_it' && members.length < 4 ? pool.length : pool.length;
    questionCount = Math.min(10, Math.max(3, maxAvailable));
    stage = 'configure';
  }

  function availableCounts(): number[] {
    const cap = pool.length;
    return [5, 10, 15].filter((n) => n <= cap || n === Math.min(5, cap));
  }

  function buildQuestions(mode: QuizMode, count: number): Question[] {
    const shuffledPool = shuffle(pool);
    const chosenEntries: PoolEntry[] = [];
    // prefer unique lines first, then allow repeats if we need more than the pool has
    for (let i = 0; chosenEntries.length < count; i++) {
      chosenEntries.push(shuffledPool[i % shuffledPool.length]);
    }

    if (mode === 'who_said_it') {
      return chosenEntries.map((entry) => {
        const decoys = shuffle(members.filter((m) => m.id !== entry.memberId)).slice(0, 3);
        const options = shuffle([{ id: entry.memberId, name: entry.memberName }, ...decoys.map((d) => ({ id: d.id, name: d.first_name }))]);
        return {
          kind: 'who_said_it',
          text: entry.text,
          options,
          correctId: entry.memberId
        } satisfies WhoQuestion;
      });
    }

    return chosenEntries.map((entry) => {
      const isTrue = Math.random() < 0.5;
      let shownName = entry.memberName;
      if (!isTrue) {
        const others = members.filter((m) => m.id !== entry.memberId);
        if (others.length > 0) {
          shownName = others[Math.floor(Math.random() * others.length)].first_name;
        }
      }
      return {
        kind: 'fact_or_fluff',
        text: entry.text,
        shownName,
        isTrue: shownName === entry.memberName
      } satisfies FactQuestion;
    });
  }

  function startQuiz() {
    if (!selectedMode) return;
    questions = buildQuestions(selectedMode, questionCount);
    currentIndex = 0;
    score = 0;
    streak = 0;
    bestStreak = 0;
    saved = false;
    stage = 'playing';
    beginQuestionTimer();
  }

  function beginQuestionTimer() {
    selectedOptionId = null;
    locked = false;
    timeLeftPct = 100;
    timerStart = Date.now();
    stopTimer();
    timerInterval = setInterval(() => {
      const elapsed = Date.now() - timerStart;
      timeLeftPct = Math.max(0, 100 - (elapsed / QUESTION_TIME_MS) * 100);
      if (elapsed >= QUESTION_TIME_MS) {
        stopTimer();
        if (!locked) lockAnswer(null);
      }
    }, 80);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function isCorrectChoice(choiceId: string | null): boolean {
    const q = currentQuestion;
    if (!q) return false;
    if (q.kind === 'who_said_it') return choiceId === q.correctId;
    return choiceId === (q.isTrue ? 'true' : 'false');
  }

  function lockAnswer(choiceId: string | null) {
    if (locked) return;
    locked = true;
    selectedOptionId = choiceId;
    stopTimer();

    if (isCorrectChoice(choiceId)) {
      score += 1;
      streak += 1;
      bestStreak = Math.max(bestStreak, streak);
    } else {
      streak = 0;
    }

    setTimeout(() => {
      if (currentIndex + 1 < questions.length) {
        currentIndex += 1;
        beginQuestionTimer();
      } else {
        stage = 'results';
        saveResult();
      }
    }, 1200);
  }

  async function saveResult() {
    if (!selectedMode || saving || saved) return;
    saving = true;

    const { error } = await supabase.from('quiz_results').insert({
      room_id: roomId,
      user_id: currentUserId,
      mode: selectedMode,
      correct_count: score,
      total_count: questions.length
    });

    if (error) {
      console.error('Failed to save quiz result', error);
    } else {
      saved = true;
    }
    saving = false;
  }

  function playAgain() {
    if (!selectedMode) return;
    startQuiz();
  }

  function backToModes() {
    stopTimer();
    selectedMode = null;
    stage = 'select-mode';
  }

  function resultMessage(pct: number): { text: string; icon: typeof PartyPopper } {
    if (pct === 100) return { text: 'Perfect score — cracked the whole stash!', icon: PartyPopper };
    if (pct >= 80) return { text: 'Certified quote expert.', icon: Trophy };
    if (pct >= 50) return { text: 'Solid! You know this crew.', icon: Sparkles };
    return { text: 'Time to reread the archives.', icon: Flame };
  }

  onMount(loadData);
  onDestroy(stopTimer);
</script>

<svelte:head>
  <title>Quiz · QuoteStash</title>
</svelte:head>

<div class="px-5 sm:px-8 py-8 sm:py-10">
  {#if stage !== 'select-mode' && stage !== 'loading' && stage !== 'empty'}
    <button
      onclick={backToModes}
      class="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 transition-colors mb-6"
    >
      <ArrowLeft size={14} />
      Choose a different mode
    </button>
  {/if}

  {#if stage === 'loading'}
    <div class="flex items-center gap-2.5 mb-6">
      <div class="w-9 h-9 rounded-2xl bg-surface-100 dark:bg-surface-900 animate-pulse"></div>
      <div class="h-5 w-24 rounded-lg bg-surface-100 dark:bg-surface-900 animate-pulse"></div>
    </div>
    <div class="grid sm:grid-cols-2 gap-4">
      {#each Array(2) as _}
        <div class="h-44 rounded-3xl bg-surface-100 dark:bg-surface-900 animate-pulse"></div>
      {/each}
    </div>
  {:else if stage === 'empty'}
    <div class="flex items-center gap-2.5 mb-1">
      <div class="flex items-center justify-center w-9 h-9 rounded-2xl bg-linear-to-br from-brand-400 to-brand-600 shadow-sm shadow-brand-500/30 shrink-0">
        <Sparkles size={18} class="text-white" strokeWidth={2.2} />
      </div>
      <h1 class="text-xl font-bold text-surface-900 dark:text-surface-50">Quiz</h1>
    </div>
    <div class="flex flex-col items-center justify-center py-24 text-center px-4">
      <Sparkles size={28} class="text-surface-300 dark:text-surface-700 mb-3" />
      <p class="text-[14px] font-medium text-surface-500 dark:text-surface-400 max-w-sm">
        {members.length < 2
          ? 'Invite a couple more people to this room before quizzing works.'
          : "Add a few quotes where the speaker's name matches a member's name, and a quiz will appear here."}
      </p>
    </div>
  {:else if stage === 'select-mode'}
    <div class="flex items-center gap-2.5 mb-1">
      <div class="flex items-center justify-center w-9 h-9 rounded-2xl bg-linear-to-br from-brand-400 to-brand-600 shadow-sm shadow-brand-500/30 shrink-0">
        <Sparkles size={18} class="text-white" strokeWidth={2.2} />
      </div>
      <h1 class="text-xl font-bold text-surface-900 dark:text-surface-50">Quiz</h1>
    </div>
    <p class="text-[13px] text-surface-500 dark:text-surface-400 mt-1 ml-11.5 mb-7">
      Pick a mode — {pool.length} quotable lines are in the pool.
    </p>

    <div class="mx-auto max-w-2xl grid sm:grid-cols-2 gap-4 sm:pt-30">
      {#each Object.entries(modeMeta) as [id, meta] (id)}
        <button
          type="button"
          onclick={() => chooseMode(id as QuizMode)}
          class="group relative flex flex-col justify-between gap-6 p-6 rounded-3xl text-left bg-linear-to-br {meta.gradient} shadow-lg {meta.glow} hover:-translate-y-1 hover:shadow-xl transition-all duration-200 overflow-hidden min-h-44"
        >
          <div class="absolute -right-6 -bottom-6 w-32 h-32 rounded-full bg-white/10"></div>
          <div class="absolute -right-2 -bottom-14 w-28 h-28 rounded-full bg-white/10"></div>

          <div class="relative flex items-center justify-center w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-sm">
            <meta.icon size={20} class="text-white" strokeWidth={2.2} />
          </div>

          <div class="relative">
            <p class="text-[19px] font-extrabold text-white leading-tight">{meta.title}</p>
            <p class="text-[12.5px] text-white/85 font-medium mt-1.5 leading-snug">{meta.subtitle}</p>
          </div>
        </button>
      {/each}
    </div>
  {:else if stage === 'configure' && selectedMode}
    {@const meta = modeMeta[selectedMode]}
    <div class="flex items-center gap-2.5 mb-1">
      <div class="flex items-center justify-center w-9 h-9 rounded-2xl bg-linear-to-br {meta.gradient} shadow-sm {meta.glow} shrink-0">
        <meta.icon size={18} class="text-white" strokeWidth={2.2} />
      </div>
      <h1 class="text-xl font-bold text-surface-900 dark:text-surface-50">{meta.title}</h1>
    </div>
    <p class="text-[13px] text-surface-500 dark:text-surface-400 mt-1 ml-11.5 mb-7">{meta.subtitle}</p>

    <div class="mx-auto max-w-md p-5 rounded-3xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800">
      
      <div class="flex flex-wrap gap-2 mb-5">
        {#each availableCounts() as n (n)}
          <button
            type="button"
            onclick={() => (questionCount = n)}
            class="h-10 px-4 rounded-xl text-[13px] font-bold transition-colors {questionCount === n
              ? 'bg-surface-900 text-white dark:bg-white dark:text-surface-900'
              : 'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-700'}"
          >
            {n}
          </button>
        {/each}
      </div>

      <button
        type="button"
        onclick={startQuiz}
        class="w-full h-11 rounded-2xl bg-brand-500 hover:bg-brand-600 text-white text-[13.5px] font-bold shadow-sm shadow-brand-500/25 transition-colors flex items-center justify-center gap-2"
      >
        <Zap size={16} strokeWidth={2.5} />
        Start quiz
      </button>
    </div>
  {:else if stage === 'playing' && currentQuestion}
    {@const q = currentQuestion}
    <div class="mx-auto max-w-2xl">
    <!-- progress + timer -->
    <div class="flex items-center justify-between text-[12px] font-semibold text-surface-500 dark:text-surface-400 mb-2">
      <span>Question {currentIndex + 1} of {questions.length}</span>
      <div class="flex items-center gap-3">
        {#if streak >= 2}
          <span class="flex items-center gap-1 text-orange-500">
            <Flame size={13} fill="currentColor" />
            {streak} streak
          </span>
        {/if}
        <span class="flex items-center gap-1">
          <Trophy size={13} class="text-amber-500" />
          {score}/{questions.length}
        </span>
      </div>
    </div>

    <div class="w-full h-1.5 rounded-full bg-surface-100 dark:bg-surface-800 overflow-hidden mb-1">
      <div
        class="h-full rounded-full transition-all"
        style="width: {((currentIndex + (locked ? 1 : 0)) / questions.length) * 100}%; background-color: var(--color-brand-500, #5b50f0);"
      ></div>
    </div>

    <div class="w-full h-1 rounded-full bg-surface-100 dark:bg-surface-800 overflow-hidden mb-7">
      <div
        class="h-full rounded-full transition-all duration-75 ease-linear {timeLeftPct < 25 ? 'bg-red-500' : 'bg-amber-400'}"
        style="width: {timeLeftPct}%;"
      ></div>
    </div>

    <!-- question card -->
    <div class="p-6 sm:p-8 rounded-3xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 text-center mb-5">
      {#if q.kind === 'who_said_it'}
        <p class="text-[11px] font-bold text-brand-500 uppercase tracking-wide mb-3">Who said this?</p>
        <p class="text-[17px] sm:text-[19px] font-bold text-surface-900 dark:text-surface-50 leading-snug wrap-break-word">
          "{q.text}"
        </p>
      {:else}
        <p class="text-[11px] font-bold text-orange-500 uppercase tracking-wide mb-3">Fact or fluff?</p>
        <p class="text-[17px] sm:text-[19px] font-bold text-surface-900 dark:text-surface-50 leading-snug wrap-break-word mb-3">
          "{q.text}"
        </p>
        <div class="flex items-center justify-center gap-2">
          <div
            class="flex items-center justify-center w-6 h-6 rounded-full text-white text-[11px] font-bold"
            style="background-color: {colorFromString(q.shownName)};"
          >
            {q.shownName.charAt(0).toUpperCase()}
          </div>
          <span class="text-[14px] font-semibold text-surface-500 dark:text-surface-400">— {q.shownName}?</span>
        </div>
      {/if}
    </div>

    <!-- answers -->
    {#if q.kind === 'who_said_it'}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {#each q.options as opt, i (opt.id)}
          {@const style = tileStyles[i]}
          {@const isCorrectTile = opt.id === q.correctId}
          {@const isPickedTile = selectedOptionId === opt.id}
          <button
            type="button"
            disabled={locked}
            onclick={() => lockAnswer(opt.id)}
            class="relative flex items-center gap-3 h-16 px-4 rounded-2xl text-left text-white font-bold text-[14px] transition-all disabled:cursor-default {style.bg}
              {locked && isCorrectTile ? 'ring-4 ring-emerald-300 scale-[1.02]' : ''}
              {locked && isPickedTile && !isCorrectTile ? 'ring-4 ring-red-300 opacity-70' : ''}
              {locked && !isPickedTile && !isCorrectTile ? 'opacity-40' : ''}"
          >
            <style.icon size={16} class="shrink-0" fill="currentColor" />
            <span class="truncate">{opt.name}</span>
            {#if locked && isCorrectTile}
              <CheckCircle2 size={18} class="ml-auto shrink-0" />
            {:else if locked && isPickedTile}
              <XCircle size={18} class="ml-auto shrink-0" />
            {/if}
          </button>
        {/each}
      </div>
    {:else}
      <div class="grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={locked}
          onclick={() => lockAnswer('true')}
          class="relative flex flex-col items-center justify-center gap-1.5 h-24 rounded-2xl text-white font-bold transition-all disabled:cursor-default bg-emerald-500 hover:bg-emerald-600
            {locked && q.isTrue ? 'ring-4 ring-emerald-300 scale-[1.02]' : ''}
            {locked && selectedOptionId === 'true' && !q.isTrue ? 'ring-4 ring-red-300 opacity-70' : ''}
            {locked && selectedOptionId !== 'true' && !q.isTrue ? 'opacity-40' : ''}"
        >
          <CheckCircle2 size={22} />
          <span class="text-[14px]">True</span>
        </button>
        <button
          type="button"
          disabled={locked}
          onclick={() => lockAnswer('false')}
          class="relative flex flex-col items-center justify-center gap-1.5 h-24 rounded-2xl text-white font-bold transition-all disabled:cursor-default bg-red-500 hover:bg-red-600
            {locked && !q.isTrue ? 'ring-4 ring-emerald-300 scale-[1.02]' : ''}
            {locked && selectedOptionId === 'false' && q.isTrue ? 'ring-4 ring-red-300 opacity-70' : ''}
            {locked && selectedOptionId !== 'false' && q.isTrue ? 'opacity-40' : ''}"
        >
          <XCircle size={22} />
          <span class="text-[14px]">False</span>
        </button>
      </div>
    {/if}
    </div>
  {:else if stage === 'results'}
    {@const msg = resultMessage(percentScore)}
    <div class="flex flex-col items-center text-center py-6">
      <div class="flex items-center justify-center w-16 h-16 rounded-full bg-linear-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-500/30 mb-5">
        <msg.icon size={28} class="text-white" strokeWidth={2.2} />
      </div>

      <p class="text-[13px] font-bold text-surface-400 uppercase tracking-wide mb-1">Quiz complete</p>
      <p class="text-[40px] font-extrabold text-surface-900 dark:text-surface-50 leading-none mb-1">
        {score}<span class="text-surface-300 dark:text-surface-600">/{questions.length}</span>
      </p>
      <p class="text-[13.5px] font-medium text-surface-500 dark:text-surface-400 mb-6">{msg.text}</p>

      <div class="grid grid-cols-2 gap-3 w-full max-w-xs mb-8">
        <div class="flex flex-col items-center justify-center gap-1 p-4 rounded-3xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800">
          <span class="text-[18px] font-extrabold text-surface-900 dark:text-surface-50">{percentScore}%</span>
          <span class="text-[10px] font-medium text-surface-400 uppercase tracking-wide">Accuracy</span>
        </div>
        <div class="flex flex-col items-center justify-center gap-1 p-4 rounded-3xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800">
          <div class="flex items-center gap-1 text-orange-500">
            <Flame size={14} fill="currentColor" />
            <span class="text-[18px] font-extrabold text-surface-900 dark:text-surface-50">{bestStreak}</span>
          </div>
          <span class="text-[10px] font-medium text-surface-400 uppercase tracking-wide">Best streak</span>
        </div>
      </div>

      {#if saving}
        <p class="text-[11.5px] text-surface-400 mb-4">Saving your result…</p>
      {:else if saved}
        <p class="text-[11.5px] text-emerald-500 font-medium mb-4 flex items-center gap-1">
          <CheckCircle2 size={13} />
          Saved to the leaderboard
        </p>
      {/if}

      <div class="flex flex-wrap items-center justify-center gap-2.5">
        <button
          type="button"
          onclick={playAgain}
          class="flex items-center gap-1.5 h-10 px-4 rounded-2xl bg-brand-500 hover:bg-brand-600 text-white text-[13px] font-semibold shadow-sm shadow-brand-500/25 transition-colors"
        >
          <RotateCcw size={15} />
          Play again
        </button>
        <button
          type="button"
          onclick={backToModes}
          class="flex items-center gap-1.5 h-10 px-4 rounded-2xl bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-200 text-[13px] font-semibold hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
        >
          Try the other mode
        </button>
        <a
          href="/rooms/{roomId}/leaderboard"
          class="flex items-center gap-1.5 h-10 px-4 rounded-2xl text-surface-500 dark:text-surface-400 text-[13px] font-semibold hover:text-surface-800 dark:hover:text-surface-100 transition-colors"
        >
          <Trophy size={15} />
          View leaderboard
        </a>
      </div>
    </div>
  {/if}
</div>