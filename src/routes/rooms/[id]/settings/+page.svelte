<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { supabase, uploadRoomPhoto, removeRoomPhoto } from '$lib/supabase';
  import {
    Settings,
    Copy,
    Check,
    RefreshCw,
    Loader2,
    Trash2,
    ShieldAlert,
    ScrollText,
    Quote as QuoteIcon,
    MessageCircle,
    CornerDownRight,
    Heart,
    Star,
    Sparkles,
    Brain,
    Search,
    Camera,
    X
  } from 'lucide-svelte';
  import type { Database } from '$lib/database.types';

  type Room = Database['public']['Tables']['rooms']['Row'];

  const roomId = $derived(page.params.id!);

  let activeTab = $state<'general' | 'audit'>('general');

  let loading = $state(true);
  let notAuthorized = $state(false);


  let room = $state<Room | null>(null);
  let nameDraft = $state('');
  let savingName = $state(false);
  let nameSaved = $state(false);

  const nameDirty = $derived(nameDraft.trim() !== '' && nameDraft.trim() !== room?.name);

  let photoUploading = $state(false);
  let photoError = $state('');
  let photoInput = $state<HTMLInputElement>();

  const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

  let copied = $state(false);
  let regenerating = $state(false);
  let regenError = $state('');

  let showDeleteConfirm = $state(false);
  let deleteConfirmText = $state('');
  let deleting = $state(false);
  let deleteError = $state('');

  function generateCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  async function loadData() {
    loading = true;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      goto('/auth/login');
      return;
    }

    const { data, error } = await supabase.from('rooms').select('*').eq('id', roomId).single<Room>();

    if (error || !data) {
      goto('/rooms');
      return;
    }

    if (data.owner_id !== user.id) {
      notAuthorized = true;
      loading = false;
      return;
    }

    room = data;
    nameDraft = data.name;
    loading = false;

    loadAuditLog();
  }

  // ---------------------------------------------------------------- //
  // Audit log — a complete, owner-only history of everything that's   //
  // happened in the room, assembled from every source table (quotes,  //
  // comments, favorites, likes, reactions, quiz results) rather than  //
  // the per-recipient notifications feed used on the dashboard.       //
  // ---------------------------------------------------------------- //

  type AuditType =
    | 'quote_added'
    | 'comment_added'
    | 'reply_added'
    | 'quote_favorited'
    | 'comment_liked'
    | 'quote_reacted'
    | 'quiz_completed';

  type AuditEvent = {
    id: string;
    type: AuditType;
    actorName: string;
    createdAt: string;
    description: string;
    preview: string | null;
    href: string;
  };

  const AUDIT_ICON: Record<AuditType, any> = {
    quote_added: QuoteIcon,
    comment_added: MessageCircle,
    reply_added: CornerDownRight,
    quote_favorited: Star,
    comment_liked: Heart,
    quote_reacted: Sparkles,
    quiz_completed: Brain
  };

  const AUDIT_ICON_COLOR: Record<AuditType, string> = {
    quote_added: 'text-brand-500',
    comment_added: 'text-brand-500',
    reply_added: 'text-brand-500',
    quote_favorited: 'text-amber-500',
    comment_liked: 'text-red-500',
    quote_reacted: 'text-fuchsia-500',
    quiz_completed: 'text-emerald-500'
  };

  const AUDIT_FILTERS: { id: AuditType | 'all'; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'quote_added', label: 'Quotes' },
    { id: 'comment_added', label: 'Comments' },
    { id: 'quote_favorited', label: 'Favorites' },
    { id: 'quote_reacted', label: 'Reactions' },
    { id: 'quiz_completed', label: 'Quizzes' }
  ];

  let auditLoading = $state(true);
  let auditEvents = $state<AuditEvent[]>([]);
  let auditFilter = $state<AuditType | 'all'>('all');
  let auditSearch = $state('');
  let auditVisibleCount = $state(40);

  const filteredAuditEvents = $derived.by(() => {
    const query = auditSearch.trim().toLowerCase();
    return auditEvents.filter((e) => {
      if (auditFilter !== 'all' && e.type !== auditFilter) return false;
      if (!query) return true;
      return (
        e.actorName.toLowerCase().includes(query) ||
        e.description.toLowerCase().includes(query) ||
        (e.preview?.toLowerCase().includes(query) ?? false)
      );
    });
  });

  const visibleAuditEvents = $derived(filteredAuditEvents.slice(0, auditVisibleCount));

  async function loadAuditLog() {
    auditLoading = true;

    const { data: quotesData, error: quotesError } = await supabase
      .from('quotes')
      .select('id, lines, created_at, added_by, adder:users!quotes_added_by_fkey(first_name)')
      .eq('room_id', roomId);

    if (quotesError) console.error('audit: quotes load error', quotesError);

    const quotes = ((quotesData ?? []) as any[]).map((q) => ({
      ...q,
      adder: Array.isArray(q.adder) ? q.adder[0] : q.adder
    }));
    const quoteIds = quotes.map((q) => q.id);
    const quotePreview = new Map(
      quotes.map((q) => [q.id, q.lines?.[0]?.text as string | undefined])
    );

    const events: AuditEvent[] = quotes.map((q) => ({
      id: `quote:${q.id}`,
      type: 'quote_added',
      actorName: q.adder?.first_name ?? 'Someone',
      createdAt: q.created_at,
      description: 'added a new quote',
      preview: quotePreview.get(q.id) ?? null,
      href: `/rooms/${roomId}/quotes/${q.id}`
    }));

    let commentIdToQuoteId = new Map<string, string>();

    if (quoteIds.length > 0) {
      const { data: commentsData, error: commentsError } = await supabase
        .from('quote_comments')
        .select('id, quote_id, parent_comment_id, text, created_at, user:users!quote_comments_user_id_fkey(first_name)')
        .in('quote_id', quoteIds);

      if (commentsError) console.error('audit: comments load error', commentsError);

      for (const row of (commentsData ?? []) as any[]) {
        const user = Array.isArray(row.user) ? row.user[0] : row.user;
        commentIdToQuoteId.set(row.id, row.quote_id);
        events.push({
          id: `comment:${row.id}`,
          type: row.parent_comment_id ? 'reply_added' : 'comment_added',
          actorName: user?.first_name ?? 'Someone',
          createdAt: row.created_at,
          description: row.parent_comment_id ? 'replied to a comment' : 'commented on a quote',
          preview: row.text ?? null,
          href: `/rooms/${roomId}/quotes/${row.quote_id}`
        });
      }

      const { data: favoritesData, error: favoritesError } = await supabase
        .from('quote_favorites')
        .select('quote_id, created_at, user:users!quote_favorites_user_id_fkey(first_name)')
        .in('quote_id', quoteIds);

      if (favoritesError) console.error('audit: favorites load error', favoritesError);

      for (const row of (favoritesData ?? []) as any[]) {
        const user = Array.isArray(row.user) ? row.user[0] : row.user;
        events.push({
          id: `favorite:${row.quote_id}:${user?.first_name}:${row.created_at}`,
          type: 'quote_favorited',
          actorName: user?.first_name ?? 'Someone',
          createdAt: row.created_at,
          description: 'favorited a quote',
          preview: quotePreview.get(row.quote_id) ?? null,
          href: `/rooms/${roomId}/quotes/${row.quote_id}`
        });
      }

      const { data: reactionsData, error: reactionsError } = await supabase
        .from('quote_reactions')
        .select('id, quote_id, emoji, created_at, user:users!quote_reactions_user_id_fkey(first_name)')
        .in('quote_id', quoteIds);

      if (reactionsError) console.error('audit: reactions load error', reactionsError);

      for (const row of (reactionsData ?? []) as any[]) {
        const user = Array.isArray(row.user) ? row.user[0] : row.user;
        events.push({
          id: `reaction:${row.id}`,
          type: 'quote_reacted',
          actorName: user?.first_name ?? 'Someone',
          createdAt: row.created_at,
          description: `reacted ${row.emoji ?? ''} to a quote`,
          preview: quotePreview.get(row.quote_id) ?? null,
          href: `/rooms/${roomId}/quotes/${row.quote_id}`
        });
      }

      const commentIds = Array.from(commentIdToQuoteId.keys());

      if (commentIds.length > 0) {
        const { data: likesData, error: likesError } = await supabase
          .from('comment_likes')
          .select('comment_id, created_at, user:users!comment_likes_user_id_fkey(first_name)')
          .in('comment_id', commentIds);

        if (likesError) console.error('audit: comment likes load error', likesError);

        for (const row of (likesData ?? []) as any[]) {
          const user = Array.isArray(row.user) ? row.user[0] : row.user;
          const quoteId = commentIdToQuoteId.get(row.comment_id);
          events.push({
            id: `like:${row.comment_id}:${user?.first_name}:${row.created_at}`,
            type: 'comment_liked',
            actorName: user?.first_name ?? 'Someone',
            createdAt: row.created_at,
            description: 'liked a comment',
            preview: null,
            href: quoteId ? `/rooms/${roomId}/quotes/${quoteId}` : `/rooms/${roomId}/quotes`
          });
        }
      }
    }

    const { data: quizData, error: quizError } = await supabase
      .from('quiz_results')
      .select('id, mode, correct_count, total_count, created_at, user:users!quiz_results_user_id_fkey(first_name)')
      .eq('room_id', roomId);

    if (quizError) console.error('audit: quiz results load error', quizError);

    for (const row of (quizData ?? []) as any[]) {
      const user = Array.isArray(row.user) ? row.user[0] : row.user;
      events.push({
        id: `quiz:${row.id}`,
        type: 'quiz_completed',
        actorName: user?.first_name ?? 'Someone',
        createdAt: row.created_at,
        description: `completed a ${row.mode === 'who_said_it' ? "'Who said it'" : "'Fact or fluff'"} quiz (${row.correct_count}/${row.total_count})`,
        preview: null,
        href: `/rooms/${roomId}/leaderboard`
      });
    }

    events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    auditEvents = events;
    auditLoading = false;
  }

  function formatAuditTime(iso: string): string {
    const date = new Date(iso);
    const diffMs = Date.now() - date.getTime();
    const diffSec = Math.max(0, Math.floor(diffMs / 1000));

    if (diffSec < 60) return 'just now';

    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;

    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;

    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }


  async function saveName() {
    if (!room || !nameDirty || savingName) return;
    savingName = true;
    nameSaved = false;

    const trimmed = nameDraft.trim();
    const { error } = await supabase.from('rooms').update({ name: trimmed }).eq('id', roomId);

    if (!error) {
      room = { ...room, name: trimmed };
      nameSaved = true;
      setTimeout(() => (nameSaved = false), 2000);
    } else {
      console.error('Failed to update room name', error);
    }
    savingName = false;
  }

  async function handlePhotoChange(e: Event) {
    if (!room) return;
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    photoError = '';

    if (!file.type.startsWith('image/')) {
      photoError = 'Please choose an image file.';
      input.value = '';
      return;
    }

    if (file.size > MAX_PHOTO_BYTES) {
      photoError = 'Image must be smaller than 5MB.';
      input.value = '';
      return;
    }

    photoUploading = true;
    const newUrl = await uploadRoomPhoto(roomId, file);
    photoUploading = false;
    input.value = '';

    if (!newUrl) {
      photoError = 'Failed to upload image. Please try again.';
      return;
    }

    room = { ...room, photo_url: newUrl };
  }

  async function handleRemovePhoto() {
    if (!room) return;
    photoError = '';
    photoUploading = true;
    const ok = await removeRoomPhoto(roomId);
    photoUploading = false;

    if (!ok) {
      photoError = 'Failed to remove photo. Please try again.';
      return;
    }

    room = { ...room, photo_url: null };
  }

  async function copyCode() {
    if (!room) return;
    await navigator.clipboard.writeText(room.code);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  async function regenerateCode() {
    if (!room || regenerating) return;
    regenerating = true;
    regenError = '';

    const newCode = generateCode();
    const { error } = await supabase.from('rooms').update({ code: newCode }).eq('id', roomId);

    if (error) {
      console.error('Failed to regenerate code', error);
      regenError = "Couldn't generate a new code. Try again.";
    } else {
      room = { ...room, code: newCode };
    }
    regenerating = false;
  }

  async function deleteRoom() {
    if (!room || deleteConfirmText !== room.name || deleting) return;
    deleting = true;
    deleteError = '';

    const { error } = await supabase.from('rooms').delete().eq('id', roomId);

    if (error) {
      console.error('Failed to delete room', error);
      deleteError = "Couldn't delete this room. Please try again.";
      deleting = false;
      return;
    }

    goto('/rooms');
  }

  onMount(loadData);
</script>

<svelte:head>
  <title>Room settings · QuoteStash</title>
</svelte:head>

<div class="px-5 sm:px-8 py-8 sm:py-10 max-w-3xl">
  {#if loading}
    <div class="flex items-center gap-2.5 mb-8">
      <div class="w-9 h-9 rounded-2xl bg-surface-100 dark:bg-surface-900 animate-pulse"></div>
      <div class="h-5 w-32 rounded-lg bg-surface-100 dark:bg-surface-900 animate-pulse"></div>
    </div>
    <div class="h-40 rounded-3xl bg-surface-100 dark:bg-surface-900 animate-pulse mb-4"></div>
    <div class="h-32 rounded-3xl bg-surface-100 dark:bg-surface-900 animate-pulse"></div>
  {:else if notAuthorized}
    <div class="flex flex-col items-center justify-center py-20 text-center px-4">
      <div class="w-11 h-11 rounded-2xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center text-surface-400 mb-3">
        <ShieldAlert size={20} />
      </div>
      <p class="text-[14px] font-semibold text-surface-700 dark:text-surface-200">Owners only</p>
      <p class="text-[12.5px] text-surface-400 dark:text-surface-500 mt-1 max-w-xs">
        Only the room owner can access these settings.
      </p>
    </div>
  {:else if room}
    <div class="flex items-center gap-2.5 mb-1">
      <div class="flex items-center justify-center w-9 h-9 rounded-2xl bg-linear-to-br from-brand-400 to-brand-600 shadow-sm shadow-brand-500/30 shrink-0">
        <Settings size={18} class="text-white" strokeWidth={2.2} />
      </div>
      <h1 class="text-xl font-bold text-surface-900 dark:text-surface-50">Room settings</h1>
    </div>
    <p class="text-[13px] text-surface-500 dark:text-surface-400 mt-1 ml-11.5">
      Manage {room.name}
    </p>

    <!-- Tabs -->
    <div class="flex items-center gap-1 mt-6 mb-6 p-1 rounded-2xl glass-chrome w-fit max-w-full overflow-x-auto">
      <button
        type="button"
        onclick={() => (activeTab = 'general')}
        class="flex items-center gap-1.5 px-3.5 sm:px-4 h-9 rounded-xl text-[12.5px] font-semibold whitespace-nowrap transition-all shrink-0 {activeTab === 'general'
          ? 'bg-white dark:bg-surface-950 text-brand-500 shadow-sm'
          : 'text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200'}"
      >
        <Settings size={14} strokeWidth={2.3} />
        General
      </button>
      <button
        type="button"
        onclick={() => (activeTab = 'audit')}
        class="flex items-center gap-1.5 px-3.5 sm:px-4 h-9 rounded-xl text-[12.5px] font-semibold whitespace-nowrap transition-all shrink-0 {activeTab === 'audit'
          ? 'bg-white dark:bg-surface-950 text-brand-500 shadow-sm'
          : 'text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200'}"
      >
        <ScrollText size={14} strokeWidth={2.3} />
        Audit log
      </button>
    </div>

    {#if activeTab === 'general'}
    <div class="flex flex-col gap-4">
      <!-- General -->
      <div class="p-5 rounded-3xl glass">
        <h2 class="text-[13px] font-bold text-surface-700 dark:text-surface-200 uppercase tracking-wide mb-4">
          General
        </h2>

        <span class="block text-[12px] font-medium text-surface-500 dark:text-surface-400 mb-1.5">
          Group photo
        </span>
        <div class="flex items-center gap-3 mb-5">
          <div class="relative shrink-0 group/photo">
            {#if room.photo_url}
              <img src={room.photo_url} alt={room.name} class="w-14 h-14 rounded-2xl object-cover shadow-sm" />
            {:else}
              <div class="w-14 h-14 rounded-2xl flex items-center justify-center bg-black/[0.03] dark:bg-white/[0.05] border border-surface-200 dark:border-surface-800 text-surface-400 dark:text-surface-500">
                <Camera size={18} />
              </div>
            {/if}

            <button
              type="button"
              onclick={() => photoInput?.click()}
              disabled={photoUploading}
              aria-label="Change group photo"
              class="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/0 group-hover/photo:bg-black/40 text-white opacity-0 group-hover/photo:opacity-100 transition-all disabled:cursor-wait"
            >
              {#if photoUploading}
                <Loader2 size={16} class="animate-spin" />
              {:else}
                <Camera size={16} />
              {/if}
            </button>

            <input
              bind:this={photoInput}
              type="file"
              accept="image/*"
              class="hidden"
              onchange={handlePhotoChange}
            />
          </div>

          <div class="min-w-0">
            <div class="flex items-center gap-3">
              <button
                type="button"
                onclick={() => photoInput?.click()}
                disabled={photoUploading}
                class="text-[12.5px] font-semibold text-brand-500 hover:text-brand-600 transition-colors disabled:opacity-50"
              >
                {room.photo_url ? 'Change photo' : 'Add photo'}
              </button>
              {#if room.photo_url}
                <button
                  type="button"
                  onclick={handleRemovePhoto}
                  disabled={photoUploading}
                  class="flex items-center gap-1 text-[12.5px] font-medium text-surface-400 hover:text-red-500 transition-colors disabled:opacity-50"
                >
                  <X size={12} />
                  Remove
                </button>
              {/if}
            </div>
            <p class="text-[11.5px] text-surface-400 dark:text-surface-500 mt-0.5">
              Shown on the room card and around the room.
            </p>
            {#if photoError}
              <p class="text-[11.5px] text-red-500 mt-1">{photoError}</p>
            {/if}
          </div>
        </div>

        <label for="room-name" class="block text-[12px] font-medium text-surface-500 dark:text-surface-400 mb-1.5">
          Room name
        </label>
        <div class="flex items-center gap-2">
          <input
            id="room-name"
            type="text"
            bind:value={nameDraft}
            maxlength="60"
            class="flex-1 h-10 px-3 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-950 text-[13.5px] text-surface-900 dark:text-surface-50 outline-none focus:border-brand-400 dark:focus:border-brand-500 transition-colors"
          />
          <button
            type="button"
            onclick={saveName}
            disabled={!nameDirty || savingName}
            class="h-10 px-4 rounded-xl text-[12.5px] font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 disabled:hover:bg-brand-500 transition-colors flex items-center gap-1.5 shrink-0"
          >
            {#if savingName}
              <Loader2 size={14} class="animate-spin" />
            {:else if nameSaved}
              <Check size={14} />
            {:else}
              Save
            {/if}
          </button>
        </div>
      </div>

      <!-- Room code -->
      <div class="p-5 rounded-3xl glass">
        <h2 class="text-[13px] font-bold text-surface-700 dark:text-surface-200 uppercase tracking-wide mb-1">
          Room code
        </h2>
        <p class="text-[11.5px] text-surface-400 dark:text-surface-500 mb-4">
          Share this code so others can join. Regenerating it invalidates the old code.
        </p>

        <div class="flex items-center gap-2">
          <div class="flex-1 h-10 px-3 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-950 flex items-center">
            <span class="text-[14px] font-mono tracking-widest text-surface-900 dark:text-surface-50">{room.code}</span>
          </div>
          <button
            type="button"
            onclick={copyCode}
            aria-label="Copy code"
            title="Copy code"
            class="h-10 w-10 shrink-0 flex items-center justify-center rounded-xl border border-surface-200 dark:border-surface-700 text-surface-500 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
          >
            {#if copied}
              <Check size={15} class="text-emerald-500" />
            {:else}
              <Copy size={15} />
            {/if}
          </button>
          <button
            type="button"
            onclick={regenerateCode}
            disabled={regenerating}
            class="h-10 px-4 rounded-xl text-[12.5px] font-semibold border border-surface-200 dark:border-surface-700 text-surface-700 dark:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-800 disabled:opacity-40 transition-colors flex items-center gap-1.5 shrink-0"
          >
            {#if regenerating}
              <Loader2 size={14} class="animate-spin" />
            {:else}
              <RefreshCw size={14} />
            {/if}
            New code
          </button>
        </div>
        {#if regenError}
          <p class="text-[11.5px] text-red-500 mt-2">{regenError}</p>
        {/if}
      </div>

      <!-- Danger zone -->
      <div class="p-5 rounded-3xl bg-red-50/60 dark:bg-red-500/5 border border-red-200 dark:border-red-500/20">
        <h2 class="text-[13px] font-bold text-red-500 uppercase tracking-wide mb-1 flex items-center gap-1.5">
          <Trash2 size={13} />
          Danger zone
        </h2>
        <p class="text-[11.5px] text-red-400/90 dark:text-red-400/70 mb-4">
          Permanently delete this room, its quotes, and its members. This can't be undone.
        </p>

        {#if !showDeleteConfirm}
          <button
            type="button"
            onclick={() => (showDeleteConfirm = true)}
            class="h-9 px-4 rounded-xl text-[12.5px] font-semibold bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
          >
            Delete room
          </button>
        {:else}
          <div class="flex flex-col gap-2.5">
            <p class="text-[12px] text-red-500 dark:text-red-400 font-medium">
              Type <span class="font-mono font-bold">{room.name}</span> to confirm.
            </p>
            <input
              type="text"
              bind:value={deleteConfirmText}
              placeholder={room.name}
              class="w-full max-w-xs h-9 px-3 rounded-xl border border-red-300 dark:border-red-500/40 bg-white dark:bg-surface-950 text-[13px] text-surface-900 dark:text-surface-50 outline-none"
            />
            {#if deleteError}
              <p class="text-[11.5px] text-red-500">{deleteError}</p>
            {/if}
            <div class="flex items-center gap-2">
              <button
                type="button"
                onclick={deleteRoom}
                disabled={deleteConfirmText !== room.name || deleting}
                class="h-9 px-4 rounded-xl text-[12.5px] font-semibold bg-red-500 text-white hover:bg-red-600 disabled:opacity-40 transition-colors flex items-center gap-1.5"
              >
                {#if deleting}
                  <Loader2 size={14} class="animate-spin" />
                {/if}
                Confirm delete
              </button>
              <button
                type="button"
                onclick={() => {
                  showDeleteConfirm = false;
                  deleteConfirmText = '';
                  deleteError = '';
                }}
                class="h-9 px-4 rounded-xl text-[12.5px] font-semibold text-surface-500 hover:text-surface-800 dark:hover:text-surface-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        {/if}
      </div>
    </div>
    {:else}
      <!-- Audit log -->
      <div class="flex flex-col gap-3.5">
        <div class="flex flex-col sm:flex-row sm:items-center gap-2.5">
          <div class="relative flex-1">
            <Search size={14} class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none" />
            <input
              type="text"
              bind:value={auditSearch}
              placeholder="Search by name or content…"
              class="w-full h-9 pl-9 pr-3 rounded-xl text-[12.5px] glass-inset border border-transparent text-surface-900 dark:text-surface-100 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 transition-all"
            />
          </div>
          <div class="flex items-center gap-1 flex-wrap">
            {#each AUDIT_FILTERS as filter (filter.id)}
              <button
                type="button"
                onclick={() => (auditFilter = filter.id)}
                class="h-8 px-3 rounded-lg text-[11.5px] font-semibold whitespace-nowrap transition-colors {auditFilter === filter.id
                  ? 'bg-brand-500/10 text-brand-500'
                  : 'glass-inset text-surface-600 dark:text-surface-300 hover:bg-black/[0.06] dark:hover:bg-white/[0.08]'}"
              >
                {filter.label}
              </button>
            {/each}
          </div>
        </div>

        {#if auditLoading}
          <div class="flex flex-col gap-2">
            {#each Array(6) as _}
              <div class="h-12 rounded-2xl bg-surface-100 dark:bg-surface-900 animate-pulse"></div>
            {/each}
          </div>
        {:else if filteredAuditEvents.length === 0}
          <div class="flex flex-col items-center justify-center py-16 text-center px-4 rounded-3xl glass">
            <ScrollText size={26} class="text-surface-300 dark:text-surface-700 mb-3" />
            <p class="text-[13.5px] font-medium text-surface-500 dark:text-surface-400">
              {auditEvents.length === 0 ? 'Nothing has happened in this room yet.' : 'No events match your filters.'}
            </p>
          </div>
        {:else}
          <div class="p-3 sm:p-4 rounded-3xl glass">
            <div class="flex flex-col gap-1">
              {#each visibleAuditEvents as event (event.id)}
                <a
                  href={event.href}
                  class="flex items-start gap-3 py-2.5 px-2 -mx-2 rounded-xl hover:bg-black/[0.03] dark:hover:bg-white/[0.05] transition-colors"
                >
                  <div
                    class="shrink-0 flex items-center justify-center w-8 h-8 rounded-xl {AUDIT_ICON_COLOR[event.type]} glass-inset mt-0.5"
                  >
                    <!-- svelte-ignore svelte_component_deprecated -->
                    <svelte:component this={AUDIT_ICON[event.type]} size={14} strokeWidth={2.25} />
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="text-[12.5px] text-surface-600 dark:text-surface-300">
                      <span class="font-semibold text-surface-800 dark:text-surface-100">{event.actorName}</span>
                      {event.description}
                    </p>
                    {#if event.preview}
                      <p class="text-[11.5px] text-surface-400 dark:text-surface-500 truncate mt-0.5">
                        "{event.preview}"
                      </p>
                    {/if}
                  </div>
                  <span
                    class="shrink-0 text-[10.5px] text-surface-400 dark:text-surface-500 mt-0.5"
                    title={new Date(event.createdAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                    })}
                  >
                    {formatAuditTime(event.createdAt)}
                  </span>
                </a>
              {/each}
            </div>

            {#if filteredAuditEvents.length > auditVisibleCount}
              <div class="flex justify-center pt-3 mt-2 border-t border-black/[0.05] dark:border-white/[0.06]">
                <button
                  type="button"
                  onclick={() => (auditVisibleCount += 40)}
                  class="h-8 px-4 rounded-lg text-[11.5px] font-semibold glass-inset text-surface-600 dark:text-surface-300 hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-colors"
                >
                  Show more
                </button>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</div>