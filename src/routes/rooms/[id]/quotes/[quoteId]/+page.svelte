<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabase';
  import { Heart, EyeOff, Trash2, ArrowLeft, X, MessageCircle, Send, CornerDownRight } from 'lucide-svelte';
  import type { QuoteWithDetails, CommentWithDetails } from '$lib/database.types';

  const roomId = $derived(page.params.id!);
  const quoteId = $derived(page.params.quoteId!);

  let quote = $state<QuoteWithDetails | null>(null);
  let loading = $state(true);
  let currentUserId = $state('');
  let isRoomOwner = $state(false);
  let favoriteCount = $state(0);
  let isFavorited = $state(false);

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

  function colorFromString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 60%)`;
  }

  const accentColor = $derived(quote?.color || (quote ? colorFromString(quote.id) : '#999'));

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

    const { data: favData } = await supabase.from('quote_favorites').select('user_id').eq('quote_id', quoteId);
    favoriteCount = favData?.length ?? 0;
    isFavorited = (favData ?? []).some((f) => f.user_id === user.id);

    loading = false;

    await loadComments();
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

  async function toggleFavorite() {
    if (!quote) return;
    const wasFavorited = isFavorited;

    isFavorited = !wasFavorited;
    favoriteCount += wasFavorited ? -1 : 1;

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
</script>

<svelte:head>
  <title>Quote · QuoteStash</title>
</svelte:head>

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
      <div class="relative flex flex-col gap-5 p-6 sm:p-7 rounded-3xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 shadow-[0_8px_30px_-6px_rgba(0,0,0,0.06)] dark:shadow-none overflow-hidden">
        <div class="absolute top-0 left-0 right-0 h-1.5" style="background-color: {accentColor};"></div>

        <div class="flex items-start justify-between">
          {#if quote.is_nsfw}
            <div class="flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/10 text-red-500">
              <EyeOff size={11} />
              <span class="text-[10px] font-bold uppercase tracking-wide">NSFW</span>
            </div>
          {:else}
            <div></div>
          {/if}

          {#if canDelete}
            <button
              onclick={deleteQuote}
              class="flex items-center gap-1.5 text-[12px] font-semibold text-surface-400 hover:text-red-500 active:scale-95 transition-all"
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

          <button onclick={toggleFavorite} class="flex items-center gap-1.5 group active:scale-90 transition-transform" aria-label="Toggle favorite">
            <Heart
              size={19}
              class="transition-colors {isFavorited ? 'text-red-500' : 'text-surface-300 dark:text-surface-600 group-hover:text-red-300'}"
              fill={isFavorited ? 'currentColor' : 'none'}
            />
            <span class="text-[13px] font-semibold text-surface-500 dark:text-surface-400">{favoriteCount}</span>
          </button>
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
            class="flex-1 resize-none text-[14px] px-3.5 py-2.5 rounded-2xl bg-surface-100 dark:bg-surface-800 border border-transparent focus:border-surface-300 dark:focus:border-surface-600 outline-none text-surface-800 dark:text-surface-100 placeholder:text-surface-400 dark:placeholder:text-surface-500 transition-colors"
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
            <div class="flex flex-col gap-2 p-3.5 rounded-2xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800">
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
                        class="flex-1 resize-none text-[12.5px] px-3 py-2 rounded-xl bg-surface-100 dark:bg-surface-800 border border-transparent focus:border-surface-300 dark:focus:border-surface-600 outline-none text-surface-800 dark:text-surface-100 placeholder:text-surface-400 dark:placeholder:text-surface-500 transition-colors"
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