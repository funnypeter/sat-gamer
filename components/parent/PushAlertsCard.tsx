"use client";

import { useEffect, useState } from "react";

type PushState =
  | "loading"
  | "unsupported"
  | "needs-install" // iOS Safari outside an installed PWA
  | "denied"
  | "disabled"
  | "enabled";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export default function PushAlertsCard() {
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function detect() {
      const supported = "serviceWorker" in navigator && "PushManager" in window;
      if (!supported) {
        // iOS Safari only exposes push inside an installed (home screen) PWA.
        const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
        const standalone =
          (navigator as { standalone?: boolean }).standalone === true;
        setState(isIos && !standalone ? "needs-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "enabled" : "disabled");
    }
    detect().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return;
      }
      const keyRes = await fetch("/api/push/subscribe");
      if (!keyRes.ok) throw new Error("Could not load push config");
      const { publicKey } = await keyRes.json();

      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const saveRes = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!saveRes.ok) throw new Error("Could not save subscription");
      setState("enabled");
    } catch {
      setError("Could not enable alerts. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("disabled");
    } catch {
      setError("Could not disable alerts. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-glass p-6 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-white">Redemption alerts on this device</p>
          <p className="text-xs text-gray-400">
            Get a push notification whenever a student asks to cash in gaming time.
          </p>
        </div>
        {(state === "enabled" || state === "disabled") && (
          <button
            onClick={state === "enabled" ? disable : enable}
            disabled={busy}
            className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              state === "enabled"
                ? "bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10"
                : "bg-accent-blue text-white hover:bg-accent-blue/80"
            }`}
          >
            {busy ? "..." : state === "enabled" ? "Disable" : "Enable"}
          </button>
        )}
      </div>

      {state === "enabled" && (
        <p className="text-xs text-accent-green">✓ Alerts are on for this device.</p>
      )}
      {state === "needs-install" && (
        <p className="text-xs text-accent-gold">
          On iPhone, first add SAT Gamer to your Home Screen (Share → Add to Home
          Screen), then open it from there and enable alerts.
        </p>
      )}
      {state === "unsupported" && (
        <p className="text-xs text-gray-500">
          This browser doesn&apos;t support push notifications.
        </p>
      )}
      {state === "denied" && (
        <p className="text-xs text-accent-red">
          Notifications are blocked for this site. Allow them in your browser
          settings, then reload this page.
        </p>
      )}
      {error && <p className="text-xs text-accent-red">{error}</p>}
    </div>
  );
}
