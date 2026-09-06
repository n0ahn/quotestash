<script lang="ts">
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';

  const previewQuotes = [
    {
      color: '#7C6FF7',
      user: 'Lotte',
      initials: 'L',
      quote: "I'd have said that too if I were sober.",
    },
    {
      color: '#34D399',
      user: 'Daan',
      initials: 'D',
      quote: "I just don't sleep anymore, that's my strategy.",
    },
    {
      color: '#FB923C',
      user: 'Eva',
      initials: 'E',
      quote: 'Officially, this is a meeting.',
    },
  ] as const;

  let checkingAuth = $state(true);
  let isLoggedIn = $state(false);

  onMount(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    isLoggedIn = !!user;
    checkingAuth = false;
  });
</script>

<svelte:head>
  <title>QuoteStash</title>
  <meta name="description" content="Save funny quotes with your group." />
</svelte:head>
<div class="app-ambient default-blobs"></div>
<div
  class="
    relative min-h-screen flex flex-col items-center justify-center
    px-5 py-24 overflow-hidden
    
    transition-colors duration-200
  "
>
  <!-- Ambient gradient blobs — zelfde systeem als de rest van de app -->
  

  <!-- Top-right nav CTAs -->
  <div class="fixed top-5.5 right-4 z-102 flex items-center gap-2">
    {#if !checkingAuth}
      {#if isLoggedIn}
        <a
          href="/rooms"
          class="
            flex items-center justify-center
            h-9 px-4 rounded-full
            bg-brand-500 hover:bg-brand-600 active:scale-[0.98]
            text-white text-[13px] font-semibold
            shadow-lg shadow-brand-500/30
            transition-all duration-150 cursor-pointer
          "
        >
          Go to dashboard
        </a>
      {:else}
        <a
          href="/auth/login"
          class="
            glass-chrome
            flex items-center justify-center
            h-9 px-4 rounded-full
            text-[13px] font-semibold
            text-surface-700 dark:text-surface-200
            hover:bg-white/90 dark:hover:bg-surface-800/70
            transition-all duration-150 cursor-pointer
          "
        >
          Log in
        </a>
        <a
          href="/auth/register"
          class="
            flex items-center justify-center
            h-9 px-4 rounded-full
            bg-brand-500 hover:bg-brand-600 active:scale-[0.98]
            text-white text-[13px] font-semibold
            shadow-lg shadow-brand-500/30
            transition-all duration-150 cursor-pointer
          "
        >
          Get started
        </a>
      {/if}
    {/if}
  </div>

  <!-- Main Content Wrapper -->
  <div class="relative z-10 flex flex-col items-center w-full max-w-sm lg:max-w-xl lg:items-start lg:mr-48">

    <!-- Logo mark -->
    <div class="mb-7 items-center gap-3 hidden sm:flex">
      <div class="flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-500 shadow-lg shadow-brand-500/20">
        <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="white">
          <path d="M11.192 15.757c0-.88-.23-1.618-.69-2.217-.326-.412-.768-.683-1.327-.812-.55-.128-1.07-.137-1.54-.028-.16-.95.1-1.956.76-3.022.66-1.065 1.515-1.867 2.558-2.403L9.373 5c-.8.396-1.56.898-2.26 1.505-.71.607-1.34 1.305-1.9 2.094s-.98 1.68-1.25 2.69-.346 2.04-.217 3.1c.168 1.4.62 2.52 1.356 3.35.735.84 1.652 1.26 2.748 1.26.965 0 1.766-.29 2.4-.878.628-.576.94-1.365.94-2.365zm9.124 0c0-.88-.23-1.618-.69-2.217-.326-.42-.77-.692-1.327-.817-.56-.124-1.074-.13-1.54-.022-.16-.94.09-1.95.75-3.02.66-1.06 1.514-1.86 2.557-2.4L18.49 5c-.8.396-1.555.898-2.26 1.505-.708.607-1.34 1.305-1.894 2.094-.556.79-.97 1.68-1.24 2.69-.273 1-.345 2.04-.217 3.1.168 1.4.62 2.52 1.356 3.35.735.84 1.652 1.26 2.748 1.26.965 0 1.766-.29 2.4-.878.628-.576.94-1.365.94-2.365z"/>
        </svg>
      </div>
      <span class="text-3xl font-bold tracking-tight text-surface-900 dark:text-white">Quote<span class="text-brand-500">Stash</span></span>
    </div>

    <!-- Headline -->
    <h1
      class="
        text-[2.6rem] sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.06]
        text-center lg:text-left text-surface-900 dark:text-surface-50
      "
    >
      Save the quotes<br />
      <span
        class="
          bg-linear-to-r from-brand-500 to-brand-400
          bg-clip-text text-transparent
        "
      >
        that matter.
      </span>
    </h1>

    <!-- Subline -->
    <p
      class="
        mt-4 text-[15px] sm:text-base leading-relaxed text-center lg:text-left
        text-surface-500 dark:text-surface-400
        max-w-md
      "
    >
      Save funny quotes with your group — filter, favorite, and play quizzes.
    </p>

    <!-- Divider -->
    <div class="mt-10 mb-6 flex items-center gap-3 w-full">
      <div class="flex-1 h-px bg-surface-900/6 dark:bg-white/6"></div>
      <p class="text-[11px] font-medium tracking-widest uppercase text-surface-400 dark:text-surface-600 shrink-0">
        Popular quotes
      </p>
      <div class="flex-1 h-px bg-surface-900/6 dark:bg-white/6"></div>
    </div>

    <!-- Preview quote cards -->
    <div class="flex flex-col gap-2.5 w-full">
      {#each previewQuotes as item (item.user)}
        <div
          class="
            glass
            flex items-start gap-3
            px-4 py-3.5 rounded-2xl
            transition-shadow
          "
        >
          <div
            class="shrink-0 flex items-center justify-center w-7 h-7 rounded-full mt-0.5 text-white text-[11px] font-bold ring-2 ring-white/70 dark:ring-surface-900/70 shadow-[0_1px_0_0_rgba(255,255,255,0.3)_inset,0_4px_10px_-2px_rgba(0,0,0,0.2)]"
            style="background-color: {item.color};"
          >
            {item.initials}
          </div>

          <div class="flex-1 min-w-0">
            <p class="text-[13px] font-medium text-surface-800 dark:text-surface-100 leading-snug">
              "{item.quote}"
            </p>
            <p class="mt-1 text-[11px] text-surface-400 dark:text-surface-500 font-medium">
              {item.user}
            </p>
          </div>
        </div>
      {/each}
    </div>

    <!-- Bottom hint -->
    <p class="mt-6 text-[12px] text-surface-400 dark:text-surface-600 text-center lg:text-left">
      Join a room with a code from your group.
    </p>

  </div>

  <!-- Schuine Mockup Screenshot / UI Card (loopt half van het scherm af aan de rechterkant op desktop) -->
  <div
    class="
      hidden lg:block absolute -right-40 top-1/2 -translate-y-1/2
      w-160 pointer-events-none select-none z-0
      transform rotate-6 skew-y-3 scale-105
      opacity-95 dark:opacity-90
    "
  >
    <div
      class="
        glass-panel
        rounded-3xl p-6
        shadow-2xl shadow-brand-500/10
        overflow-hidden
      "
    >
      <!-- Nep app-interface / mockup content om de schermafbeelding na te bootsen -->
      <div class="flex items-center justify-between pb-4 border-b border-black/[0.06] dark:border-white/[0.08] mb-4">
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-full bg-red-400"></div>
          <div class="w-3 h-3 rounded-full bg-yellow-400"></div>
          <div class="w-3 h-3 rounded-full bg-green-400"></div>
        </div>
        <div class="h-4 w-32 rounded-md bg-black/[0.05] dark:bg-white/[0.08]"></div>
      </div>

      <div class="space-y-3 opacity-80">
        <div class="h-20 rounded-2xl bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm p-4 border border-black/[0.05] dark:border-white/[0.06] flex items-center gap-4">
          <div class="w-10 h-10 rounded-full bg-brand-500/20 shrink-0"></div>
          <div class="space-y-2 flex-1">
            <div class="h-3 w-3/4 rounded bg-surface-900/10 dark:bg-white/10"></div>
            <div class="h-2.5 w-1/2 rounded bg-surface-900/[0.06] dark:bg-white/[0.06]"></div>
          </div>
        </div>
        <div class="h-20 rounded-2xl bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm p-4 border border-black/[0.05] dark:border-white/[0.06] flex items-center gap-4">
          <div class="w-10 h-10 rounded-full bg-emerald-500/20 shrink-0"></div>
          <div class="space-y-2 flex-1">
            <div class="h-3 w-4/5 rounded bg-surface-900/10 dark:bg-white/10"></div>
            <div class="h-2.5 w-1/3 rounded bg-surface-900/[0.06] dark:bg-white/[0.06]"></div>
          </div>
        </div>
        <div class="h-20 rounded-2xl bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm p-4 border border-black/[0.05] dark:border-white/[0.06] flex items-center gap-4">
          <div class="w-10 h-10 rounded-full bg-amber-500/20 shrink-0"></div>
          <div class="space-y-2 flex-1">
            <div class="h-3 w-2/3 rounded bg-surface-900/10 dark:bg-white/10"></div>
            <div class="h-2.5 w-2/5 rounded bg-surface-900/[0.06] dark:bg-white/[0.06]"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>