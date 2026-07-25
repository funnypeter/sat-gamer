import webpush from "web-push";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface PushPayload {
  title: string;
  body: string;
  /** Path to open when the notification is tapped. */
  url?: string;
}

/**
 * Send a web-push notification to every registered device of the given
 * users. Dead subscriptions (endpoint gone: 404/410) are deleted so the
 * table self-cleans as browsers expire them. Never throws — callers use
 * this for best-effort alerts and must not fail their main operation.
 */
export async function sendPushToUsers(
  admin: AdminClient,
  userIds: string[],
  payload: PushPayload
): Promise<void> {
  try {
    if (userIds.length === 0) return;

    const { data: config } = await admin
      .from("push_config")
      .select("vapid_public_key, vapid_private_key")
      .eq("id", 1)
      .maybeSingle();
    if (!config) return;

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .in("user_id", userIds);
    if (!subs || subs.length === 0) return;

    webpush.setVapidDetails(
      "mailto:peter@pmansour.com",
      config.vapid_public_key,
      config.vapid_private_key
    );

    const json = JSON.stringify(payload);
    await Promise.allSettled(
      subs.map(async (sub: { endpoint: string; p256dh: string; auth: string }) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            json
          );
        } catch (err) {
          const status = (err as { statusCode?: number })?.statusCode;
          if (status === 404 || status === 410) {
            await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          }
        }
      })
    );
  } catch (err) {
    console.error("Push send error:", err);
  }
}
