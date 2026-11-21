// Web push (VAPID) – posílání notifikací na zařízení, která si je zapnula.
// Klíče: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (vygeneruje `npm run vapid`), VAPID_SUBJECT.
import webpush from "web-push";
import { teamStore } from "./store";

export interface PushPayload {
  title: string;
  body: string;
  /** Kam notifikace po ťuknutí vede (cesta v appce). */
  url: string;
  /** Stejný tag nahradí předchozí notifikaci místo přidání další. */
  tag?: string;
}

export const vapidPublicKey = (): string | null => process.env.VAPID_PUBLIC_KEY?.trim() || null;
export const pushConfigured = (): boolean => Boolean(vapidPublicKey() && process.env.VAPID_PRIVATE_KEY?.trim());

let configured = false;
function setup(): boolean {
  if (!pushConfigured()) return false;
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT?.trim() || "mailto:admin@example.com",
      vapidPublicKey()!,
      process.env.VAPID_PRIVATE_KEY!.trim(),
    );
    configured = true;
  }
  return true;
}

/** Komu: brigádníci podle staff id, a/nebo vedoucí (admin zařízení). */
export type PushTarget = { staffIds?: string[]; admin?: boolean };

/** Pošle notifikaci; neplatné odběry (odinstalovaná appka) rovnou smaže. Chyby nepropouští. */
export async function sendPush(target: PushTarget, payload: PushPayload | ((staffId: string | null) => PushPayload | null)) {
  if (!setup()) return;
  const subs = await teamStore.listPushSubs();
  const ids = new Set(target.staffIds ?? []);
  const chosen = subs.filter((s) => (s.staffId == null ? Boolean(target.admin) : ids.has(s.staffId)));
  await Promise.all(
    chosen.map(async (s) => {
      const p = typeof payload === "function" ? payload(s.staffId) : payload;
      if (!p) return;
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(p), {
          TTL: 6 * 3600,
          urgency: "high",
        });
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await teamStore.deletePushSub(s.endpoint).catch(() => undefined);
        else console.error("push failed", code ?? e);
      }
    }),
  );
}
