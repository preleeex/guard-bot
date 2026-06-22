import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { getChatMember, tryCallApi } from "../telegram/api";
import { canAddGroup } from "./quota";
import { sendSystemLog } from "../telegram/systemLog";

export class GroupError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "GroupError";
  }
}

// Connect a group to a requesting user. Only the real Telegram owner of the
// group (chat member status "creator") may connect it, not arbitrary admins.
// The chatId -> ownerUserId binding is created once and never auto-changes.
export async function connectGroup(params: {
  chatId: bigint;
  requesterUserId: bigint;
  title?: string;
}): Promise<{ created: boolean; reactivated: boolean }> {
  const { chatId, requesterUserId, title } = params;

  // Verify creator status. Throws TelegramApiError if the bot is not in the chat.
  const member = await getChatMember(chatId, requesterUserId);
  if (member.status !== "creator") {
    throw new GroupError(
      "not_creator",
      "Подключить группу может только её владелец (creator)."
    );
  }

  const existing = await prisma.group.findUnique({ where: { chatId } });

  if (existing) {
    // Binding is permanent: the requester must be the bound owner.
    if (existing.ownerUserId !== requesterUserId) {
      throw new GroupError(
        "bound_to_other_owner",
        "Эта группа уже привязана к другому владельцу."
      );
    }
    if (existing.removedAt) {
      // Re-connecting a previously removed group. Re-check quota.
      if (!(await canAddGroup(requesterUserId))) {
        throw new GroupError("quota_exceeded", "Достигнут лимит групп.");
      }
      await prisma.group.update({
        where: { chatId },
        data: { removedAt: null, title: title ?? existing.title },
      });
      return { created: false, reactivated: true };
    }
    // Already connected and active; just refresh the title.
    if (title && title !== existing.title) {
      await prisma.group.update({ where: { chatId }, data: { title } });
    }
    return { created: false, reactivated: false };
  }

  // New binding. Enforce quota.
  if (!(await canAddGroup(requesterUserId))) {
    throw new GroupError("quota_exceeded", "Достигнут лимит групп.");
  }

  await prisma.user.upsert({
    where: { id: requesterUserId },
    update: {},
    create: { id: requesterUserId },
  });

  await prisma.group.create({
    data: { chatId, ownerUserId: requesterUserId, title },
  });

  await sendSystemLog({
    kind: "group_connected",
    title,
    chatId,
    ownerUserId: requesterUserId,
  });

  // Notify the owner in their DM too (best effort).
  await tryCallApi("sendMessage", {
    chat_id: Number(requesterUserId),
    text: `Новая группа подключена: ${title ?? chatId}`,
  });

  return { created: true, reactivated: false };
}

export async function listGroups(ownerUserId: bigint) {
  return prisma.group.findMany({
    where: { ownerUserId, removedAt: null },
    orderBy: { connectedAt: "asc" },
    include: { _count: { select: { blocks: true } } },
  });
}

// Ensure the given user is the bound owner of the chat. Used to gate all
// owner-scoped Mini App actions (settings, scenario, journal).
export async function assertOwnerOf(chatId: bigint, userId: bigint) {
  const group = await prisma.group.findUnique({ where: { chatId } });
  if (!group || group.removedAt) {
    throw new GroupError("not_found", "Группа не найдена.");
  }
  if (group.ownerUserId !== userId) {
    throw new GroupError("forbidden", "Нет доступа к этой группе.");
  }
  return group;
}

export async function setGuardEnabled(
  chatId: bigint,
  userId: bigint,
  enabled: boolean
) {
  await assertOwnerOf(chatId, userId);
  return prisma.group.update({
    where: { chatId },
    data: { guardEnabled: enabled },
  });
}

export async function updateSettings(
  chatId: bigint,
  userId: bigint,
  data: {
    resultPolicy?: unknown;
    timeoutSeconds?: number;
    timeoutAction?: "queue" | "decline";
    cooldownSeconds?: number;
    voiceScreening?: boolean;
    voicePrompt?: string | null;
    emojiGate?: boolean;
  }
) {
  await assertOwnerOf(chatId, userId);
  return prisma.group.update({
    where: { chatId },
    data: {
      ...(data.resultPolicy !== undefined
        ? { resultPolicy: data.resultPolicy as Prisma.InputJsonValue }
        : {}),
      ...(data.timeoutSeconds !== undefined ? { timeoutSeconds: data.timeoutSeconds } : {}),
      ...(data.timeoutAction !== undefined ? { timeoutAction: data.timeoutAction } : {}),
      ...(data.cooldownSeconds !== undefined ? { cooldownSeconds: Math.max(0, data.cooldownSeconds) } : {}),
      ...(data.voiceScreening !== undefined ? { voiceScreening: data.voiceScreening } : {}),
      ...(data.voicePrompt !== undefined ? { voicePrompt: data.voicePrompt } : {}),
      ...(data.emojiGate !== undefined ? { emojiGate: data.emojiGate } : {}),
    },
  });
}

// Save the required emoji status for the gate (the owner's current status). When
// cleared (null) the gate has nothing to match and is effectively off.
export async function setEmojiStatus(
  chatId: bigint,
  userId: bigint,
  emojiStatusId: string | null
) {
  await assertOwnerOf(chatId, userId);
  return prisma.group.update({
    where: { chatId },
    data: {
      emojiStatusId,
      ...(emojiStatusId ? { emojiGate: true } : { emojiGate: false }),
    },
  });
}

// Mark a group as removed when the bot is kicked or leaves. The binding row is
// kept (anti-abuse) but stops occupying a free slot.
export async function markGroupRemoved(chatId: bigint) {
  const group = await prisma.group.findUnique({ where: { chatId } });
  if (!group || group.removedAt) return;
  await prisma.group.update({
    where: { chatId },
    data: { removedAt: new Date(), guardEnabled: false },
  });
  await sendSystemLog({ kind: "group_removed", title: group.title ?? undefined, chatId });
}
