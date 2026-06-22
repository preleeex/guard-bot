import { prisma } from "../db";
import { config } from "../config";
import { isBanned, unbanUser } from "./moderation";
import { sendMessage, trySendPhotoBuffer } from "../telegram/api";
import { logger } from "../logger";

export type AppealStatus = "none" | "pending" | "approved" | "rejected";

const MAX_TEXT = 2000;
const MAX_PHOTO_BYTES = 600_000;

export class AppealError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "AppealError";
  }
}

function parseDataUrl(dataUrl: string): Buffer | null {
  const m = /^data:image\/(?:jpeg|jpg|png|webp);base64,(.+)$/i.exec(dataUrl.trim());
  if (!m) return null;
  try {
    return Buffer.from(m[1], "base64");
  } catch {
    return null;
  }
}

export async function getAppealState(userId: bigint): Promise<{
  banned: boolean;
  reason: string | null;
  appealStatus: AppealStatus;
  canAppeal: boolean;
}> {
  const ban = await prisma.bannedUser.findUnique({ where: { userId } });
  if (!ban) {
    return { banned: false, reason: null, appealStatus: "none", canAppeal: false };
  }

  const latest = await prisma.appeal.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  const appealStatus: AppealStatus =
    latest?.status === "pending"
      ? "pending"
      : latest?.status === "approved"
      ? "approved"
      : latest?.status === "rejected"
      ? "rejected"
      : "none";

  const canAppeal = appealStatus === "none";
  return { banned: true, reason: ban.reason, appealStatus, canAppeal };
}

export async function submitAppeal(params: {
  userId: bigint;
  username?: string | null;
  name?: string | null;
  text: string;
  photoData?: string | null;
}): Promise<{ id: string }> {
  if (!(await isBanned(params.userId))) {
    throw new AppealError("not_banned", "Апелляция доступна только заблокированным.");
  }

  const state = await getAppealState(params.userId);
  if (!state.canAppeal) {
    throw new AppealError(
      state.appealStatus === "pending" ? "pending" : "closed",
      state.appealStatus === "pending"
        ? "Апелляция уже на рассмотрении."
        : "Повторная апелляция недоступна."
    );
  }

  const text = params.text.trim();
  if (text.length < 10) {
    throw new AppealError("invalid_input", "Опишите ситуацию подробнее (минимум 10 символов).");
  }
  if (text.length > MAX_TEXT) {
    throw new AppealError("invalid_input", "Слишком длинный текст.");
  }

  let photoData: string | null = null;
  if (params.photoData?.trim()) {
    const buf = parseDataUrl(params.photoData);
    if (!buf || buf.length === 0) {
      throw new AppealError("invalid_input", "Некорректное фото.");
    }
    if (buf.length > MAX_PHOTO_BYTES) {
      throw new AppealError("invalid_input", "Фото слишком большое.");
    }
    photoData = params.photoData.trim();
  }

  const appeal = await prisma.appeal.create({
    data: {
      userId: params.userId,
      username: params.username ?? null,
      name: params.name ?? null,
      text,
      photoData,
    },
  });

  await notifyOperatorNewAppeal(appeal.id);
  return { id: appeal.id };
}

export async function listPendingAppeals(limit = 50) {
  return prisma.appeal.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

export async function getAppealById(id: string) {
  return prisma.appeal.findUnique({ where: { id } });
}

async function notifyOperatorNewAppeal(appealId: string): Promise<void> {
  const appeal = await prisma.appeal.findUnique({ where: { id: appealId } });
  if (!appeal || appeal.status !== "pending") return;

  const who = appeal.username ? `@${appeal.username}` : appeal.name ?? String(appeal.userId);
  const lines = [
    "Апелляция на разбан",
    `${who} (id: ${appeal.userId})`,
    appeal.text,
  ];
  const caption = lines.join("\n");
  const reply_markup = {
    inline_keyboard: [
      [
        { text: "Одобрить", callback_data: `appeal:approve:${appeal.id}` },
        { text: "Отклонить", callback_data: `appeal:reject:${appeal.id}` },
      ],
    ],
  };

  const chatId = config.ownerUserId;
  if (appeal.photoData) {
    const buf = parseDataUrl(appeal.photoData);
    if (buf) {
      const sent = await trySendPhotoBuffer(chatId, buf, `appeal-${appeal.id}.jpg`, caption, reply_markup);
      if (sent !== null) return;
    }
  }
  await sendMessage(chatId, caption, reply_markup).catch((err) => {
    logger.warn("appeal notify failed", { appealId, err: String(err) });
  });
}

export async function resolveAppeal(
  appealId: string,
  action: "approve" | "reject",
  by: bigint
): Promise<{ ok: boolean; already: boolean }> {
  const appeal = await prisma.appeal.findUnique({ where: { id: appealId } });
  if (!appeal) throw new AppealError("not_found", "Апелляция не найдена.");
  if (appeal.status !== "pending") return { ok: true, already: true };

  const now = new Date();
  if (action === "approve") {
    await prisma.appeal.update({
      where: { id: appealId },
      data: { status: "approved", resolvedAt: now, resolvedBy: by },
    });
    await unbanUser(appeal.userId);
    await sendMessage(
      appeal.userId,
      "Апелляция одобрена. Доступ к боту восстановлен."
    ).catch(() => undefined);
  } else {
    await prisma.appeal.update({
      where: { id: appealId },
      data: { status: "rejected", resolvedAt: now, resolvedBy: by },
    });
    await sendMessage(
      appeal.userId,
      "Апелляция отклонена. Доступ к боту остаётся закрытым."
    ).catch(() => undefined);
  }

  return { ok: true, already: false };
}
