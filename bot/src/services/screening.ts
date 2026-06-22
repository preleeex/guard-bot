import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { config } from "../config";
import { logger } from "../logger";
import {
  answerChatJoinRequestQuery,
  approveChatJoinRequest,
  declineChatJoinRequest,
  unmuteMember,
  kickMember,
  deleteMessage,
  tryCallApi,
  type JoinDecision,
} from "../telegram/api";
import { getScenario } from "./scenarios";
import { addJournalEntry } from "./journal";
import { isBanned } from "./moderation";
import type {
  BlockAnswer,
  CaptchaConfig,
  Decision,
  QuizConfig,
  ResultPolicy,
  ScenarioBlockDTO,
} from "../types/scenario";

// --- session creation ------------------------------------------------------

interface CreateSessionInput {
  chatId: bigint;
  applicantUserId: bigint;
  applicantUsername?: string | null;
  applicantName?: string | null;
  queryId?: string | null;
  mode: "query" | "legacy" | "member" | "voice";
  timeoutSeconds: number;
}

// Generate server-side secrets for verifiable blocks. Kept out of the public
// scenario the applicant receives.
function buildChallenge(blocks: ScenarioBlockDTO[]): Record<string, unknown> {
  const challenge: Record<string, unknown> = {};
  for (const block of blocks) {
    if (block.type !== "captcha") continue;
    const cfg = block.config as CaptchaConfig;
    if (cfg.kind === "math") {
      const a = 1 + Math.floor(Math.random() * 9);
      const b = 1 + Math.floor(Math.random() * 9);
      const op = ["+", "-", "×"][Math.floor(Math.random() * 3)];
      let prompt: string;
      let expected: number;
      if (op === "+") {
        prompt = `${a} + ${b}`;
        expected = a + b;
      } else if (op === "-") {
        const hi = Math.max(a, b);
        const lo = Math.min(a, b);
        prompt = `${hi} - ${lo}`;
        expected = hi - lo;
      } else {
        prompt = `${a} × ${b}`;
        expected = a * b;
      }
      challenge[block.id] = { prompt, expected };
    } else if (cfg.kind === "visual") {
      const code = Math.random().toString(36).slice(2, 7).toUpperCase();
      challenge[block.id] = { code };
    }
    // button captcha needs no secret
  }
  return challenge;
}

export async function createScreeningSession(input: CreateSessionInput) {
  const blocks = await getScenario(input.chatId);
  const challenge = buildChallenge(blocks);
  const expiresAt = new Date(Date.now() + input.timeoutSeconds * 1000);

  return prisma.screeningSession.create({
    data: {
      chatId: input.chatId,
      applicantUserId: input.applicantUserId,
      applicantUsername: input.applicantUsername ?? null,
      applicantName: input.applicantName ?? null,
      queryId: input.queryId ?? null,
      mode: input.mode,
      challenge: challenge as Prisma.InputJsonValue,
      expiresAt,
    },
  });
}

// Build the Mini App URL the applicant opens for a session.
export function screeningUrl(sessionId: string): string {
  return `${config.miniAppUrl}/?mode=screening&session=${encodeURIComponent(sessionId)}`;
}

// --- public scenario (applicant-facing, secrets stripped) ------------------

export async function getPublicScenario(sessionId: string, applicantUserId: bigint) {
  const session = await prisma.screeningSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new ScreeningError("not_found", "Сессия не найдена.");
  if (session.applicantUserId !== applicantUserId) {
    throw new ScreeningError("forbidden", "Эта проверка предназначена другому пользователю.");
  }
  if (session.status !== "pending") {
    throw new ScreeningError("closed", "Проверка уже завершена.");
  }
  if (session.expiresAt.getTime() < Date.now()) {
    throw new ScreeningError("expired", "Время на проверку истекло.");
  }
  if (await isBanned(applicantUserId)) {
    throw new ScreeningError("banned", "Доступ заблокирован.");
  }

  const blocks = await getScenario(session.chatId);
  const challenge = session.challenge as unknown as Record<string, { prompt?: string; code?: string }>;

  const publicBlocks = blocks.map((block) => {
    if (block.type === "quiz") {
      const cfg = block.config as QuizConfig;
      // strip correct answers
      return {
        id: block.id,
        type: block.type,
        config: {
          passCount: cfg.passCount,
          questions: (cfg.questions ?? []).map((q) => ({
            id: q.id,
            text: q.text,
            image: q.image,
            imageSize: q.imageSize,
            options: q.options,
            optionImages: q.optionImages,
          })),
        },
      };
    }
    if (block.type === "captcha") {
      const cfg = block.config as CaptchaConfig;
      const ch = challenge[block.id];
      return {
        id: block.id,
        type: block.type,
        config: {
          kind: cfg.kind,
          prompt: ch?.prompt ?? cfg.prompt,
          code: ch?.code, // visual captcha: text to render distorted
          buttonLabel: cfg.buttonLabel,
        },
      };
    }
    // rules and unknown types: pass config through as-is
    return { id: block.id, type: block.type, config: block.config };
  });

  return {
    sessionId: session.id,
    expiresAt: session.expiresAt,
    blocks: publicBlocks,
  };
}

