import type { createAdminClient } from "@/lib/db";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface PushPayload {
  title: string;
  body: string;
  /** Path to open when the notification is tapped. */
  url?: string;
}

// Web Push on WebCrypto: VAPID (RFC 8292) + aes128gcm payload encryption
// (RFC 8291). Replaces the `web-push` npm package, which needs Node's https
// and ECDH APIs that Workers doesn't provide. Keys are the same base64url
// VAPID pair web-push generated, stored in push_config.

const enc = new TextEncoder();
type Bytes = Uint8Array<ArrayBuffer>;

function b64urlDecode(s: string): Bytes {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function b64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...Array.from(new Uint8Array(buf))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function vapidAuthorization(endpoint: string, publicKey: string, privateKey: string) {
  const pub = b64urlDecode(publicKey); // 0x04 || x || y
  const key = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      d: privateKey,
      x: b64urlEncode(pub.slice(1, 33)),
      y: b64urlEncode(pub.slice(33, 65)),
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64urlEncode(
    enc.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: "mailto:peter@pmansour.com",
      })
    )
  );
  const unsigned = `${header}.${claims}`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(unsigned));
  return `vapid t=${unsigned}.${b64urlEncode(sig)}, k=${publicKey}`;
}

async function hkdf(salt: Bytes, ikm: Bytes | ArrayBuffer, info: Bytes, bytes: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8)
  );
}

/** Encrypt a payload for one subscription (RFC 8291, single record). */
async function encryptPayload(p256dh: string, authSecret: string, payload: string) {
  const uaPublic = b64urlDecode(p256dh);
  const auth = b64urlDecode(authSecret);

  const local = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const asPublic = new Uint8Array((await crypto.subtle.exportKey("raw", local.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: uaKey } as unknown as AlgorithmIdentifier,
    local.privateKey,
    256
  );

  const ikm = await hkdf(auth, ecdhSecret, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // Padding delimiter 0x02 marks the last (only) record.
  const plaintext = concat(enc.encode(payload), new Uint8Array([2]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plaintext)
  );

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);
  return concat(salt, recordSize, new Uint8Array([asPublic.length]), asPublic, ciphertext);
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

    const json = JSON.stringify(payload);
    await Promise.allSettled(
      subs.map(async (sub: { endpoint: string; p256dh: string; auth: string }) => {
        try {
          const body = await encryptPayload(sub.p256dh, sub.auth, json);
          const res = await fetch(sub.endpoint, {
            method: "POST",
            headers: {
              Authorization: await vapidAuthorization(
                sub.endpoint,
                config.vapid_public_key,
                config.vapid_private_key
              ),
              "Content-Encoding": "aes128gcm",
              "Content-Type": "application/octet-stream",
              TTL: "86400",
              Urgency: "high",
            },
            body,
          });
          if (res.status === 404 || res.status === 410) {
            await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          } else if (!res.ok) {
            console.error("Push rejected:", res.status, await res.text());
          }
        } catch (err) {
          console.error("Push send error:", err);
        }
      })
    );
  } catch (err) {
    console.error("Push send error:", err);
  }
}
