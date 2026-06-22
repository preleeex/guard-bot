"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { getWebApp, openExternal } from "@/lib/telegram";
import { GIF } from "@/lib/assets";
import type { ScenarioBlock } from "@/lib/types";
import { Button, Card, Loading, Message } from "./ui";
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
}

const decisionText: Record<string, string> = {
  approve: "Заявка одобрена.",
  decline: "Заявка отклонена.",
  queue: "Заявка отправлена на ручную проверку.",
};

export function Screening({ sessionId }: { sessionId: string | null }) {
  const [state, setState] = useState<"loading" | "gate" | "form" | "done" | "error">("loading");
  const [error, setError] = useState<string>("");
  const [blocks, setBlocks] = useState<ScenarioBlock[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Payload>>({});
  const [result, setResult] = useState<string>("");
  const [decision, setDecision] = useState<string>("");

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
      if (data.subscription?.required && !data.subscription.subscribed) {
        setState("gate");
      } else {
        setState("form");
      }
    } catch (e) {
      setState("error");
      setError((e as ApiError).message || "Не удалось загрузить проверку.");
    }
  }, [sessionId]);

  useEffect(() => {
    loadScenario();
  }, [loadScenario]);

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
        setResult(decisionText[res.decision] ?? "Проверка завершена.");
        setState("done");
        setTimeout(() => getWebApp()?.close(), 2500);
      } catch (e) {
        setState("error");
        setError((e as ApiError).message || "Ошибка отправки.");
      }
    },
    [sessionId, blocks, answers]
  );

  if (state === "loading") return <Loading text="Проверка" />;
  if (state === "error") return <Message title="Проверка недоступна" text={error} gif={GIF.empty} />;
  if (state === "done")
    return (
      <Message
        title={result}
        text="Окно закроется автоматически."
        gif={decision === "decline" ? GIF.ban : undefined}
      />
    );

  if (state === "gate") {
    return (
      <div className="app">
        <Card>
          <p className="title center">Подпишись на канал</p>
          <p className="hint center">Чтобы вступить, подпишись на канал и нажми «Проверить».</p>
          <Button onClick={() => subscription?.url && openExternal(subscription.url)}>
            Открыть канал{subscription?.username ? ` @${subscription.username}` : ""}
          </Button>
          <Button variant="secondary" onClick={loadScenario}>
            Проверить
          </Button>
        </Card>
      </div>
    );
  }

  if (blocks.length === 0) {
    // No scenario configured: nothing to do, submit immediately.
    return (
      <div className="app">
        <Card>
          <p className="title">Подтверждение вступления</p>
          <Button onClick={submit}>Продолжить</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="app">
      <Card>
        <div className="row">
          <p className="hint">
            Шаг {step + 1} из {blocks.length}
          </p>
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
            Далее
          </Button>
        ) : (
          <Button disabled={!canProceed} onClick={submit}>
            Завершить
          </Button>
        )}
        {step > 0 ? (
          <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>
            Назад
          </Button>
        ) : null}
      </div>
    </div>
  );
}