// --- evaluation ------------------------------------------------------------

interface BlockResult {
  blockId: string;
  type: string;
  passed: boolean;
  mandatory: boolean;
  score?: number; // quiz only, 0..100
}

function evaluateBlock(
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
        if (
          picked.length === truth.length &&
          picked.every((v, i) => v === truth[i])
        ) {
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

function decide(
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

// --- applying a decision through Telegram ----------------------------------

export async function applyJoinDecision(
  session: {
    mode: string;
    queryId: string | null;
    chatId: bigint;
    applicantUserId: bigint;
    challenge?: unknown;
  },
  decision: Decision
): Promise<void> {
  // Open-group flow: the applicant is already a (muted) member.
  if (session.mode === "member") {
    if (decision === "approve") {
      await unmuteMember(session.chatId, session.applicantUserId);
    } else if (decision === "decline") {
      await kickMember(session.chatId, session.applicantUserId);
    }
    // queue: leave muted for manual review.
    const promptId = (session.challenge as { _prompt?: number } | null)?._prompt;
    if (promptId) await deleteMessage(session.chatId, Number(promptId));
    return;
  }

  if (session.mode === "query" && session.queryId) {
    await answerChatJoinRequestQuery(session.queryId, decision as JoinDecision);
    return;
  }
  // legacy mode
  if (decision === "approve") {
    await approveChatJoinRequest(session.chatId, session.applicantUserId);
  } else if (decision === "decline") {
    await declineChatJoinRequest(session.chatId, session.applicantUserId);
  }
  // queue in legacy mode: leave the request pending for manual review
}

// --- submit (applicant finished the Mini App) ------------------------------

export async function submitScreening(
  sessionId: string,
  applicantUserId: bigint,
  answers: BlockAnswer[]
): Promise<{ decision: Decision; score: number; reason: string }> {
  const session = await prisma.screeningSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new ScreeningError("not_found", "Сессия не найдена.");
  if (session.applicantUserId !== applicantUserId) {
    throw new ScreeningError("forbidden", "Эта проверка предназначена другому пользователю.");
  }
  if (session.status !== "pending") {
    throw new ScreeningError("closed", "Проверка уже завершена.");
  }

  const group = await prisma.group.findUnique({ where: { chatId: session.chatId } });
  if (!group) throw new ScreeningError("not_found", "Группа не найдена.");

  // Banned users are declined regardless of answers.
  if (await isBanned(applicantUserId)) {
    await prisma.screeningSession.update({ where: { id: sessionId }, data: { status: "completed" } });
    try {
      await applyJoinDecision(session, "decline");
    } catch (err) {
      logger.error("failed to decline banned applicant", { sessionId, err: String(err) });
    }
    await addJournalEntry({
      chatId: session.chatId,
      applicantUserId: session.applicantUserId,
      applicantUsername: session.applicantUsername,
      applicantName: session.applicantName,
      decision: "decline",
      reason: "Заблокирован.",
      answers: [],
      startedAt: session.createdAt,
    });
    return { decision: "decline", score: 0, reason: "Заблокирован." };
  }

  const blocks = await getScenario(session.chatId);
  const challenge = session.challenge as unknown as Record<string, { expected?: number; code?: string }>;
  const answersByBlock = new Map(answers.map((a) => [a.blockId, a]));

  const results = blocks.map((b) => evaluateBlock(b, answersByBlock.get(b.id), challenge));
  const policy = group.resultPolicy as unknown as ResultPolicy;
  const { decision, score, reason } = decide(results, policy);

  // Mark the session completed before the external call to avoid double-submit.
  await prisma.screeningSession.update({
    where: { id: sessionId },
    data: { status: "completed" },
  });

  try {
    await applyJoinDecision(session, decision);
  } catch (err) {
    logger.error("failed to apply join decision", { sessionId, err: String(err) });
    // The journal still records the intended decision; the timeout job and
    // manual review remain available as a safety net.
  }

  await addJournalEntry({
    chatId: session.chatId,
    applicantUserId: session.applicantUserId,
    applicantUsername: session.applicantUsername,
    applicantName: session.applicantName,
    decision,
    reason,
    score,
    answers,
    startedAt: session.createdAt,
  });

  await notifyOwnerDecision({
    ownerUserId: group.ownerUserId,
    chatId: session.chatId,
    chatTitle: group.title,
    applicantUserId: session.applicantUserId,
    applicantUsername: session.applicantUsername,
    applicantName: session.applicantName,
    decision,
    reason,
    score,
  });

  return { decision, score, reason };
}

// --- timeout handling ------------------------------------------------------

// Expire all pending sessions past their deadline and apply the group's
// configured timeout action (queue or decline).
export async function expireDueSessions(): Promise<number> {
  const due = await prisma.screeningSession.findMany({
    where: { status: "pending", expiresAt: { lt: new Date() } },
    take: 200,
  });

  let handled = 0;
  for (const session of due) {
    const group = await prisma.group.findUnique({ where: { chatId: session.chatId } });
    const action = (group?.timeoutAction as "queue" | "decline") ?? "queue";
    const decision: Decision = action === "decline" ? "decline" : "queue";

    await prisma.screeningSession.update({
      where: { id: session.id },
      data: { status: "expired" },
    });

    try {
      await applyJoinDecision(session, decision);
    } catch (err) {
      logger.error("failed to apply timeout decision", { id: session.id, err: String(err) });
    }

    await addJournalEntry({
      chatId: session.chatId,
      applicantUserId: session.applicantUserId,
      applicantUsername: session.applicantUsername,
      applicantName: session.applicantName,
      decision: "timeout",
      reason: `Таймаут, действие: ${decision}.`,
      answers: [],
      startedAt: session.createdAt,
    });

    if (group) {
      await notifyOwnerDecision({
        ownerUserId: group.ownerUserId,
        chatId: session.chatId,
        chatTitle: group.title,
        applicantUserId: session.applicantUserId,
        applicantUsername: session.applicantUsername,
        applicantName: session.applicantName,
        decision: "timeout",
        reason: `Таймаут, действие: ${decision}.`,
      });
    }
    handled += 1;
  }
  return handled;
}

// DM the group owner about a screening decision, with profile and journal
// buttons. "Журнал" opens the Mini App straight at this person's record.
async function notifyOwnerDecision(params: {
  ownerUserId: bigint;
  chatId: bigint;
  chatTitle?: string | null;
  applicantUserId: bigint;
  applicantUsername?: string | null;
  applicantName?: string | null;
  decision: string;
  reason: string;
  score?: number | null;
}): Promise<void> {
  const label =
    params.decision === "approve"
      ? "Прошёл"
      : params.decision === "decline"
      ? "Не прошёл"
      : params.decision === "queue"
      ? "Очередь"
      : "Таймаут";
  const who = params.applicantUsername
    ? `@${params.applicantUsername}`
    : params.applicantName ?? String(params.applicantUserId);
  const lines = [
    `${label}: ${who} (id: ${params.applicantUserId})`,
    params.chatTitle ? `Группа: ${params.chatTitle}` : "",
    params.score != null ? `Балл: ${params.score}` : "",
    params.reason,
  ].filter(Boolean);

  const journalUrl =
    `${config.miniAppUrl}/?mode=owner` +
    `&group=${encodeURIComponent(params.chatId.toString())}` +
    `&journal=${encodeURIComponent(params.applicantUserId.toString())}`;
  const row: Record<string, unknown>[] = [];
  if (params.applicantUsername) {
    row.push({ text: "Профиль", url: `https://t.me/${params.applicantUsername}` });
  }
  row.push({ text: "Журнал", web_app: { url: journalUrl } });
  const reply_markup = { inline_keyboard: [row] };

  await tryCallApi("sendMessage", {
    chat_id: Number(params.ownerUserId),
    text: lines.join("\n"),
    reply_markup,
  });
}

export class ScreeningError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "ScreeningError";
  }
}
