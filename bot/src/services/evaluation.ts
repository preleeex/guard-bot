import { logger } from "../logger";
import type {
  BlockAnswer,
  CaptchaConfig,
  Decision,
  QuizConfig,
  ResultPolicy,
  ScenarioBlockDTO,
} from "../types/scenario";

// Pure screening evaluation logic, kept free of database/config imports so it
// can be unit-tested in isolation.

export interface BlockResult {
  blockId: string;
  type: string;
  passed: boolean;
  mandatory: boolean;
  score?: number; // quiz only, 0..100
}

export function evaluateBlock(
  block: ScenarioBlockDTO,
  answer: BlockAnswer | undefined,
  challenge: Record<string, { expected?: number; code?: string }>
): BlockResult {
  switch (block.type) {
    case "captcha": {
      const cfg = block.config as CaptchaConfig;
      const ch = challenge[block.id] ?? {};
      let passed = false;
      if (cfg.kind === "math") {
        passed = Number(answer?.payload?.value) === ch.expected;
      } else if (cfg.kind === "visual") {
        passed =
          String(answer?.payload?.value ?? "").trim().toUpperCase() ===
          String(ch.code ?? "").toUpperCase();
      } else {
        passed = answer?.payload?.pressed === true;
      }
      return { blockId: block.id, type: block.type, passed, mandatory: true };
    }
    case "quiz": {
      const cfg = block.config as QuizConfig;
      const selected = (answer?.payload?.selected ?? {}) as Record<string, number[]>;
      const questions = cfg.questions ?? [];
      let correct = 0;
      for (const q of questions) {
        const picked = (selected[q.id] ?? []).slice().sort();
        const truth = (q.correct ?? []).slice().sort();
        if (picked.length === truth.length && picked.every((v, i) => v === truth[i])) {
          correct += 1;
        }
      }
      const score = questions.length === 0 ? 100 : Math.round((correct / questions.length) * 100);
      const need = cfg.passCount ?? questions.length;
      return {
        blockId: block.id,
        type: block.type,
        passed: correct >= need,
        mandatory: true,
        score,
      };
    }
    case "rules": {
      return {
        blockId: block.id,
        type: block.type,
        passed: answer?.payload?.agreed === true,
        mandatory: true,
      };
    }
    case "media":
      // Display-only block: never blocks the applicant.
      return { blockId: block.id, type: block.type, passed: true, mandatory: false };
    default:
      // Unknown block type: do not block the applicant, but record it.
      logger.warn("unknown block type during evaluation", { type: block.type });
      return { blockId: block.id, type: block.type, passed: true, mandatory: false };
  }
}

export function decide(
  results: BlockResult[],
  policy: ResultPolicy
): { decision: Decision; score: number; reason: string } {
  const mandatoryFailed = results.some((r) => r.mandatory && !r.passed);
  const quizScores = results.filter((r) => typeof r.score === "number").map((r) => r.score!);
  const score = quizScores.length
    ? Math.round(quizScores.reduce((a, b) => a + b, 0) / quizScores.length)
    : mandatoryFailed
    ? 0
    : 100;

  if (mandatoryFailed) {
    return {
      decision: policy.failDecline ? "decline" : "queue",
      score,
      reason: "Не пройден обязательный блок.",
    };
  }

  if (policy.queueThreshold != null) {
    if (score >= policy.queueThreshold) {
      return {
        decision: policy.passApprove ? "approve" : "queue",
        score,
        reason: `Результат ${score}, порог ${policy.queueThreshold}.`,
      };
    }
    return { decision: "queue", score, reason: `Результат ${score} ниже порога ${policy.queueThreshold}.` };
  }

  return {
    decision: policy.passApprove ? "approve" : "queue",
    score,
    reason: "Сценарий пройден.",
  };
}
