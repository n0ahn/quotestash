<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { supabase } from '$lib/supabase';
  import { Users, Crown, UserMinus, Search, X } from 'lucide-svelte';
  import Avatar from '$lib/components/Avatar.svelte';

  const roomId = $derived(page.params.id!);

  type Member = {
    id: string;
    first_name: string;
    avatar_url: string | null;
    quoteCount: number;
    favoritesEarned: number;
  };

  let loading = $state(true);
  let members = $state<Member[]>([]);
  let ownerId = $state('');
  let currentUserId = $state('');
  let searchQuery = $state('');
  let removingId = $state<string | null>(null);

  const isOwner = $derived(currentUserId === ownerId);

  const filteredMembers = $derived.by(() => {
    let result = [...members].sort((a, b) => {
      // Owner always first
      if (a.id === ownerId) return -1;
      if (b.id === ownerId) return 1;
      return b.quoteCount - a.quoteCount;
    });

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((m) => m.first_name.toLowerCase().includes(q));
    }

    return result;
  });

  async function loadData() {
    loading = true;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    currentUserId = user.id;

    const { data: roomData } = await supabase.from('rooms').select('owner_id').eq('id', roomId).single();
    ownerId = roomData?.owner_id ?? '';

    const { data: membersData, error: membersError } = await supabase
      .from('room_members')
      .select('user_id, users(id, first_name, avatar_url)')
      .eq('room_id', roomId);

    if (membersError) {
      console.error('members load error', membersError);
      loading = false;
      return;
    }

    const baseMembers = (membersData ?? [])
      .filter((m: any) => m.users)
      .map((m: any) => {
        const u = Array.isArray(m.users) ? m.users[0] : m.users;
        return { id: u!.id as string, first_name: u!.first_name as string, avatar_url: (u!.avatar_url as string | null) ?? null };
      });

    const { data: quotesData, error: quotesError } = await supabase
      .from('quotes')
      .select('id, added_by')
      .eq('room_id', roomId);

    if (quotesError) console.error('quotes load error', quotesError);

    const quoteCounts: Record<string, number> = {};
    const quoteIdsByUser: Record<string, string[]> = {};
    for (const q of quotesData ?? []) {
      quoteCounts[q.added_by] = (quoteCounts[q.added_by] ?? 0) + 1;
      (quoteIdsByUser[q.added_by] ??= []).push(q.id);
    }

    const allQuoteIds = (quotesData ?? []).map((q) => q.id);
    let favByQuoteId: Record<string, number> = {};

    if (allQuoteIds.length > 0) {
      const { data: favData, error: favError } = await supabase
        .from('quote_favorites')
        .select('quote_id')
        .in('quote_id', allQuoteIds);

      if (favError) console.error('favorites load error', favError);

      for (const row of favData ?? []) {
        favByQuoteId[row.quote_id] = (favByQuoteId[row.quote_id] ?? 0) + 1;
      }
    }

    members = baseMembers.map((m) => {
      const myQuoteIds = quoteIdsByUser[m.id] ?? [];
      const favoritesEarned = myQuoteIds.reduce((sum, qid) => sum + (favByQuoteId[qid] ?? 0), 0);
      return {
        ...m,
        quoteCount: quoteCounts[m.id] ?? 0,
        favoritesEarned
      };
    });

    loading = false;
  }

  async function removeMember(memberId: string) {
    if (memberId === ownerId) return;

    removingId = null;
    const previous = members;
    members = members.filter((m) => m.id !== memberId);

    const { error } = await supabase
      .from('room_members')
      .delete()
      .eq('room_id', roomId)
      .eq('user_id', memberId);

    if (error) {
      console.error('Failed to remove member', error);
      members = previous;
    }
  }

  onMount(loadData);
</script>

<svelte:head>
  <title>Members · QuoteStash</title>
</svelte:head>

