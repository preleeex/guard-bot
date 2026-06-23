"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { getWebApp, openExternal } from "@/lib/telegram";
import { BOT_USERNAME } from "@/lib/config";
import { t } from "@/lib/i18n";
import { GIF } from "@/lib/assets";
import type { ScenarioBlock } from "@/lib/types";
import { Button, Card, Loading, Message } from "./ui";
import { BannedScreen } from "./BannedScreen";
import { BlockForm, isBlockAnswered, type Payload } from "./BlockForm";

interface Subscription {
  required: boolean;
  subscribed: boolean;
  username?: string;
  url?: string;
}

interface ScenarioResponse {
  sessionId: string;
  expiresAt: string;
  blocks: ScenarioBlock[];
  subscription?: Subscription;
  voice?: boolean;
  voicePrompt?: string | null;
  allowEdit?: boolean;
}

const decisionText = (decision: string): string =>
  decision === "approve"
    ? t("approve")
    : decision === "decline"
    ? t("decline")
    : decision === "queue"
    ? t("queue")
    : t("done");

const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function Screening({ sessionId }: { sessionId: string | null }) {
  const [state, setState] = useState<
    "loading" | "gate" | "form" | "voice" | "done" | "error" | "banned"
  >("loading");
  const [error, setError] = useState<string>("");
  const [blocks, setBlocks] = useState<ScenarioBlock[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [voicePrompt, setVoicePrompt] = useState<string>("");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Payload>>({});
  const [result, setResult] = useState<string>("");
  const [decision, setDecision] = useState<string>("");
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number>(0);
  const [allowEdit, setAllowEdit] = useState(true);

  const loadScenario = useCallback(async () => {
    if (!sessionId) {
      setState("error");
      setError("Сессия не указана.");
      return;
    }
    setState("loading");
    try {
      const data = await api.get<ScenarioResponse>(`/api/screening/${sessionId}`);
      setBlocks(data.blocks);
      setSubscription(data.subscription ?? null);
      setAllowEdit(data.allowEdit !== false);
      const dl = data.expiresAt ? new Date(data.expiresAt).getTime() : null;
      setDeadline(dl);
      if (dl) setRemaining(Math.max(0, Math.floor((dl - Date.now()) / 1000)));
      if (data.subscription?.required && !data.subscription.subscribed) {
        setState("gate");
      } else if (data.voice) {
        setVoicePrompt(data.voicePrompt?.trim() || t("voice_default_prompt"));
        setState("voice");
      } else {
        setState("form");
      }
    } catch (e) {
      if ((e as ApiError).code === "banned") {
        setState("banned");
        return;
      }
      setState("error");
      setError((e as ApiError).message || t("load_failed"));
    }
  }, [sessionId]);

  useEffect(() => {
    loadScenario();
  }, [loadScenario]);

  // Visible countdown. When it hits zero the backend timeout job decides; the
  // Mini App just shows "time is up" and closes.
  useEffect(() => {
    if (state !== "form" || !deadline) return;
    const tick = () => {
      const rem = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
      setRemaining(rem);
      if (rem <= 0) {
        setDecision("timeout");
        setResult("Время вышло.");
        setState("done");
        setTimeout(() => getWebApp()?.close(), 2500);
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [state, deadline]);

  const current = blocks[step];
  const currentPayload = current ? answers[current.id] ?? {} : {};
  const canProceed = current ? isBlockAnswered(current, currentPayload) : true;
  const isLast = step >= blocks.length - 1;

  const submit = useMemo(
    () => async () => {
      if (!sessionId) return;
      setState("loading");
      try {
        const payload = blocks.map((b) => ({
          blockId: b.id,
          type: b.type,
          payload: answers[b.id] ?? {},
        }));
        const res = await api.post<{ decision: string }>(`/api/screening/${sessionId}/submit`, {
          answers: payload,
        });
        setDecision(res.decision);
        setResult(decisionText(res.decision));
        setState("done");
        setTimeout(() => getWebApp()?.close(), 2500);
      } catch (e) {
        setState("error");
        setError((e as ApiError).message || t("send_error"));
      }
    },
    [sessionId, blocks, answers]
  );

  if (state === "loading") return <Loading text={t("loading")} />;
  if (state === "banned") return <BannedScreen />;
  if (state === "error") return <Message title={t("unavailable_title")} text={error} gif={GIF.empty} />;
  if (state === "done")
    return (
      <Message
        title={result}
        text={t("closes_auto")}
        gif={decision === "decline" ? GIF.ban : undefined}
      />
    );

  if (state === "gate") {
    return (
      <div className="app">
        <Card>
          <p className="title center">{t("sub_title")}</p>
          <p className="hint center">{t("sub_text")}</p>
          <Button onClick={() => subscription?.url && openExternal(subscription.url)}>
            {t("open_channel")}{subscription?.username ? ` @${subscription.username}` : ""}
          </Button>
          <Button variant="secondary" onClick={loadScenario}>
            {t("check")}
          </Button>
        </Card>
      </div>
    );
  }

  if (state === "voice") {
    return (
      <div className="app">
        <Card>
          <p className="title center">{t("voice_title")}</p>
          <p className="hint center">{voicePrompt}</p>
          <Button
            onClick={() =>
              openExternal(`https://t.me/${BOT_USERNAME}?start=voice_${sessionId ?? ""}`)
            }
          >
            {t("voice_open_bot")}
          </Button>
          <p className="hint center">{t("voice_hint")}</p>
        </Card>
      </div>
    );
  }

  if (blocks.length === 0) {
    // No scenario configured: nothing to do, submit immediately.
    return (
      <div className="app">
        <Card>
          <p className="title">{t("confirm_join")}</p>
          <Button onClick={submit}>{t("continue")}</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="app">
      <Card>
        <div className="row">
          <p className="hint">
            {t("step")} {step + 1} {t("of")} {blocks.length}
          </p>
          {deadline ? <p className="hint timer">{formatTime(remaining)}</p> : null}
        </div>
        <BlockForm
          block={current}
          payload={currentPayload}
          onChange={(p) => setAnswers((a) => ({ ...a, [current.id]: p }))}
        />
      </Card>
      <div className="col">
        {!isLast ? (
          <Button disabled={!canProceed} onClick={() => setStep((s) => s + 1)}>
            {t("next")}
          </Button>
        ) : (
          <Button disabled={!canProceed} onClick={submit}>
            {t("finish")}
          </Button>
        )}
        {step > 0 && allowEdit ? (
          <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>
            {t("back")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
