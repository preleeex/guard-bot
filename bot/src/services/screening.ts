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
import { decide, evaluateBlock } from "./evaluation";
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

  // Voice screening: no in-app blocks. The app shows a prompt plus a button to
  // record a voice message in the bot DM (works without a pre-existing DM).
  if (session.mode === "voice") {
    const group = await prisma.group.findUnique({ where: { chatId: session.chatId } });
    return {
      sessionId: session.id,
      expiresAt: session.expiresAt,
      blocks: [],
      voice: true as const,
      voicePrompt: group?.voicePrompt ?? null,
    };
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
            optionImageSize: q.optionImageSize,
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
    voice: false as const,
    voicePrompt: null,
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

// --- maintenance -----------------------------------------------------------

// Delete finished sessions and old journal entries so the database does not
// grow without bound. Pending sessions are never touched here.
export async function purgeOldData(opts?: {
  sessionDays?: number;
  journalDays?: number;
}): Promise<{ sessions: number; journal: number }> {
  const sessionDays = opts?.sessionDays ?? 7;
  const journalDays = opts?.journalDays ?? 90;
  const sessionCutoff = new Date(Date.now() - sessionDays * 86_400_000);
  const journalCutoff = new Date(Date.now() - journalDays * 86_400_000);

  const sessions = await prisma.screeningSession.deleteMany({
    where: { status: { in: ["completed", "expired"] }, createdAt: { lt: sessionCutoff } },
  });
  const journal = await prisma.journalEntry.deleteMany({
    where: { finishedAt: { lt: journalCutoff } },
  });
  return { sessions: sessions.count, journal: journal.count };
}

// --- per-group statistics (owner-facing) -----------------------------------

export async function getGroupStats(chatId: bigint): Promise<{
  total: number;
  approve: number;
  decline: number;
  queue: number;
  timeout: number;
  last7d: number;
}> {
  const rows = await prisma.journalEntry.groupBy({
    by: ["decision"],
    where: { chatId },
    _count: { _all: true },
  });
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.decision] = r._count._all;
  const last7d = await prisma.journalEntry.count({
    where: { chatId, finishedAt: { gt: new Date(Date.now() - 7 * 86_400_000) } },
  });
  const approve = counts.approve ?? 0;
  const decline = counts.decline ?? 0;
  const queue = counts.queue ?? 0;
  const timeout = counts.timeout ?? 0;
  return { total: approve + decline + queue + timeout, approve, decline, queue, timeout, last7d };
}

export class ScreeningError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "ScreeningError";
  }
}
