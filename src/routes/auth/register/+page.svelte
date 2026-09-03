<script lang="ts">
  import { supabase } from '$lib/supabase';
  import { goto } from '$app/navigation';

  let firstName = $state('');
  let email = $state('');
  let password = $state('');
  let loading = $state(false);
  let errorMsg = $state('');

  async function handleRegister(e: SubmitEvent) {
    e.preventDefault();
    if (!firstName.trim() || !email.trim() || !password) return;

    loading = true;
    errorMsg = '';

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          first_name: firstName.trim()
        }
      }
    });

    loading = false;
    
    if (error) {
      errorMsg = error.message;
      return;
    }

    // Geen handmatige profiel-upsert meer! De database trigger regelt dit automatisch.
    goto('/rooms');
  }
</script>

<svelte:head>
  <title>Sign Up · QuoteStash</title>
</svelte:head>

<div class="min-h-screen bg-surface-50 dark:bg-surface-950 flex flex-col justify-center px-5 py-12 transition-colors duration-200">
  <div aria-hidden="true" class="pointer-events-none fixed inset-0 overflow-hidden">
    <div
      class="absolute left-1/2 top-1/4 -translate-x-1/2 w-150 h-80 rounded-full opacity-[0.05] dark:opacity-[0.08] blur-[100px]"
      style="background: radial-gradient(ellipse, var(--color-brand-500) 0%, transparent 70%);"
    ></div>
  </div>

  <div class="relative z-10 sm:mx-auto sm:w-full sm:max-w-md">
    <div class="flex flex-col items-center mb-8 text-center">
      <div class="flex items-center gap-3 mb-6">
        <div class="flex items-center justify-center w-12 h-12 rounded-2xl bg-brand-500 shadow-md shadow-brand-500/20">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" class="text-surface-50">
            <path d="M11.192 15.757c0-.88-.23-1.618-.69-2.217-.326-.412-.768-.683-1.327-.812-.55-.128-1.07-.137-1.54-.028-.16-.95.1-1.956.76-3.022.66-1.065 1.515-1.867 2.558-2.403L9.373 5c-.8.396-1.56.898-2.26 1.505-.71.607-1.34 1.305-1.9 2.094s-.98 1.68-1.25 2.69-.346 2.04-.217 3.1c.168 1.4.62 2.52 1.356 3.35.735.84 1.652 1.26 2.748 1.26.965 0 1.766-.29 2.4-.878.628-.576.94-1.365.94-2.365zm9.124 0c0-.88-.23-1.618-.69-2.217-.326-.42-.77-.692-1.327-.817-.56-.124-1.074-.13-1.54-.022-.16-.94.09-1.95.75-3.02.66-1.06 1.514-1.86 2.557-2.4L18.49 5c-.8.396-1.555.898-2.26 1.505-.708.607-1.34 1.305-1.894 2.094-.556.79-.97 1.68-1.24 2.69-.273 1-.345 2.04-.217 3.1.168 1.4.62 2.52 1.356 3.35.735.84 1.652 1.26 2.748 1.26.965 0 1.766-.29 2.4-.878.628-.576.94-1.365.94-2.365z"/>
          </svg>
        </div>
        <span class="text-2xl font-bold tracking-tight text-surface-900 dark:text-surface-50">Quote<span class="text-brand-500">Stash</span></span>
      </div>

      <h2 class="text-xl font-bold text-surface-900 dark:text-surface-50">Create an account</h2>
      <p class="text-[13px] text-surface-500 dark:text-surface-400 mt-1">Start collecting quotes with your team</p>
    </div>

    <div class="bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.05)] dark:shadow-none p-6">
      <form onsubmit={handleRegister} class="space-y-4">
        <div>
          <label for="firstName" class="block text-[12px] font-semibold text-surface-700 dark:text-surface-300 mb-1.5">First name</label>
          <input
            id="firstName"
            type="text"
            required
            bind:value={firstName}
            placeholder="Jane"
            class="w-full h-10 px-3.5 rounded-xl text-[13px] bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-surface-900 dark:text-surface-100 placeholder-surface-400 dark:placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all duration-150"
          />
        </div>

        <div>
          <label for="email" class="block text-[12px] font-semibold text-surface-700 dark:text-surface-300 mb-1.5">Email</label>
          <input
            id="email"
            type="email"
            required
            bind:value={email}
            placeholder="you@example.com"
            class="w-full h-10 px-3.5 rounded-xl text-[13px] bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-surface-900 dark:text-surface-100 placeholder-surface-400 dark:placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all duration-150"
          />
        </div>

        <div>
          <label for="password" class="block text-[12px] font-semibold text-surface-700 dark:text-surface-300 mb-1.5">Password</label>
          <input
            id="password"
            type="password"
            required
            bind:value={password}
            placeholder="••••••••"
            class="w-full h-10 px-3.5 rounded-xl text-[13px] bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-surface-900 dark:text-surface-100 placeholder-surface-400 dark:placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all duration-150"
          />
        </div>

        {#if errorMsg}
          <p class="text-[12px] text-brand-600 dark:text-brand-400">{errorMsg}</p>
        {/if}

        <button
          type="submit"
          disabled={loading || !firstName.trim() || !email.trim() || !password}
          class="w-full h-10 rounded-xl text-[13px] font-semibold text-brand-50 bg-brand-500 hover:bg-brand-600 shadow-sm shadow-brand-500/25 disabled:opacity-40 disabled:pointer-events-none transition-colors mt-2"
        >
          {loading ? 'Creating account…' : 'Sign up'}
        </button>
      </form>

      <p class="mt-6 text-center text-[13px] text-surface-500 dark:text-surface-400">
        Already have an account?
        <a href="/auth/login" class="font-semibold text-brand-500 hover:text-brand-600 dark:hover:text-brand-400 transition-colors">
          Sign in
        </a>
      </p>
    </div>
  </div>
</div>