<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabase';
  import {
    Bell,
    Check,
    Quote,
    MessageCircle,
    CornerDownRight,
    Heart,
    Star,
    Sparkles
  } from 'lucide-svelte';
  import {
    notificationMessage,
    notificationHref,
    type NotificationType,
    type NotificationWithDetails
  } from '$lib/database.types';
  import type { RealtimeChannel } from '@supabase/supabase-js';

  // Icoon + kleur per notificatietype — zelfde rode accent als hartjes/likes
  // elders in de app, brand-kleur voor quote/comment-activiteit.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const NOTIFICATION_ICON: Record<NotificationType, any> = {
    new_quote: Quote,
    new_comment: MessageCircle,
    new_reply: CornerDownRight,
    comment_like: Heart,
    quote_favorite: Star,
    reaction: Sparkles
  };

  const NOTIFICATION_ICON_COLOR: Record<NotificationType, string> = {
    new_quote: 'text-brand-500',
    new_comment: 'text-brand-500',
    new_reply: 'text-brand-500',
    comment_like: 'text-red-500',
    quote_favorite: 'text-amber-500',
    reaction: 'text-fuchsia-500'
  };

  let open = $state(false);
  let notifications = $state<NotificationWithDetails[]>([]);
  let loading = $state(true);
  let currentUserId = $state('');
  let menuEl = $state<HTMLDivElement>();

  // Toast queue for "just happened" activity while you're looking at the app
  let toasts = $state<{ id: string; notification: NotificationWithDetails }[]>([]);

  let channel: RealtimeChannel | null = null;

  const unreadCount = $derived(notifications.filter((n) => !n.read).length);

  function timeAgo(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
  }

  function handleClickOutside(e: MouseEvent) {
    if (menuEl && !menuEl.contains(e.target as Node)) open = false;
  }

  async function loadNotifications() {
    loading = true;

    const { data, error } = await supabase
      .from('notifications')
      .select('*, actor:users!notifications_actor_id_fkey(id, first_name, avatar_url)')
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      console.error('Failed to load notifications', error);
      loading = false;
      return;
    }

    notifications = ((data ?? []) as any[]).map((n) => ({
      ...n,
      actor: Array.isArray(n.actor) ? n.actor[0] : n.actor
    })) as NotificationWithDetails[];

    loading = false;
  }

  async function markAllRead() {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    // Optimistic
    notifications = notifications.map((n) => ({ ...n, read: true }));

    const { error } = await supabase.from('notifications').update({ read: true }).in('id', unreadIds);
    if (error) {
      console.error('Failed to mark all read', error);
      await loadNotifications();
    }
  }

  async function handleNotificationClick(n: NotificationWithDetails) {
    open = false;

    if (!n.read) {
      notifications = notifications.map((x) => (x.id === n.id ? { ...x, read: true } : x));
      const { error } = await supabase.from('notifications').update({ read: true }).eq('id', n.id);
      if (error) console.error('Failed to mark notification read', error);
    }

    goto(notificationHref(n));
  }

  function dismissToast(id: string) {
    toasts = toasts.filter((t) => t.id !== id);
  }

  function pushToast(n: NotificationWithDetails) {
    const toastId = n.id;
    toasts = [...toasts, { id: toastId, notification: n }];
    setTimeout(() => dismissToast(toastId), 6000);
  }

  onMount(async () => {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return;
    currentUserId = user.id;

    await loadNotifications();

    // Realtime: nieuwe notificatie voor mij -> badge bijwerken + toast tonen
    channel = supabase
      .channel(`notifications:${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUserId}`
        },
        async (payload) => {
          let actorData: { id: string; first_name: string; avatar_url: string | null } | null = null;

          if (payload.new.actor_id) {
            const { data } = await supabase
              .from('users')
              .select('id, first_name, avatar_url')
              .eq('id', payload.new.actor_id)
              .maybeSingle();
            actorData = data;
          }

          const enriched: NotificationWithDetails = {
            ...(payload.new as any),
            actor: actorData
          };

          notifications = [enriched, ...notifications];
          pushToast(enriched);
        }
      )
      // Notificatie elders als gelezen gemarkeerd (bv. door de quote-detail-
      // pagina te bezoeken) -> badge hier ook live bijwerken.
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUserId}`
        },
        (payload) => {
          const updated = payload.new as any;
          notifications = notifications.map((n) => (n.id === updated.id ? { ...n, read: updated.read } : n));
        }
      )
      .subscribe();
  });

  onDestroy(() => {
    if (channel) supabase.removeChannel(channel);
  });
</script>

<svelte:window onclick={handleClickOutside} />

<!-- Toasts: fixed, boven alles, los van de dropdown -->
<div class="fixed top-15 right-4 z-200 flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none">
  {#each toasts as t (t.id)}
    <button
      type="button"
      onclick={() => {
        dismissToast(t.id);
        handleNotificationClick(t.notification);
      }}
      class="glass-chrome pointer-events-auto flex items-start gap-3 p-3.5 rounded-2xl
             text-left animate-[toastIn_0.25s_cubic-bezier(0.16,1,0.3,1)]"
    >
      <span
        class="flex items-center justify-center w-8 h-8 rounded-full shrink-0
               bg-black/[0.04] dark:bg-white/[0.06] {NOTIFICATION_ICON_COLOR[t.notification.type]}"
      >
        <!-- svelte-ignore svelte_component_deprecated -->
        <svelte:component this={NOTIFICATION_ICON[t.notification.type]} size={15} strokeWidth={2.25} />
      </span>
      <div class="min-w-0 flex-1">
        <p class="text-[13px] font-semibold text-surface-900 dark:text-surface-50 truncate">
          {notificationMessage(t.notification)}
        </p>
        {#if t.notification.preview_text}
          <p class="text-[12px] text-surface-500 dark:text-surface-400 truncate mt-0.5">
            "{t.notification.preview_text}"
          </p>
        {/if}
      </div>
    </button>
  {/each}
</div>

<div class="relative" bind:this={menuEl}>
  <button
    onclick={() => {
      open = !open;
      if (open) loadNotifications();
    }}
    aria-label="Notifications"
    class="glass-chrome relative flex items-center justify-center w-9 h-9 rounded-full
           hover:bg-white/90 dark:hover:bg-surface-800/70
           active:scale-90
           transition-all"
  >
    <Bell size={16} class="text-surface-600 dark:text-surface-300" strokeWidth={2} />

    {#if unreadCount > 0}
      <span
        class="absolute -top-1 -right-1 flex items-center justify-center
               min-w-4.5 h-4.5 px-1 rounded-full
               bg-red-500 text-white text-[10px] font-bold
               ring-2 ring-white/80 dark:ring-surface-950/80"
      >
        {unreadCount > 9 ? '9+' : unreadCount}
      </span>
    {/if}
  </button>

  {#if open}
    <div
      class="glass-chrome absolute right-0 mt-2 w-88 max-w-[calc(100vw-2rem)]
             max-h-112 flex flex-col
             rounded-2xl
             overflow-hidden
             animate-[dropdownIn_0.15s_ease-out]"
    >
      <div class="flex items-center justify-between px-4 py-3 border-b border-black/[0.05] dark:border-white/[0.08] shrink-0">
        <p class="text-[13px] font-bold text-surface-900 dark:text-surface-50">Notifications</p>
        {#if unreadCount > 0}
          <button
            onclick={markAllRead}
            class="flex items-center gap-1 text-[11px] font-semibold text-brand-500 hover:text-brand-600 transition-colors"
          >
            <Check size={12} strokeWidth={2.5} />
            Mark all read
          </button>
        {/if}
      </div>

      <div class="overflow-y-auto overscroll-contain flex-1">
        {#if loading}
          <div class="flex flex-col gap-2 p-3">
            {#each Array(3) as _}
              <div class="h-14 rounded-xl bg-black/[0.04] dark:bg-white/[0.05] animate-pulse"></div>
            {/each}
          </div>
        {:else if notifications.length === 0}
          <div class="flex flex-col items-center justify-center py-12 px-4 text-center ">
            <Bell size={26} strokeWidth={1.75} class="text-surface-300 dark:text-surface-600 mb-2" />
            <p class="text-[12.5px] text-surface-400 dark:text-surface-500">
              Nothing yet — new quotes and comments will show up here.
            </p>
          </div>
        {:else}
          <div class="p-1.5">
            {#each notifications as n (n.id)}
              <button
                type="button"
                onclick={() => handleNotificationClick(n)}
                class="w-full flex items-start gap-3 px-2.5 py-2.5 rounded-xl text-left
                       transition-colors
                       {n.read
                  ? 'hover:bg-black/[0.04] dark:hover:bg-white/[0.05]'
                  : 'bg-brand-500/5 hover:bg-brand-500/10'}"
              >
                <span
                  class="flex items-center justify-center w-7 h-7 rounded-full shrink-0
                         bg-black/[0.04] dark:bg-white/[0.06] {NOTIFICATION_ICON_COLOR[n.type]}"
                >
                  <!-- svelte-ignore svelte_component_deprecated -->
                  <svelte:component this={NOTIFICATION_ICON[n.type]} size={13} strokeWidth={2.25} />
                </span>
                <div class="min-w-0 flex-1">
                  <p class="text-[12.5px] font-medium text-surface-800 dark:text-surface-100 leading-snug">
                    {notificationMessage(n)}
                  </p>
                  {#if n.preview_text}
                    <p class="text-[11.5px] text-surface-500 dark:text-surface-400 truncate mt-0.5">
                      "{n.preview_text}"
                    </p>
                  {/if}
                  <p class="text-[10.5px] text-surface-400 dark:text-surface-500 mt-1">{timeAgo(n.created_at)}</p>
                </div>
                {#if !n.read}
                  <span class="shrink-0 w-2 h-2 rounded-full bg-brand-500 mt-1.5"></span>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  @keyframes dropdownIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes toastIn {
    from {
      opacity: 0;
      transform: translateX(24px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateX(0) scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    * {
      animation-duration: 0.001ms !important;
      animation-iteration-count: 1 !important;
    }
  }
</style>