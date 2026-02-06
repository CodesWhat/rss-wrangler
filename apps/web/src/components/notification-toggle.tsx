"use client";

import { useCallback, useEffect, useState } from "react";
import { getVapidKey, subscribePush, unsubscribePush } from "@/lib/api";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function NotificationToggle() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isSupported = "serviceWorker" in navigator && "PushManager" in window;
    setSupported(isSupported);

    if (!isSupported) {
      setLoading(false);
      return;
    }

    // Check current subscription state
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setEnabled(!!sub);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, []);

  const toggle = useCallback(async () => {
    if (!supported) return;
    setLoading(true);

    try {
      const reg = await navigator.serviceWorker.ready;

      if (enabled) {
        // Unsubscribe
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await unsubscribePush(sub.endpoint);
          await sub.unsubscribe();
        }
        setEnabled(false);
      } else {
        // Subscribe
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setLoading(false);
          return;
        }

        const vapidKey = await getVapidKey();
        if (!vapidKey) {
          console.error("No VAPID key configured");
          setLoading(false);
          return;
        }

        const keyArray = urlBase64ToUint8Array(vapidKey);
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyArray.buffer as ArrayBuffer,
        });

        const p256dh = btoa(String.fromCharCode(...new Uint8Array(sub.getKey("p256dh")!)));
        const auth = btoa(String.fromCharCode(...new Uint8Array(sub.getKey("auth")!)));

        await subscribePush(sub.endpoint, p256dh, auth);
        setEnabled(true);
      }
    } catch (err) {
      console.error("Push toggle failed:", err);
    }

    setLoading(false);
  }, [supported, enabled]);

  if (!supported) {
    return (
      <div className="muted" style={{ fontSize: "0.9em" }}>
        Push notifications are not supported in this browser.
      </div>
    );
  }

  return (
    <label className="checkbox-label">
      <input
        type="checkbox"
        checked={enabled}
        onChange={toggle}
        disabled={loading}
      />
      Push notifications {loading ? "(loading...)" : enabled ? "(enabled)" : "(disabled)"}
    </label>
  );
}
