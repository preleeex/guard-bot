// Client-side mirror of the backend evaluation, used only for the owner Preview
// mode (real applicants are always evaluated on the server).

import type {
  CaptchaConfig,
  QuizConfig,
  ResultPolicy,
  ScenarioBlock,
} from "./types";
import type { Payload } from "@/components/BlockForm";

export interface PreviewSecret {
  expected?: number; // captcha math
  code?: string; // captcha visual
}

// Build applicant-facing blocks from the owner's draft, generating captcha
// challenges and stripping quiz correct answers. Returns the secrets too.
export function buildPreview(draft: ScenarioBlock[]): {
  blocks: ScenarioBlock[];
  secrets: Record<string, PreviewSecret>;
} {
  const secrets: Record<string, PreviewSecret> = {};
  const blocks = draft.map((block) => {
    if (block.type === "captcha") {
      const cfg = block.config as CaptchaConfig;
      if (cfg.kind === "math") {
        const a = 1 + Math.floor(Math.random() * 9);
        const b = 1 + Math.floor(Math.random() * 9);
        secrets[block.id] = { expected: a + b };
        return { ...block, config: { ...cfg, prompt: `${a} + ${b}` } };
      }
      if (cfg.kind === "visual") {
        const code = Math.random().toString(36).slice(2, 7).toUpperCase();
        secrets[block.id] = { code };
        return { ...block, config: { ...cfg, code } };
      }
      return block;
    }
    if (block.type === "quiz") {
      const cfg = block.config as QuizConfig;
      return {
        ...block,
        config: {
          passCount: cfg.passCount,
          questions: (cfg.questions ?? []).map((q) => ({
            id: q.id,
            text: q.text,
            image: q.image,
            options: q.options,
            optionImages: q.optionImages,
          })),
        },
      };
    }
    return block;
  });
  return { blocks, secrets };
}

export function evaluatePreview(
  draft: ScenarioBlock[],
  secrets: Record<string, PreviewSecret>,
  answers: Record<string, Payload>,
  policy: ResultPolicy
): { decision: string; score: number; reason: string } {
  let mandatoryFailed = false;
  const quizScores: number[] = [];

  for (const block of draft) {
    const payload = answers[block.id] ?? {};
    if (block.type === "captcha") {
      const cfg = block.config as CaptchaConfig;
      const secret = secrets[block.id] ?? {};
      let passed = false;
      if (cfg.kind === "math") passed = Number(payload.value) === secret.expected;
      else if (cfg.kind === "visual")
        passed = String(payload.value ?? "").trim().toUpperCase() === (secret.code ?? "");
      else passed = payload.pressed === true;
      if (!passed) mandatoryFailed = true;
    } else if (block.type === "quiz") {
      const cfg = block.config as QuizConfig;
      const selected = (payload.selected ?? {}) as Record<string, number[]>;
      const questions = cfg.questions ?? [];
      let correct = 0;
      for (const q of questions) {
        const picked = (selected[q.id] ?? []).slice().sort();
        const truth = (q.correct ?? []).slice().sort();
        if (picked.length === truth.length && picked.every((v, i) => v === truth[i])) correct += 1;
      }
      const score = questions.length === 0 ? 100 : Math.round((correct / questions.length) * 100);
      quizScores.push(score);
      const need = cfg.passCount ?? questions.length;
      if (correct < need) mandatoryFailed = true;
    } else if (block.type === "rules") {
      if (payload.agreed !== true) mandatoryFailed = true;
    }
  }

  const score = quizScores.length
    ? Math.round(quizScores.reduce((a, b) => a + b, 0) / quizScores.length)
    : mandatoryFailed
    ? 0
    : 100;

  if (mandatoryFailed) {
    return { decision: policy.failDecline ? "decline" : "queue", score, reason: "Не пройден обязательный блок." };
  }
  if (policy.queueThreshold != null) {
    if (score >= policy.queueThreshold)
      return { decision: policy.passApprove ? "approve" : "queue", score, reason: `Результат ${score}, порог ${policy.queueThreshold}.` };
    return { decision: "queue", score, reason: `Результат ${score} ниже порога ${policy.queueThreshold}.` };
  }
  return { decision: policy.passApprove ? "approve" : "queue", score, reason: "Сценарий пройден." };
}
