"use client";

import { useMemo, useState } from "react";
import type { ResultPolicy, ScenarioBlock } from "@/lib/types";
import { buildPreview, evaluatePreview } from "@/lib/evaluate";
import { Button, Card } from "./ui";
import { BlockForm, isBlockAnswered, type Payload } from "./BlockForm";
import { t } from "@/lib/i18n";

const decisionText = (d: string): string =>
  d === "approve" ? t("dec_approve") : d === "decline" ? t("dec_decline") : t("prev_queue");

// Owner runs their own scenario exactly as an applicant would, before publishing.
export function Preview({
  draft,
  policy,
  onClose,
}: {
  draft: ScenarioBlock[];
  policy: ResultPolicy;
  onClose: () => void;
}) {
  const prepared = useMemo(() => buildPreview(draft), [draft]);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Payload>>({});
  const [result, setResult] = useState<{ decision: string; score: number; reason: string } | null>(null);

  const blocks = prepared.blocks;
  const current = blocks[step];
  const payload = current ? answers[current.id] ?? {} : {};
  const canProceed = current ? isBlockAnswered(current, payload) : true;
  const isLast = step >= blocks.length - 1;

  if (result) {
    return (
      <Card>
        <p className="title">{t("prev_result")}</p>
        <p>
          <span className={`pill ${result.decision}`}>{decisionText(result.decision)}</span>
        </p>
        <p className="hint">
          {t("j_score")}: {result.score}. {result.reason}
        </p>
        <Button variant="secondary" onClick={onClose}>
          {t("prev_close")}
        </Button>
      </Card>
    );
  }

  if (blocks.length === 0) {
    return (
      <Card>
        <p className="title">{t("prev_title")}</p>
        <p className="hint">{t("prev_empty")}</p>
        <Button variant="secondary" onClick={onClose}>
          {t("btn_close")}
        </Button>
      </Card>
    );
  }

  return (
    <Card>
      <div className="row">
        <p className="subtitle">{t("prev_title")}</p>
        <p className="hint">
          {step + 1} / {blocks.length}
        </p>
      </div>
      <BlockForm
        block={current}
        payload={payload}
        onChange={(p) => setAnswers((a) => ({ ...a, [current.id]: p }))}
      />
      {!isLast ? (
        <Button disabled={!canProceed} onClick={() => setStep((s) => s + 1)}>
          {t("next")}
        </Button>
      ) : (
        <Button
          disabled={!canProceed}
          onClick={() => setResult(evaluatePreview(draft, prepared.secrets, answers, policy))}
        >
          {t("finish")}
        </Button>
      )}
      <Button variant="danger" onClick={onClose}>
        {t("prev_leave")}
      </Button>
    </Card>
  );
}
