// Supabase Edge Function: send-push
//
// Triggered by the `on_notification_created_push` Postgres trigger
// (see supabase/migrations/20260907000000_push_notifications.sql)
// right after a row is inserted into `notifications`. Looks up the
// recipient's push subscriptions and sends a Web Push message to each.
//
// Deploy with:
//   supabase functions deploy send-push
//
// Required secrets (supabase secrets set ...):
//   VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY
//   VAPID_SUBJECT            e.g. "mailto:you@example.com"
//   SUPABASE_URL             (auto-provided by the platform)
//   SUPABASE_SERVICE_ROLE_KEY (auto-provided by the platform)

import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!;
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!;
const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:support@example.com';

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

const supabase = createClient(supabaseUrl, serviceRoleKey);

type NotificationType = 'new_quote' | 'new_comment' | 'new_reply' | 'comment_like' | 'quote_favorite' | 'reaction';

const TITLE_BY_TYPE: Record<NotificationType, string> = {
  new_quote: 'New quote added',
  new_comment: 'New comment',
  new_reply: 'New reply',
  comment_like: 'Someone liked your comment',
  quote_favorite: 'Someone favorited your quote',
  reaction: 'New reaction'
};

Deno.serve(async (req) => {
  try {
    const { notification_id } = await req.json();

    if (!notification_id) {
      return new Response(JSON.stringify({ error: 'notification_id is required' }), { status: 400 });
    }

    const { data: notification, error: notifError } = await supabase
      .from('notifications')
      .select(
        'id, user_id, room_id, type, preview_text, quote_id, actor:users!notifications_actor_id_fkey(first_name)'
      )
      .eq('id', notification_id)
      .maybeSingle();

    if (notifError || !notification) {
      console.error('send-push: notification lookup failed', notifError);
      return new Response(JSON.stringify({ error: 'notification not found' }), { status: 404 });
    }

    const { data: subs, error: subsError } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', notification.user_id);

    if (subsError) {
      console.error('send-push: subscriptions lookup failed', subsError);
      return new Response(JSON.stringify({ error: 'subscriptions lookup failed' }), { status: 500 });
    }

    if (!subs || subs.length === 0) {
      // Recipient just hasn't opted into push — not an error.
      return new Response(JSON.stringify({ skipped: true, reason: 'no subscriptions' }), { status: 200 });
    }

    const actorName = (notification.actor as any)?.first_name ?? 'Someone';
    const type = notification.type as NotificationType;
    const title = TITLE_BY_TYPE[type] ?? 'QuoteStash';
    const body = notification.preview_text
      ? `${actorName}: "${notification.preview_text}"`
      : `${actorName} did something in your room`;

    const url = notification.quote_id
      ? `/rooms/${notification.room_id}/quotes/${notification.quote_id}`
      : `/rooms/${notification.room_id}`;

    const payload = JSON.stringify({
      title,
      body,
      url,
      notificationId: notification.id
    });

    const results = await Promise.allSettled(
      subs.map((sub) =>
        webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth }
          },
          payload
        )
      )
    );

    // Prune subscriptions that are gone for good (410/404) so we stop
    // trying to push to them.
    const staleIds: string[] = [];
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        const statusCode = (result.reason as any)?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          staleIds.push(subs[i].id);
        } else {
          console.error('send-push: delivery failed', result.reason);
        }
      }
    });

    if (staleIds.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', staleIds);
    }

    const sent = results.filter((r) => r.status === 'fulfilled').length;

    return new Response(JSON.stringify({ sent, pruned: staleIds.length }), { status: 200 });
  } catch (err) {
    console.error('send-push: unexpected error', err);
    return new Response(JSON.stringify({ error: 'internal error' }), { status: 500 });
  }
});