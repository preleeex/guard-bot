"use client";

import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { getWebApp } from "@/lib/telegram";
import type { ScenarioBlock } from "@/lib/types";
import { Button, Card, Loading, Message } from "./ui";
import { BlockForm, isBlockAnswered, type Payload } from "./BlockForm";

interface ScenarioResponse {
  sessionId: string;
  expiresAt: string;
  blocks: ScenarioBlock[];
}

const decisionText: Record<string, string> = {
  approve: "Заявка одобрена.",
  decline: "Заявка отклонена.",
  queue: "Заявка отправлена на ручную проверку.",
};

export function Screening({ sessionId }: { sessionId: string | null }) {
  const [state, setState] = useState<"loading" | "form" | "done" | "error">("loading");
  const [error, setError] = useState<string>("");
  const [blocks, setBlocks] = useState<ScenarioBlock[]>([]);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Payload>>({});
  const [result, setResult] = useState<string>("");

  useEffect(() => {
    if (!sessionId) {
      setState("error");
      setError("Сессия не указана.");
      return;
    }
    api
      .get<ScenarioResponse>(`/api/screening/${sessionId}`)
      .then((data) => {
        setBlocks(data.blocks);
        setState(data.blocks.length === 0 ? "form" : "form");
      })
      .catch((e: ApiError) => {
        setState("error");
        setError(e.message || "Не удалось загрузить проверку.");
      });
  }, [sessionId]);

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
  if (state === "error") return <Message title="Проверка недоступна" text={error} />;
  if (state === "done") return <Message title={result} text="Окно закроется автоматически." />;

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
