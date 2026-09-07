<script lang="ts">
  import { supabase } from '$lib/supabase';
  import { goto } from '$app/navigation';
  import { Eye, EyeOff } from 'lucide-svelte';

  let firstName = $state('');
  let email = $state('');
  let password = $state('');
  let showPassword = $state(false);
  let agreedToTerms = $state(false);
  let loading = $state(false);
  let errorMsg = $state('');

  async function handleRegister(e: SubmitEvent) {
    e.preventDefault();
    if (!firstName.trim() || !email.trim() || !password || !agreedToTerms) return;

    loading = true;
    errorMsg = '';

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { first_name: firstName.trim() } }
    });

    loading = false;

    if (error) {
      errorMsg = error.message;
      return;
    }

    goto('/rooms');
  }
</script>

<svelte:head>
  <title>Sign Up · QuoteStash</title>
</svelte:head>

<div class="relative min-h-screen flex flex-col justify-center px-5 py-12 overflow-hidden">
  <div class="app-ambient default-blobs"></div>

  <div class="relative z-10 mx-auto w-full max-w-sm">
    <div class="flex flex-col items-center mb-8 text-center">
      <h2 class="text-2xl font-bold text-surface-900 dark:text-surface-50">Create an account</h2>
      <p class="text-[13px] text-surface-500 dark:text-surface-400 mt-1.5">Start collecting quotes with your team</p>
    </div>

    <div class="glass-panel rounded-3xl p-7">
      <form onsubmit={handleRegister} class="space-y-4">
        <div>
          <label for="firstName" class="block text-[12px] font-semibold text-surface-600 dark:text-surface-400 mb-1.5">First name</label>
          <input
            id="firstName"
            type="text"
            required
            bind:value={firstName}
            placeholder="Jane"
            class="w-full h-11 px-4 rounded-2xl text-[14px] bg-black/[0.03] dark:bg-white/[0.05] backdrop-blur-sm border border-black/[0.05] dark:border-white/[0.08] text-surface-900 dark:text-surface-100 placeholder-surface-400 dark:placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/50 focus:bg-white/60 dark:focus:bg-white/[0.08] transition-all"
          />
        </div>

        <div>
          <label for="email" class="block text-[12px] font-semibold text-surface-600 dark:text-surface-400 mb-1.5">Email</label>
          <input
            id="email"
            type="email"
            required
            bind:value={email}
            placeholder="you@example.com"
            class="w-full h-11 px-4 rounded-2xl text-[14px] bg-black/[0.03] dark:bg-white/[0.05] backdrop-blur-sm border border-black/[0.05] dark:border-white/[0.08] text-surface-900 dark:text-surface-100 placeholder-surface-400 dark:placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/50 focus:bg-white/60 dark:focus:bg-white/[0.08] transition-all"
          />
        </div>

        <div>
          <label for="password" class="block text-[12px] font-semibold text-surface-600 dark:text-surface-400 mb-1.5">Password</label>
          <div class="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              required
              bind:value={password}
              placeholder="••••••••"
              class="w-full h-11 pl-4 pr-11 rounded-2xl text-[14px] bg-black/[0.03] dark:bg-white/[0.05] backdrop-blur-sm border border-black/[0.05] dark:border-white/[0.08] text-surface-900 dark:text-surface-100 placeholder-surface-400 dark:placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/50 focus:bg-white/60 dark:focus:bg-white/[0.08] transition-all"
            />
            <button
              type="button"
              onclick={() => (showPassword = !showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              class="absolute inset-y-0 right-0 flex items-center justify-center w-11 text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 transition-colors"
            >
              {#if showPassword}
                <EyeOff size={17} />
              {:else}
                <Eye size={17} />
              {/if}
            </button>
          </div>
        </div>

        {#if errorMsg}
          <p class="text-[13px] text-red-500 dark:text-red-400">{errorMsg}</p>
        {/if}

        <label class="flex items-start gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            bind:checked={agreedToTerms}
            class="mt-0.5 w-4 h-4 rounded accent-brand-500 shrink-0"
          />
          <span class="text-[12.5px] text-surface-500 dark:text-surface-400 leading-snug">
            I agree to the
            <a href="/legal/terms" target="_blank" class="font-semibold text-brand-500 hover:text-brand-600 transition-colors">Terms &amp; Conditions</a>
            and
            <a href="/legal/privacy" target="_blank" class="font-semibold text-brand-500 hover:text-brand-600 transition-colors">Privacy Policy</a>.
          </span>
        </label>

        <button
          type="submit"
          disabled={loading || !firstName.trim() || !email.trim() || !password || !agreedToTerms}
          class="w-full h-11 rounded-2xl text-[14px] font-semibold text-white bg-brand-500 hover:bg-brand-600 shadow-sm shadow-brand-500/25 disabled:opacity-40 disabled:pointer-events-none transition-colors mt-2"
        >
          {loading ? 'Creating account…' : 'Sign up'}
        </button>
      </form>

      <p class="mt-6 text-center text-[13px] text-surface-500 dark:text-surface-400">
        Already have an account?
        <a href="/auth/login" class="font-semibold text-brand-500 hover:text-brand-600 transition-colors">
          Sign in
        </a>
      </p>
    </div>
  </div>
</div>