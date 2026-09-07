<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabase';
  import { Loader2, PartyPopper, ShieldAlert } from 'lucide-svelte';

  let status = $state<'checking' | 'joining' | 'error' | 'not-logged-in'>('checking');
  let errorMsg = $state('');

  async function attemptJoin() {
    const code = page.url.searchParams.get('code')?.trim().toUpperCase();

    if (!code) {
      goto('/rooms');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // Preserve the code across login so the join continues right after.
      status = 'not-logged-in';
      goto(`/auth/login?next=/rooms/join?code=${code}`);
      return;
    }

    status = 'joining';

    const { error: rpcError } = await supabase.rpc('join_room', { room_code: code } as never);

    if (rpcError && !rpcError.message.includes('duplicate')) {
      status = 'error';
      errorMsg = rpcError.message || "Couldn't join that room. Check the invite and try again.";
      return;
    }

    const { data: room, error: fetchError } = await supabase
      .from('rooms')
      .select('id')
      .eq('code', code)
      .single<{ id: string }>();

    if (fetchError || !room) {
      status = 'error';
      errorMsg = 'Joined, but could not open the room. Try refreshing.';
      return;
    }

    goto(`/rooms/${room.id}`);
  }

  onMount(attemptJoin);
</script>

<svelte:head>
  <title>Join room · QuoteStash</title>
</svelte:head>

<div class="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
  {#if status === 'checking' || status === 'joining' || status === 'not-logged-in'}
    <Loader2 size={28} class="animate-spin text-brand-500 mb-4" />
    <p class="text-[14px] font-medium text-surface-600 dark:text-surface-300">
      {status === 'joining' ? 'Joining the room…' : 'One sec…'}
    </p>
  {:else if status === 'error'}
    <div class="w-11 h-11 rounded-2xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center text-surface-400 mb-3">
      <ShieldAlert size={20} />
    </div>
    <p class="text-[14px] font-semibold text-surface-700 dark:text-surface-200">Couldn't join</p>
    <p class="text-[12.5px] text-surface-400 dark:text-surface-500 mt-1 max-w-xs">{errorMsg}</p>
    <a
      href="/rooms"
      class="mt-5 h-10 px-5 rounded-xl text-[13px] font-semibold bg-brand-500 text-white hover:bg-brand-600 transition-colors flex items-center gap-1.5"
    >
      <PartyPopper size={14} />
      Go to your rooms
    </a>
  {/if}
</div>