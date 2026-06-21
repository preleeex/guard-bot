"use client";

import { useEffect, useState } from "react";
import { applyTheme, getWebApp, isInTelegram } from "@/lib/telegram";
import { GIF } from "@/lib/assets";
import { Loading, Message } from "@/components/ui";
import { Screening } from "@/components/Screening";
import { OwnerApp } from "@/components/Owner";

type Mode = "screening" | "owner";

export default function Page() {
  const [ready, setReady] = useState(false);
  const [inTelegram, setInTelegram] = useState(true);
  const [mode, setMode] = useState<Mode>("owner");
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    const wa = getWebApp();
    if (wa) {
      wa.ready();
      wa.expand();
      applyTheme();
      wa.onEvent("themeChanged", applyTheme);
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

    if (params.get("mode") === "screening" || session) {
      setMode("screening");
      setSessionId(session || null);
    } else {
      setMode("owner");
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
  if (mode === "screening") return <Screening sessionId={sessionId} />;
  return <OwnerApp />;
}
