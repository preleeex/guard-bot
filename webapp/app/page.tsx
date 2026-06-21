"use client";

import { useEffect, useState } from "react";
import { applyTheme, getWebApp } from "@/lib/telegram";
import { Loading } from "@/components/ui";
import { Screening } from "@/components/Screening";
import { OwnerApp } from "@/components/Owner";

type Mode = "screening" | "owner";

export default function Page() {
  const [ready, setReady] = useState(false);
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

    const params = new URLSearchParams(window.location.search);
    const startParam = wa?.initDataUnsafe?.start_param ?? "";
    const urlMode = params.get("mode");
    const session = params.get("session") || (startParam.startsWith("screening:") ? startParam.slice(10) : "");

    if (urlMode === "screening" || session) {
      setMode("screening");
      setSessionId(session || null);
    } else {
      setMode("owner");
    }
    setReady(true);
  }, []);

  if (!ready) return <Loading />;
  if (mode === "screening") return <Screening sessionId={sessionId} />;
  return <OwnerApp />;
}