<div class="px-5 sm:px-8 py-8 sm:py-10 max-w-3xl">
  <div class="flex items-center gap-2.5 mb-1">
    <div class="flex items-center justify-center w-9 h-9 rounded-2xl bg-linear-to-br from-brand-400 to-brand-600 shadow-sm shadow-brand-500/30 shrink-0">
      <Users size={18} class="text-white" strokeWidth={2.2} />
    </div>
    <h1 class="text-xl font-bold text-surface-900 dark:text-surface-50">Members</h1>
  </div>
  <p class="text-[13px] text-surface-500 dark:text-surface-400 mt-1 ml-11.5">
    {members.length} {members.length === 1 ? 'person' : 'people'} in this room
  </p>

  {#if members.length > 4}
    <div class="relative mt-6 mb-2">
      <Search size={16} class="absolute left-4 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none" />
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search members..."
        class="w-full h-11 pl-11 pr-4 rounded-2xl text-[13.5px] glass-inset border border-transparent text-surface-900 dark:text-surface-100 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 transition-all"
      />
    </div>
  {/if}

  <div class="mt-6 flex flex-col gap-2.5">
    {#if loading}
      {#each Array(5) as _}
        <div class="h-17 rounded-3xl bg-surface-100 dark:bg-surface-900 animate-pulse"></div>
      {/each}
    {:else if filteredMembers.length === 0}
      <div class="flex flex-col items-center justify-center py-20 text-center px-4">
        <p class="text-[14px] font-medium text-surface-500 dark:text-surface-400">
          {members.length === 0 ? 'No members yet.' : 'No members match your search.'}
        </p>
      </div>
    {:else}
      {#each filteredMembers as member (member.id)}
        {@const memberIsOwner = member.id === ownerId}
        <div class="group relative flex items-center gap-3 p-3.5 sm:p-4 rounded-3xl glass hover:shadow-[0_8px_30px_-6px_rgba(0,0,0,0.10)] dark:hover:shadow-[0_8px_30px_-6px_rgba(0,0,0,0.4)] hover:-translate-y-0.5 transition-all duration-200">
          <a
            href="/rooms/{roomId}/members/{member.id}"
            class="flex items-center gap-3 flex-1 min-w-0"
          >
            <Avatar name={member.first_name} avatarUrl={member.avatar_url} size={44} class="rounded-2xl! text-[15px]" />

            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5 min-w-0">
                <p class="text-[14px] font-bold text-surface-900 dark:text-surface-50 truncate">{member.first_name}</p>
                {#if memberIsOwner}
                  <Crown size={14} class="text-amber-400 shrink-0" fill="currentColor" />
                {/if}
                {#if member.id === currentUserId}
                  <span class="text-[10px] font-semibold text-brand-500 bg-brand-500/10 px-1.5 py-0.5 rounded-md shrink-0">You</span>
                {/if}
              </div>
              <p class="text-[11.5px] text-surface-400 dark:text-surface-500 font-medium truncate">
                {member.quoteCount} {member.quoteCount === 1 ? 'quote' : 'quotes'} added · {member.favoritesEarned} {member.favoritesEarned === 1 ? 'like' : 'likes'} earned
              </p>
            </div>
          </a>

          {#if isOwner && !memberIsOwner}
            <div class="shrink-0">
              {#if removingId === member.id}
                <div class="flex items-center gap-1">
                  <button
                    onclick={() => removeMember(member.id)}
                    class="text-[11px] font-bold text-white bg-red-500 hover:bg-red-600 active:scale-95 px-2.5 py-1.5 rounded-full transition-all"
                  >
                    Confirm?
                  </button>
                  <button
                    onclick={() => (removingId = null)}
                    aria-label="Cancel remove"
                    class="p-1.5 rounded-full text-surface-400 hover:text-surface-600 dark:hover:text-surface-300"
                  >
                    <X size={14} />
                  </button>
                </div>
              {:else}
                <button
                  onclick={() => (removingId = member.id)}
                  aria-label="Remove member"
                  title="Remove member"
                  class="p-2 rounded-full text-surface-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 active:scale-90 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                >
                  <UserMinus size={16} />
                </button>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</div>