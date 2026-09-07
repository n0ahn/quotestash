import { PUBLIC_VAPID_PUBLIC_KEY } from '$env/static/public';
import { supabase } from '$lib/supabase';

/**
 * Converts a URL-safe base64 VAPID key into the Uint8Array format the
 * Push API expects for applicationServerKey.
 */
function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const bytes = Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
  // Cast needed: some TS lib versions type applicationServerKey as
  // BufferSource with a strict ArrayBuffer (not ArrayBufferLike) backing,
  // which a freshly-created Uint8Array doesn't structurally satisfy.
  return bytes.buffer as BufferSource;
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function getPushPermissionState(): Promise<NotificationPermission | 'unsupported'> {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * Checks whether the current device already has an active push
 * subscription registered (regardless of whether it's saved in our DB).
 */
export async function isSubscribed(): Promise<boolean> {
  if (!pushSupported()) return false;
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  return existing !== null;
}

/**
 * Requests notification permission (if needed), subscribes this device
 * to push, and saves the subscription against the current user.
 * Returns true on success.
 */
export async function subscribeToPush(): Promise<boolean> {
  if (!pushSupported()) return false;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const registration = await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_PUBLIC_KEY)
    });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return false;

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent
    },
    { onConflict: 'endpoint' }
  );

  if (error) {
    console.error('Failed to save push subscription', error);
    return false;
  }

  return true;
}

/**
 * Unsubscribes this device from push, both locally and in our DB.
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!pushSupported()) return false;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return true;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();

  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) {
    console.error('Failed to remove push subscription', error);
    return false;
  }

  return true;
}