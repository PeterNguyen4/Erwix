"use client";

import { useEffect, useState } from "react";
import { api, NotificationItem } from "@/lib/api";

const POLL_MS = 60_000;

/** Polls the notifications bell's items — debrief ready, news insight, Alpaca/strategy setup nudges. */
export function useNotifications() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unseenCount, setUnseenCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      api
        .listNotifications()
        .then((res) => {
          if (cancelled) return;
          setItems(res.items);
          setUnseenCount(res.unseen_count);
        })
        .catch(() => { /* best-effort — bell just stays quiet */ });
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const markRead = (key: string) => {
    api
      .markNotificationRead(key)
      .then((res) => {
        setItems(res.items);
        setUnseenCount(res.unseen_count);
      })
      .catch(() => {});
  };

  const dismiss = (key: string) => {
    api
      .dismissNotification(key)
      .then((res) => {
        setItems(res.items);
        setUnseenCount(res.unseen_count);
      })
      .catch(() => {});
  };

  return { items, unseenCount, markRead, dismiss };
}
