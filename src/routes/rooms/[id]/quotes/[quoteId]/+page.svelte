<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { supabase, getCurrentProfile } from '$lib/supabase';
  import { Heart, AlertTriangle, Trash2, ArrowLeft, X, MessageCircle, Send, CornerDownRight, SmilePlus } from 'lucide-svelte';
  import type { QuoteWithDetails, CommentWithDetails } from '$lib/database.types';
  import type { RealtimeChannel } from '@supabase/supabase-js';

  const roomId = $derived(page.params.id!);
  const quoteId = $derived(page.params.quoteId!);

  let quote = $state<QuoteWithDetails | null>(null);
  let loading = $state(true);
  let currentUserId = $state('');
  let myFirstName = $state('You');
  let isRoomOwner = $state(false);
  let favoriteCount = $state(0);
  let isFavorited = $state(false);
  let favoriteUsers = $state<{ user_id: string; first_name: string }[]>([]);
  let showFavoritesList = $state(false);
  let isQuoteOwner = $state(false);

  // Comments state — comments is a flat list; topLevelComments derives the tree for rendering
  let comments = $state<CommentWithDetails[]>([]);
  let commentsLoading = $state(true);
  let newCommentText = $state('');
  let submittingComment = $state(false);

  // Reply state: which comment (top-level) are we replying inside, and who specifically (for the "> name" prefix)
  let replyingToCommentId = $state<string | null>(null);
  let replyingToName = $state<string | null>(null);
  let replyText = $state('');
  let submittingReply = $state(false);

  // Emoji reactions state — grouped by emoji, with count + whether I reacted
  const QUICK_REACTIONS = ['😂', '🔥', '💀', '❤️', '😭', '👀'];
  type ReactionGroup = { emoji: string; count: number; reactedByMe: boolean; users: { user_id: string; first_name: string }[] };
  type ReactionRow = { id: string; emoji: string; user_id: string; first_name: string };
  let reactionRows = $state<ReactionRow[]>([]);
  let reactionPickerOpen = $state(false);
  let openReactionGroup = $state<string | null>(null);

  // Eén gedeeld realtime-kanaal voor alles op deze quote-detailpagina:
  // reacties, comments/replies, comment-likes en de quote-favorite zelf.
  let realtimeChannel: RealtimeChannel | null = null;

  function colorFromString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 60%)`;
  }

  const accentColor = $derived(quote?.color || (quote ? colorFromString(quote.id) : '#999'));

  // Groepeert de losse reactie-rijen per emoji voor weergave
  const reactionGroups = $derived.by((): ReactionGroup[] => {
    const byEmoji = new Map<string, { count: number; reactedByMe: boolean; users: { user_id: string; first_name: string }[] }>();

    for (const r of reactionRows) {
      const existing = byEmoji.get(r.emoji) ?? { count: 0, reactedByMe: false, users: [] };
      existing.count += 1;
      if (r.user_id === currentUserId) existing.reactedByMe = true;
      existing.users.push({ user_id: r.user_id, first_name: r.first_name });
      byEmoji.set(r.emoji, existing);
    }

    return Array.from(byEmoji.entries())
      .map(([emoji, v]) => ({ emoji, count: v.count, reactedByMe: v.reactedByMe, users: v.users }))
      .sort((a, b) => b.count - a.count);
  });

  // Bouwt de boom: top-level comments met hun replies genest erin
  const topLevelComments = $derived.by(() => {
    const byParent = new Map<string, CommentWithDetails[]>();
    const roots: CommentWithDetails[] = [];

    for (const c of comments) {
      if (c.parent_comment_id) {
        const list = byParent.get(c.parent_comment_id) ?? [];
        list.push(c);
        byParent.set(c.parent_comment_id, list);
      }
    }

    for (const c of comments) {
      if (!c.parent_comment_id) {
        roots.push({ ...c, replies: byParent.get(c.id) ?? [] });
      }
    }

    return roots;
  });

  function goToTag(tag: string) {
    goto(`/rooms/${roomId}/quotes?tag=${encodeURIComponent(tag)}`);
  }

  async function loadQuote() {
    loading = true;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { goto('/auth/login'); return; }
    currentUserId = user.id;

    const profile = await getCurrentProfile();
    myFirstName = profile?.first_name || 'You';

    const { data: roomData } = await supabase.from('rooms').select('owner_id').eq('id', roomId).single();
    isRoomOwner = roomData?.owner_id === user.id;

    const { data, error } = await supabase
      .from('quotes')
      .select('*, adder:users!quotes_added_by_fkey(id, first_name)')
      .eq('id', quoteId)
      .single();

    if (error || !data) {
      goto(`/rooms/${roomId}/quotes`);
      return;
    }

    quote = {
      ...(data as any),
      adder: Array.isArray((data as any).adder) ? (data as any).adder[0] : (data as any).adder
    } as QuoteWithDetails;

    isQuoteOwner = quote.added_by === user.id;

    const { data: favData } = await supabase
      .from('quote_favorites')
      .select('user_id, users(id, first_name)')
      .eq('quote_id', quoteId);

    favoriteCount = favData?.length ?? 0;
    isFavorited = (favData ?? []).some((f) => f.user_id === user.id);
    favoriteUsers = ((favData ?? []) as any[]).map((f) => {
      const u = Array.isArray(f.users) ? f.users[0] : f.users;
      return { user_id: f.user_id as string, first_name: (u?.first_name as string) ?? 'Someone' };
    });

    loading = false;

    await Promise.all([loadComments(), loadReactions()]);
    subscribeToRealtime();

    // Niet-blokkerend: markeer al mijn ongelezen notificaties over deze
    // quote als gelezen zodra ik de pagina bezoek (niet alleen via de bel).
    markQuoteNotificationsRead();
  }

  async function markQuoteNotificationsRead() {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('quote_id', quoteId)
      .eq('user_id', currentUserId)
      .eq('read', false);

    if (error) console.error('Failed to mark quote notifications read', error);
  }

  async function loadComments() {
    commentsLoading = true;

    const { data, error } = await supabase
      .from('quote_comments')
      .select('*, author:users!quote_comments_user_id_fkey(id, first_name)')
      .eq('quote_id', quoteId)
      .order('created_at', { ascending: true });

    if (error || !data) {
      console.error('load comments failed', error);
      comments = [];
      commentsLoading = false;
      return;
    }

    const { data: likesData } = await supabase
      .from('comment_likes')
      .select('comment_id, user_id')
      .in('comment_id', data.map((c: any) => c.id));

    comments = data.map((c: any) => {
      const likesForComment = (likesData ?? []).filter((l) => l.comment_id === c.id);
      return {
        ...c,
        author: Array.isArray(c.author) ? c.author[0] : c.author,
        like_count: likesForComment.length,
        is_liked: likesForComment.some((l) => l.user_id === currentUserId),
        replies: []
      } as CommentWithDetails;
    });

    commentsLoading = false;
  }

  async function loadReactions() {
    const { data, error } = await supabase
      .from('quote_reactions')
      .select('id, emoji, user_id, users(id, first_name)')
      .eq('quote_id', quoteId);

    if (error) {
      console.error('load reactions failed', error);
      return;
    }

    reactionRows = ((data ?? []) as any[]).map((r): ReactionRow => {
      const u = Array.isArray(r.users) ? r.users[0] : r.users;
      return { id: r.id, emoji: r.emoji, user_id: r.user_id, first_name: (u?.first_name as string) ?? 'Someone' };
    });
  }

  /**
   * Eén losse comment (met author-join) ophalen en aan de lokale lijst
   * toevoegen. Gebruikt na een realtime INSERT, zodat we niet alle
   * comments + likes opnieuw hoeven te laden voor één nieuw bericht.
   */
  async function fetchAndInsertComment(id: string) {
    const { data, error } = await supabase
      .from('quote_comments')
      .select('*, author:users!quote_comments_user_id_fkey(id, first_name)')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) {
      if (error) console.error('realtime comment fetch failed', error);
      return;
    }

    if (comments.some((c) => c.id === id)) return; // al aanwezig (eigen insert)

    const inserted: CommentWithDetails = {
      ...(data as any),
      author: Array.isArray((data as any).author) ? (data as any).author[0] : (data as any).author,
      like_count: 0,
      is_liked: false,
      replies: []
    };

    comments = [...comments, inserted];
  }

  function subscribeToRealtime() {
    realtimeChannel = supabase
      .channel(`quote-detail:${quoteId}`)
      // Emoji reacties (INSERT + DELETE, iedereen — geen optimistic-conflict
      // omdat toggleReaction() zelf ook al via loadReactions() herlaadt)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'quote_reactions', filter: `quote_id=eq.${quoteId}` },
        () => {
          loadReactions();
        }
      )
      // Nieuwe top-level comments en replies van andere leden.
      // Onze eigen comments/replies zijn al in submitComment()/submitReply()
      // toegevoegd, dus fetchAndInsertComment() slaat ze over als ze al
      // in de lijst staan.
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'quote_comments', filter: `quote_id=eq.${quoteId}` },
        (payload) => {
          fetchAndInsertComment((payload.new as any).id);
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'quote_comments', filter: `quote_id=eq.${quoteId}` },
        (payload) => {
          const deletedId = (payload.old as any).id;
          comments = comments.filter((c) => c.id !== deletedId && c.parent_comment_id !== deletedId);
        }
      )
      // Likes op comments — eigen likes zijn al optimistic verwerkt in
      // toggleCommentLike(), dus die negeren we hier op user_id.
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comment_likes' },
        (payload) => {
          const row = payload.new as any;
          if (row.user_id === currentUserId) return;
          if (!comments.some((c) => c.id === row.comment_id)) return;

          comments = comments.map((c) =>
            c.id === row.comment_id ? { ...c, like_count: c.like_count + 1 } : c
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'comment_likes' },
        (payload) => {
          const row = payload.old as any;
          if (row.user_id === currentUserId) return;
          if (!comments.some((c) => c.id === row.comment_id)) return;

          comments = comments.map((c) =>
            c.id === row.comment_id ? { ...c, like_count: Math.max(0, c.like_count - 1) } : c
          );
        }
      )
      // Favorite op de quote zelf — eigen actie al optimistic in
      // toggleFavorite(), dus ook hier op user_id negeren.
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'quote_favorites', filter: `quote_id=eq.${quoteId}` },
        async (payload) => {
          const row = payload.new as any;
          if (row.user_id === currentUserId) return;
          favoriteCount += 1;
          const { data: u } = await supabase.from('users').select('id, first_name').eq('id', row.user_id).maybeSingle();
          favoriteUsers = [...favoriteUsers, { user_id: row.user_id, first_name: u?.first_name ?? 'Someone' }];
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'quote_favorites', filter: `quote_id=eq.${quoteId}` },
        (payload) => {
          const row = payload.old as any;
          if (row.user_id === currentUserId) return;
          favoriteCount = Math.max(0, favoriteCount - 1);
          favoriteUsers = favoriteUsers.filter((f) => f.user_id !== row.user_id);
        }
      )
      .subscribe();
  }

  async function toggleReaction(emoji: string) {
    const existing = reactionRows.find((r) => r.emoji === emoji && r.user_id === currentUserId);
    reactionPickerOpen = false;

    if (existing) {
      // Optimistic remove
      const previousOnRemove: ReactionRow[] = reactionRows;
      reactionRows = reactionRows.filter((r) => r.id !== existing.id);

      const { error } = await supabase.from('quote_reactions').delete().eq('id', existing.id);
      if (error) {
        console.error('remove reaction failed', error);
        reactionRows = previousOnRemove;
      }
      return;
    }

    // Optimistic add (tijdelijke id, wordt overschreven door de realtime refresh)
    const previousOnAdd: ReactionRow[] = reactionRows;
    const tempId = `temp-${Date.now()}`;
    const optimisticRow: ReactionRow = { id: tempId, emoji, user_id: currentUserId, first_name: myFirstName };
    reactionRows = [...reactionRows, optimisticRow];

    const { error } = await supabase
      .from('quote_reactions')
      .insert({ quote_id: quoteId, user_id: currentUserId, emoji });

    if (error) {
      console.error('add reaction failed', error);
      reactionRows = previousOnAdd;
    } else {
      await loadReactions();
    }
  }

  async function toggleFavorite() {
    if (!quote) return;
    const wasFavorited = isFavorited;

    isFavorited = !wasFavorited;
    favoriteCount += wasFavorited ? -1 : 1;
    favoriteUsers = wasFavorited
      ? favoriteUsers.filter((f) => f.user_id !== currentUserId)
      : [...favoriteUsers, { user_id: currentUserId, first_name: myFirstName }];

    const { error } = wasFavorited
      ? await supabase.from('quote_favorites').delete().eq('quote_id', quote.id).eq('user_id', currentUserId)
      : await supabase.from('quote_favorites').insert({ quote_id: quote.id, user_id: currentUserId });

    if (error) {
      console.error('toggle favorite failed', error);
      await loadQuote();
    }
  }

  async function deleteQuote() {
    if (!quote) return;
    const { error } = await supabase.from('quotes').delete().eq('id', quote.id);
    if (error) {
      console.error('delete failed', error);
      return;
    }
    goto(`/rooms/${roomId}/quotes`);
  }

  async function removeTag(tag: string) {
    if (!quote) return;
    const updatedTags = quote.tags.filter((t) => t !== tag);
    const previousTags = quote.tags;

    quote = { ...quote, tags: updatedTags };

    const { error } = await supabase.from('quotes').update({ tags: updatedTags }).eq('id', quote.id);
    if (error) {
      console.error('remove tag failed', error);
      quote = { ...quote, tags: previousTags };
    }
  }

  async function submitComment() {
    const text = newCommentText.trim();
    if (!text || !quote || submittingComment) return;

    submittingComment = true;

    const { data, error } = await supabase
      .from('quote_comments')
      .insert({ quote_id: quote.id, user_id: currentUserId, text })
      .select('*, author:users!quote_comments_user_id_fkey(id, first_name)')
      .single();

    submittingComment = false;

    if (error || !data) {
      console.error('submit comment failed', error);
      return;
    }

    const inserted: CommentWithDetails = {
      ...(data as any),
      author: Array.isArray((data as any).author) ? (data as any).author[0] : (data as any).author,
      like_count: 0,
      is_liked: false,
      replies: []
    };

    comments = [...comments, inserted];
    newCommentText = '';
  }

  function startReply(topLevelCommentId: string, replyToUserName: string) {
    replyingToCommentId = topLevelCommentId;
    replyingToName = replyToUserName;
    replyText = '';
  }

  function cancelReply() {
    replyingToCommentId = null;
    replyingToName = null;
    replyText = '';
  }

  async function submitReply() {
    const text = replyText.trim();
    if (!text || !quote || !replyingToCommentId || submittingReply) return;

    submittingReply = true;

    const { data, error } = await supabase
      .from('quote_comments')
      .insert({
        quote_id: quote.id,
        user_id: currentUserId,
        parent_comment_id: replyingToCommentId,
        reply_to_name: replyingToName,
        text
      })
      .select('*, author:users!quote_comments_user_id_fkey(id, first_name)')
      .single();

    submittingReply = false;

    if (error || !data) {
      console.error('submit reply failed', error);
      return;
    }

    const inserted: CommentWithDetails = {
      ...(data as any),
      author: Array.isArray((data as any).author) ? (data as any).author[0] : (data as any).author,
      like_count: 0,
      is_liked: false,
      replies: []
    };

    comments = [...comments, inserted];
    cancelReply();
  }

  function canDeleteComment(comment: CommentWithDetails): boolean {
    return isRoomOwner || comment.user_id === currentUserId;
  }

  async function deleteComment(comment: CommentWithDetails) {
    const previous = comments;
    // Verwijdert ook eventuele replies (cascade in db, en lokaal alvast filteren)
    comments = comments.filter((c) => c.id !== comment.id && c.parent_comment_id !== comment.id);

    const { error } = await supabase.from('quote_comments').delete().eq('id', comment.id);
    if (error) {
      console.error('delete comment failed', error);
      comments = previous;
    }
  }

  async function toggleCommentLike(comment: CommentWithDetails) {
    const wasLiked = comment.is_liked;

    comments = comments.map((c) =>
      c.id === comment.id
        ? { ...c, is_liked: !wasLiked, like_count: c.like_count + (wasLiked ? -1 : 1) }
        : c
    );

    const { error } = wasLiked
      ? await supabase.from('comment_likes').delete().eq('comment_id', comment.id).eq('user_id', currentUserId)
      : await supabase.from('comment_likes').insert({ comment_id: comment.id, user_id: currentUserId });

    if (error) {
      console.error('toggle comment like failed', error);
      await loadComments();
    }
  }

  function formatCommentDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  // Zowel "mag quote verwijderen" als "mag tags van deze quote beheren"
  // volgen dezelfde regel: room owner, of degene die 'm heeft toegevoegd.
  const canDelete = $derived(quote ? isRoomOwner || quote.added_by === currentUserId : false);

  onMount(loadQuote);

  onDestroy(() => {
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  });
</script>

<svelte:head>
  <title>Quote · QuoteStash</title>
</svelte:head>

<svelte:window onclick={() => { reactionPickerOpen = false; showFavoritesList = false; openReactionGroup = null; }} />

<div class="px-5 sm:px-8 py-8 sm:py-10 max-w-6xl">
  <a
    href="/rooms/{roomId}/quotes"
    class="inline-flex items-center gap-1.5 text-[13px] font-medium text-surface-500 dark:text-surface-400 hover:text-surface-800 dark:hover:text-surface-200 transition-colors mb-6"
  >
    <ArrowLeft size={15} />
    Back to quotes
  </a>

  {#if loading}
    <div class="h-56 rounded-3xl bg-surface-100 dark:bg-surface-900 animate-pulse"></div>
  {:else if quote}
  <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
    <!-- Left column: quote card + comment input -->
    <div class="flex flex-col gap-6">
      <div class="relative flex flex-col gap-5 p-6 sm:p-7 rounded-3xl glass shadow-[0_8px_30px_-6px_rgba(0,0,0,0.06)] dark:shadow-none overflow-hidden">
        <div class="absolute top-0 left-0 right-0 h-1.5" style="background-color: {accentColor};"></div>

        <!-- flex-wrap + gap zodat de NSFW badge en delete-knop nooit overlappen,
             ook niet op smalle schermen of met langere labels -->
        <div class="flex items-start justify-between gap-3 flex-wrap">
          {#if quote.is_nsfw}
            <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 text-red-500 shrink-0">
              <AlertTriangle size={11} />
              <span class="text-[10px] font-bold uppercase tracking-wide whitespace-nowrap">NSFW</span>
            </div>
          {:else}
            <div></div>
          {/if}

          {#if canDelete}
            <button
              onclick={deleteQuote}
              class="flex items-center gap-1.5 text-[12px] font-semibold text-surface-400 hover:text-red-500 active:scale-95 transition-all shrink-0 ml-auto"
            >
              <Trash2 size={14} />
              Delete
            </button>
          {/if}
        </div>

        <div class="flex flex-col gap-4 wrap-break-word max-w-full">
          {#each quote.lines as line, i (i)}
            <div class="flex items-start gap-3">
              <div
                class="shrink-0 flex items-center justify-center w-9 h-9 rounded-full text-white text-[13px] font-bold mt-0.5 ring-2 ring-white dark:ring-surface-900 shadow-sm"
                style="background-color: {colorFromString(line.said_by)};"
              >
                {line.said_by.charAt(0).toUpperCase()}
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-[16px] font-medium text-surface-800 dark:text-surface-100 leading-relaxed">
                  "{line.text}"
                </p>
                <p class="text-[12px] text-surface-400 dark:text-surface-500 font-medium mt-1">{line.said_by}</p>
              </div>
            </div>
          {/each}
        </div>

        {#if quote.tags.length > 0}
          <div class="flex flex-wrap gap-1.5">
            {#each quote.tags as tag (tag)}
              <div
                class="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg hover:opacity-80 active:scale-95 transition-all"
                style:color={colorFromString(tag)}
                style:background-color={`${colorFromString(tag)}17`}
              >
                <button onclick={() => goToTag(tag)}>
                  #{tag}
                </button>

                {#if canDelete}
                  <button
                    onclick={() => removeTag(tag)}
                    aria-label={`Remove tag ${tag}`}
                    class="flex items-center justify-center w-3.5 h-3.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                  >
                    <X size={10} strokeWidth={2.5} />
                  </button>
                {/if}
              </div>
            {/each}
          </div>
        {/if}

        <!-- Emoji reacties -->
        <div class="relative flex items-center gap-1.5 flex-wrap">
          {#each reactionGroups as group (group.emoji)}
            <div class="relative">
              <button
                onclick={() => toggleReaction(group.emoji)}
                oncontextmenu={(e) => {
                  if (!isQuoteOwner) return;
                  e.preventDefault();
                  openReactionGroup = openReactionGroup === group.emoji ? null : group.emoji;
                }}
                class="flex items-center gap-1 px-2 py-1 rounded-full text-[12px] font-semibold transition-all active:scale-90
                       {group.reactedByMe
                  ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400 ring-1 ring-brand-500/30'
                  : 'bg-surface-100 dark:bg-surface-800 text-surface-500 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-700'}"
              >
                <span class="text-[13px] leading-none">{group.emoji}</span>
                {group.count}
              </button>

              {#if isQuoteOwner && openReactionGroup === group.emoji}
                <div
                  class="absolute left-0 bottom-full mb-2 w-52 max-h-64 overflow-y-auto rounded-2xl glass-panel p-2 z-20"
                >
                  <p class="px-2 pt-1 pb-2 text-[10.5px] font-bold text-surface-400 dark:text-surface-500 uppercase tracking-wide">
                    Reacted {group.emoji}
                  </p>
                  <div class="flex flex-col gap-0.5">
                    {#each group.users as u (u.user_id)}
                      <div class="flex items-center gap-2 px-2 py-1.5 rounded-xl">
                        <div
                          class="shrink-0 flex items-center justify-center w-6 h-6 rounded-full text-white text-[10px] font-bold"
                          style="background-color: {colorFromString(u.first_name)};"
                        >
                          {u.first_name.charAt(0).toUpperCase()}
                        </div>
                        <span class="text-[12.5px] text-surface-700 dark:text-surface-200 truncate">
                          {u.user_id === currentUserId ? 'You' : u.first_name}
                        </span>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {/each}

          <button
            onclick={(e) => { e.stopPropagation(); reactionPickerOpen = !reactionPickerOpen; }}
            aria-label="Add reaction"
            class="flex items-center justify-center w-7 h-7 rounded-full text-surface-400 dark:text-surface-500 bg-surface-100 dark:bg-surface-800 hover:bg-surface-200 dark:hover:bg-surface-700 active:scale-90 transition-all"
          >
            <SmilePlus size={14} />
          </button>

          {#if reactionPickerOpen}
            <div
              class="absolute left-0 bottom-full mb-2 z-20 flex items-center gap-1 p-1.5 rounded-2xl
                     bg-white/95 dark:bg-surface-800/95 backdrop-blur-xl
                     ring-1 ring-black/5 dark:ring-white/10
                     shadow-[0_16px_40px_-8px_rgba(0,0,0,0.25)]"
            >
              {#each QUICK_REACTIONS as emoji (emoji)}
                <button
                  onclick={(e) => { e.stopPropagation(); toggleReaction(emoji); }}
                  class="flex items-center justify-center w-9 h-9 rounded-xl text-[19px] leading-none hover:bg-surface-100 dark:hover:bg-surface-700 active:scale-90 transition-all"
                >
                  {emoji}
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <div class="flex items-center justify-between pt-3 border-t border-surface-100 dark:border-surface-800">
          <div class="flex items-center gap-2 min-w-0">
            {#if quote.adder?.first_name}
              <div
                class="shrink-0 flex items-center justify-center w-5 h-5 rounded-full text-white text-[9px] font-bold ring-2 ring-white dark:ring-surface-900"
                style="background-color: {colorFromString(quote.adder.first_name)};"
              >
                {quote.adder.first_name.charAt(0).toUpperCase()}
              </div>
              <p class="text-[11px] text-surface-400 dark:text-surface-500 truncate">
                Quoted by <span class="font-semibold text-surface-500 dark:text-surface-400">{quote.adder.first_name}</span>
                · {new Date(quote.created_at).toLocaleDateString()}
              </p>
            {:else}
              <p class="text-[11px] text-surface-400 dark:text-surface-500">
                Added {new Date(quote.created_at).toLocaleDateString()}
              </p>
            {/if}
          </div>

          <div class="relative">
            <button
              onclick={(e) => {
                if (isQuoteOwner) {
                  e.stopPropagation();
                  showFavoritesList = !showFavoritesList;
                } else {
                  toggleFavorite();
                }
              }}
              class="flex items-center gap-1.5 group active:scale-90 transition-transform"
              aria-label={isQuoteOwner ? 'See who liked this quote' : 'Toggle favorite'}
            >
              <Heart
                size={19}
                class="transition-colors {isFavorited ? 'text-red-500' : 'text-surface-300 dark:text-surface-600 group-hover:text-red-300'}"
                fill={isFavorited ? 'currentColor' : 'none'}
              />
              <span class="text-[13px] font-semibold text-surface-500 dark:text-surface-400">{favoriteCount}</span>
            </button>

            {#if isQuoteOwner && showFavoritesList}
              <div
                class="absolute right-0 bottom-full mb-2 w-56 max-h-64 overflow-y-auto rounded-2xl glass-panel p-2 z-20"
              >
                <p class="px-2 pt-1 pb-2 text-[10.5px] font-bold text-surface-400 dark:text-surface-500 uppercase tracking-wide">
                  Liked by
                </p>
                {#if favoriteUsers.length === 0}
                  <p class="px-2 pb-2 text-[12.5px] text-surface-400 dark:text-surface-500">No likes yet.</p>
                {:else}
                  <div class="flex flex-col gap-0.5">
                    {#each favoriteUsers as f (f.user_id)}
                      <div class="flex items-center gap-2 px-2 py-1.5 rounded-xl">
                        <div
                          class="shrink-0 flex items-center justify-center w-6 h-6 rounded-full text-white text-[10px] font-bold"
                          style="background-color: {colorFromString(f.first_name)};"
                        >
                          {f.first_name.charAt(0).toUpperCase()}
                        </div>
                        <span class="text-[12.5px] text-surface-700 dark:text-surface-200 truncate">
                          {f.user_id === currentUserId ? 'You' : f.first_name}
                        </span>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      </div>

      <!-- New comment form — stays under the quote, same width -->
      <div>
        <h2 class="text-[12px] font-bold text-surface-500 dark:text-surface-400 uppercase tracking-wide mb-3">
          Add a comment
        </h2>
        <form
          onsubmit={(e) => { e.preventDefault(); submitComment(); }}
          class="flex items-start gap-2"
        >
          <textarea
            bind:value={newCommentText}
            placeholder="Write a comment…"
            rows="2"
            disabled={submittingComment}
            class="flex-1 resize-none text-[14px] px-3.5 py-2.5 rounded-2xl glass-inset border border-transparent focus:border-surface-300 dark:focus:border-surface-600 outline-none text-surface-800 dark:text-surface-100 placeholder:text-surface-400 dark:placeholder:text-surface-500 transition-colors"
            onkeydown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitComment();
              }
            }}
          ></textarea>
          <button
            type="submit"
            disabled={!newCommentText.trim() || submittingComment}
            aria-label="Post comment"
            class="shrink-0 flex items-center justify-center w-10 h-10 mt-0.5 rounded-full bg-surface-800 dark:bg-surface-100 text-white dark:text-surface-900 disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 active:scale-95 transition-all"
          >
            <Send size={15} />
          </button>
        </form>
      </div>
    </div>

    <!-- Right column: comments list with nested replies -->
    <div class="flex flex-col gap-4 lg:sticky lg:top-8">
      <div class="flex items-center gap-2">
        <MessageCircle size={16} class="text-surface-400 dark:text-surface-500" />
        <h2 class="text-[13px] font-bold text-surface-600 dark:text-surface-300 uppercase tracking-wide">
          Comments {#if comments.length > 0}<span class="text-surface-400 dark:text-surface-500 font-medium">· {comments.length}</span>{/if}
        </h2>
      </div>

      {#if commentsLoading}
        <div class="flex flex-col gap-3">
          <div class="h-16 rounded-2xl bg-surface-100 dark:bg-surface-900 animate-pulse"></div>
          <div class="h-16 rounded-2xl bg-surface-100 dark:bg-surface-900 animate-pulse"></div>
        </div>
      {:else if topLevelComments.length === 0}
        <p class="text-[13px] text-surface-400 dark:text-surface-500 text-center py-6">
          No comments yet — be the first to say something.
        </p>
      {:else}
        <div class="flex flex-col gap-3 max-h-[70vh] overflow-y-auto -mr-2 pr-2">
          {#each topLevelComments as comment (comment.id)}
            <div class="flex flex-col gap-2 p-3.5 rounded-2xl glass">
              <!-- Top-level comment -->
              <div class="flex items-start gap-2.5">
                <div
                  class="shrink-0 flex items-center justify-center w-7 h-7 rounded-full text-white text-[10px] font-bold ring-2 ring-white dark:ring-surface-900"
                  style="background-color: {colorFromString(comment.author?.first_name ?? comment.user_id)};"
                >
                  {(comment.author?.first_name ?? '?').charAt(0).toUpperCase()}
                </div>

                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="text-[12px] font-semibold text-surface-700 dark:text-surface-200">
                      {comment.author?.first_name ?? 'Unknown'}
                    </span>
                    <span class="text-[10.5px] text-surface-400 dark:text-surface-500">
                      {formatCommentDate(comment.created_at)}
                    </span>
                  </div>
                  <p class="text-[13px] text-surface-700 dark:text-surface-200 leading-snug mt-0.5 wrap-break-word">
                    {comment.text}
                  </p>

                  <div class="flex items-center gap-3 mt-1.5">
                    <button
                      onclick={() => toggleCommentLike(comment)}
                      class="flex items-center gap-1 group active:scale-90 transition-transform"
                      aria-label="Toggle comment like"
                    >
                      <Heart
                        size={13}
                        class="transition-colors {comment.is_liked ? 'text-red-500' : 'text-surface-300 dark:text-surface-600 group-hover:text-red-300'}"
                        fill={comment.is_liked ? 'currentColor' : 'none'}
                      />
                      {#if comment.like_count > 0}
                        <span class="text-[10.5px] font-semibold text-surface-500 dark:text-surface-400">{comment.like_count}</span>
                      {/if}
                    </button>

                    <button
                      onclick={() => startReply(comment.id, comment.author?.first_name ?? 'Unknown')}
                      class="text-[10.5px] font-semibold text-surface-400 dark:text-surface-500 hover:text-surface-700 dark:hover:text-surface-200 transition-colors"
                    >
                      Reply
                    </button>

                    {#if canDeleteComment(comment)}
                      <button
                        onclick={() => deleteComment(comment)}
                        aria-label="Delete comment"
                        class="text-surface-300 dark:text-surface-600 hover:text-red-500 active:scale-90 transition-all"
                      >
                        <Trash2 size={12} />
                      </button>
                    {/if}
                  </div>
                </div>
              </div>

              <!-- Replies -->
              {#if comment.replies.length > 0}
                <div class="flex flex-col gap-2 pl-4 ml-3.5 border-l-2 border-surface-100 dark:border-surface-800">
                  {#each comment.replies as reply (reply.id)}
                    <div class="flex items-start gap-2">
                      <div
                        class="shrink-0 flex items-center justify-center w-6 h-6 rounded-full text-white text-[9px] font-bold ring-2 ring-white dark:ring-surface-900"
                        style="background-color: {colorFromString(reply.author?.first_name ?? reply.user_id)};"
                      >
                        {(reply.author?.first_name ?? '?').charAt(0).toUpperCase()}
                      </div>

                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-1.5 flex-wrap">
                          <span class="text-[11.5px] font-semibold text-surface-700 dark:text-surface-200">
                            {reply.author?.first_name ?? 'Unknown'}
                          </span>
                          <span class="text-[10px] text-surface-400 dark:text-surface-500">
                            {formatCommentDate(reply.created_at)}
                          </span>
                        </div>
                        <p class="text-[12.5px] text-surface-700 dark:text-surface-200 leading-snug mt-0.5 wrap-break-word">
                          {#if reply.reply_to_name}
                            <span class="text-surface-400 dark:text-surface-500 font-medium">&gt; {reply.reply_to_name}</span>
                            {' '}
                          {/if}
                          {reply.text}
                        </p>

                        <div class="flex items-center gap-3 mt-1">
                          <button
                            onclick={() => toggleCommentLike(reply)}
                            class="flex items-center gap-1 group active:scale-90 transition-transform"
                            aria-label="Toggle reply like"
                          >
                            <Heart
                              size={12}
                              class="transition-colors {reply.is_liked ? 'text-red-500' : 'text-surface-300 dark:text-surface-600 group-hover:text-red-300'}"
                              fill={reply.is_liked ? 'currentColor' : 'none'}
                            />
                            {#if reply.like_count > 0}
                              <span class="text-[10px] font-semibold text-surface-500 dark:text-surface-400">{reply.like_count}</span>
                            {/if}
                          </button>

                          <button
                            onclick={() => startReply(comment.id, reply.author?.first_name ?? 'Unknown')}
                            class="text-[10px] font-semibold text-surface-400 dark:text-surface-500 hover:text-surface-700 dark:hover:text-surface-200 transition-colors"
                          >
                            Reply
                          </button>

                          {#if canDeleteComment(reply)}
                            <button
                              onclick={() => deleteComment(reply)}
                              aria-label="Delete reply"
                              class="text-surface-300 dark:text-surface-600 hover:text-red-500 active:scale-90 transition-all"
                            >
                              <Trash2 size={11} />
                            </button>
                          {/if}
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}

              <!-- Reply input, shown inline under this thread when active -->
              {#if replyingToCommentId === comment.id}
                <div class="flex items-start gap-2 pl-4 ml-3.5 mt-1">
                  <CornerDownRight size={13} class="text-surface-300 dark:text-surface-600 mt-2.5 shrink-0" />
                  <div class="flex-1 flex flex-col gap-1.5">
                    {#if replyingToName}
                      <span class="text-[10.5px] text-surface-400 dark:text-surface-500">
                        Replying to <span class="font-semibold">{replyingToName}</span>
                        <button onclick={cancelReply} class="ml-1.5 underline hover:text-surface-600 dark:hover:text-surface-300">cancel</button>
                      </span>
                    {/if}
                    <form
                      onsubmit={(e) => { e.preventDefault(); submitReply(); }}
                      class="flex items-start gap-2"
                    >
                      <textarea
                        bind:value={replyText}
                        placeholder="Write a reply…"
                        rows="1"
                        disabled={submittingReply}
                        class="flex-1 resize-none text-[12.5px] px-3 py-2 rounded-xl glass-inset border border-transparent focus:border-surface-300 dark:focus:border-surface-600 outline-none text-surface-800 dark:text-surface-100 placeholder:text-surface-400 dark:placeholder:text-surface-500 transition-colors"
                        onkeydown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            submitReply();
                          }
                          if (e.key === 'Escape') {
                            cancelReply();
                          }
                        }}
                      ></textarea>
                      <button
                        type="submit"
                        disabled={!replyText.trim() || submittingReply}
                        aria-label="Post reply"
                        class="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-surface-800 dark:bg-surface-100 text-white dark:text-surface-900 disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 active:scale-95 transition-all"
                      >
                        <Send size={12} />
                      </button>
                    </form>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
  {/if}
</div>