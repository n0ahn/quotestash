<script lang="ts">
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
</script>

<svelte:head>
  <title>QuoteStash</title>
  <meta name="description" content="Save funny quotes with your group." />
</svelte:head>

<div
  class="
    relative min-h-screen flex flex-col items-center justify-center
    px-5 py-24
    bg-zinc-50 dark:bg-zinc-950
    transition-colors duration-200
  "
>
  <!-- Subtle radial glow — brand accent, barely visible -->
  <div
    aria-hidden="true"
    class="
      pointer-events-none absolute inset-0 overflow-hidden
    "
  >
    <div
      class="
        absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2
        w-150 h-100 rounded-full
        opacity-[0.06] dark:opacity-[0.09]
        blur-[120px]
      "
      style="background: radial-gradient(ellipse, var(--color-brand-500) 0%, transparent 70%);"
    ></div>
  </div>

  <!-- Top-right nav CTAs -->
  <div class="fixed top-4 right-4 z-50 flex items-center gap-2">
    <a
      href="/auth/login"
      class="
        flex items-center justify-center
        h-9 px-4 rounded-full
        text-[13px] font-semibold
        text-zinc-700 dark:text-zinc-200
        hover:bg-black/4 dark:hover:bg-white/6
        transition-colors duration-150 cursor-pointer
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
  </div>

  <div class="relative z-10 flex flex-col items-center w-full max-w-sm">

    <!-- Logo mark -->
    <div class="mb-8 flex items-center gap-3">
      <div class="flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-500">
        <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="white">
          <path d="M11.192 15.757c0-.88-.23-1.618-.69-2.217-.326-.412-.768-.683-1.327-.812-.55-.128-1.07-.137-1.54-.028-.16-.95.1-1.956.76-3.022.66-1.065 1.515-1.867 2.558-2.403L9.373 5c-.8.396-1.56.898-2.26 1.505-.71.607-1.34 1.305-1.9 2.094s-.98 1.68-1.25 2.69-.346 2.04-.217 3.1c.168 1.4.62 2.52 1.356 3.35.735.84 1.652 1.26 2.748 1.26.965 0 1.766-.29 2.4-.878.628-.576.94-1.365.94-2.365zm9.124 0c0-.88-.23-1.618-.69-2.217-.326-.42-.77-.692-1.327-.817-.56-.124-1.074-.13-1.54-.022-.16-.94.09-1.95.75-3.02.66-1.06 1.514-1.86 2.557-2.4L18.49 5c-.8.396-1.555.898-2.26 1.505-.708.607-1.34 1.305-1.894 2.094-.556.79-.97 1.68-1.24 2.69-.273 1-.345 2.04-.217 3.1.168 1.4.62 2.52 1.356 3.35.735.84 1.652 1.26 2.748 1.26.965 0 1.766-.29 2.4-.878.628-.576.94-1.365.94-2.365z"/>
        </svg>
      </div>
      <span class="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">Quote<span class="text-brand-500">Stash</span></span>
    </div>

    <!-- Headline -->
    <h1
      class="
        text-[2.6rem] sm:text-5xl font-extrabold tracking-tight leading-[1.06]
        text-center text-zinc-900 dark:text-zinc-50
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
        mt-4 text-[15px] leading-relaxed text-center
        text-zinc-500 dark:text-zinc-400
        max-w-65
      "
    >
      Save funny quotes with your group — filter, favorite, and play quizzes.
    </p>

    <!-- Divider -->
    <div class="mt-14 mb-6 flex items-center gap-3 w-full">
      <div class="flex-1 h-px bg-zinc-900/6 dark:bg-white/6"></div>
      <p class="text-[11px] font-medium tracking-widest uppercase text-zinc-400 dark:text-zinc-600 shrink-0">
        Popular quotes
      </p>
      <div class="flex-1 h-px bg-zinc-900/6 dark:bg-white/6"></div>
    </div>

    <!-- Preview quote cards -->
    <div class="flex flex-col gap-2.5 w-full">
      {#each previewQuotes as item (item.user)}
        <div
          class="
            flex items-start gap-3
            px-4 py-3.5 rounded-2xl
            bg-white dark:bg-zinc-900
            border border-black/6 dark:border-white/6
            shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none
          "
        >
          <!-- Color dot / avatar — per-quote generated color, kept as inline data (see spec: auto-generated color per quote) -->
          <div
            class="shrink-0 flex items-center justify-center w-7 h-7 rounded-full mt-0.5 text-white text-[11px] font-bold"
            style="background-color: {item.color};"
          >
            {item.initials}
          </div>

          <div class="flex-1 min-w-0">
            <p class="text-[13px] font-medium text-zinc-800 dark:text-zinc-100 leading-snug">
              "{item.quote}"
            </p>
            <p class="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500 font-medium">
              {item.user}
            </p>
          </div>
        </div>
      {/each}
    </div>

    <!-- Bottom hint -->
    <p class="mt-8 text-[12px] text-zinc-400 dark:text-zinc-600 text-center">
      Join a room with a code from your group.
    </p>

  </div>
</div>