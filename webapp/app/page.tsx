"use client";

import { useEffect, useState } from "react";
import { applyTheme, applySafeArea, getWebApp, isInTelegram } from "@/lib/telegram";
import { t } from "@/lib/i18n";
import { GIF } from "@/lib/assets";
import { Loading, Message } from "@/components/ui";
import { Screening } from "@/components/Screening";
import { OwnerApp } from "@/components/Owner";

type Mode = "screening" | "owner" | "info";

export default function Page() {
  const [ready, setReady] = useState(false);
  const [inTelegram, setInTelegram] = useState(true);
  const [mode, setMode] = useState<Mode>("owner");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [infoReason, setInfoReason] = useState<string>("");
  const [ownerNav, setOwnerNav] = useState<{ chatId: string; journalUserId?: string } | null>(null);

  useEffect(() => {
    const wa = getWebApp();
    if (wa) {
      wa.ready();
      wa.expand();
      // Open the Mini App full-screen where supported, then pad around the
      // Telegram header / device insets so content is not hidden.
      try {
        wa.requestFullscreen?.();
        wa.disableVerticalSwipes?.();
      } catch {
        // older clients: ignore
      }
      applyTheme();
      applySafeArea();
      wa.onEvent("themeChanged", applyTheme);
      wa.onEvent("safeAreaChanged", applySafeArea);
      wa.onEvent("contentSafeAreaChanged", applySafeArea);
      wa.onEvent("fullscreenChanged", applySafeArea);
    }

    if (!isInTelegram()) {
      setInTelegram(false);
      setReady(true);
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const startParam = wa?.initDataUnsafe?.start_param ?? "";
    const session =
      params.get("session") || (startParam.startsWith("screening:") ? startParam.slice(10) : "");

    if (params.get("mode") === "info") {
      setMode("info");
      setInfoReason(params.get("reason") || "");
    } else if (params.get("mode") === "screening" || session) {
      setMode("screening");
      setSessionId(session || null);
    } else {
      setMode("owner");
      const group = params.get("group");
      if (group) {
        setOwnerNav({ chatId: group, journalUserId: params.get("journal") || undefined });
      }
    }
    setReady(true);
  }, []);

  if (!ready) return <Loading />;
  if (!inTelegram) {
    return (
      <Message
        title="Откройте через Telegram"
        text="Это приложение работает только внутри Telegram."
        gif={GIF.ban}
      />
    );
  }
  if (mode === "info") {
    const isEmoji = infoReason === "emoji";
    return (
      <Message
        title={isEmoji ? t("reason_emoji_title") : t("reason_generic_title")}
        text={isEmoji ? t("reason_emoji_text") : t("reason_generic_text")}
        gif={GIF.empty}
      />
    );
  }
  if (mode === "screening") return <Screening sessionId={sessionId} />;
  return <OwnerApp initialNav={ownerNav} />;
}
