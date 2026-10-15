// Web push (VAPID). iPhone users get web push only after adding the app to the home screen.
import webpush from 'npm:web-push@3.6.7';

import type { Admin } from './http.ts';

let configured: boolean | null = null;

function configure(): boolean {
  if (configured !== null) return configured;
  const pub = Deno.env.get('VAPID_PUBLIC_KEY');
  const priv = Deno.env.get('VAPID_PRIVATE_KEY');
  configured = !!(pub && priv);
  if (configured) webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:hello@unmatrix.in', pub!, priv!);
  return configured;
}

export type PushPayload = { title: string; body: string; url: string; tag?: string };

/** Sends to every device the user subscribed; prunes subscriptions the browser has revoked. */
export async function sendPush(admin: Admin, uid: string, payload: PushPayload): Promise<number> {
  if (!configure()) return 0;
  const { data: subs } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', uid);
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        {
          TTL: 6 * 3600,
        },
      );
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('id', s.id);
      else console.warn('push failed', status, (e as Error).message);
    }
  }
  return sent;
}
