import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { getBotId, getChat, getChatMember, tryCallApi } from "../telegram/api";
import { canAddGroup } from "./quota";
import { sendSystemLog } from "../telegram/systemLog";
import { logger } from "../logger";
import { t, normalizeLang } from "../i18n";

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
    welcomeEnabled?: boolean;
    welcomeText?: string | null;
    welcomeDeleteSeconds?: number | null;
    allowEditAnswers?: boolean;
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
      ...(data.welcomeEnabled !== undefined ? { welcomeEnabled: data.welcomeEnabled } : {}),
      ...(data.welcomeText !== undefined ? { welcomeText: data.welcomeText } : {}),
      ...(data.welcomeDeleteSeconds !== undefined
        ? { welcomeDeleteSeconds: data.welcomeDeleteSeconds == null ? null : Math.max(0, data.welcomeDeleteSeconds) }
        : {}),
      ...(data.allowEditAnswers !== undefined ? { allowEditAnswers: data.allowEditAnswers } : {}),
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

export interface SetupCheckItem {
  key: string;
  ok: boolean;
}

export interface SetupReport {
  items: SetupCheckItem[];
  ok: boolean;
}

// Self-check a group's setup so the owner can see why guard might do nothing.
// Each item is returned as a key (the Mini App maps keys to localized text) plus
// an ok flag.
export async function checkGroupSetup(chatId: bigint, userId: bigint): Promise<SetupReport> {
  const group = await assertOwnerOf(chatId, userId);

  let botAdmin = false;
  let canApprove = false;
  let notAnonymous = true; // assume fine unless we learn otherwise
  let joinByRequest = false;
  let guardBotAssigned = false;

  try {
    const botId = await getBotId();
    const member = await getChatMember(chatId, botId);
    botAdmin = member.status === "administrator" || member.status === "creator";
    canApprove = botAdmin && member.can_invite_users === true;
    notAnonymous = !(botAdmin && member.is_anonymous === true);
    try {
      const info = await getChat(Number(chatId));
      joinByRequest = info.join_by_request === true;
      guardBotAssigned = info.guard_bot?.id === botId;
    } catch {
      // chat info unreadable
    }
  } catch {
    // Bot likely not in the chat; leave defaults.
  }

  const scenarioBlocks = await prisma.scenarioBlock.count({ where: { chatId } });
  const scenarioReady = scenarioBlocks > 0;

  const items: SetupCheckItem[] = [
    { key: "bot_admin", ok: botAdmin },
    { key: "can_approve", ok: canApprove },
    { key: "not_anonymous", ok: notAnonymous },
    { key: "join_by_request", ok: joinByRequest },
    { key: "guard_bot", ok: guardBotAssigned },
    { key: "scenario", ok: scenarioReady },
    { key: "guard_enabled", ok: group.guardEnabled },
  ];
  const ok = items.every((i) => i.ok);
  return { items, ok };
}

// Notify the owner once (with anti-spam dedup) when the guard bot got
// unassigned while guard is enabled. Telegram resets the guard bot whenever the
// bot's admin rights are edited, so this is a common silent failure.
export async function nudgeGuardIfNeeded(chatId: bigint, minHoursBetween = 6): Promise<void> {
  const group = await prisma.group.findUnique({ where: { chatId } });
  if (!group || group.removedAt || !group.guardEnabled) return;

  let assigned = false;
  try {
    const botId = await getBotId();
    const info = await getChat(Number(chatId));
    assigned = info.guard_bot?.id === botId;
  } catch {
    return; // cannot read chat; do not nudge on uncertainty
  }
  if (assigned) {
    // Clear the dedup marker so a future drop nudges again.
    if (group.guardNudgedAt) {
      await prisma.group.update({ where: { chatId }, data: { guardNudgedAt: null } });
    }
    return;
  }

  const now = Date.now();
  if (group.guardNudgedAt && now - group.guardNudgedAt.getTime() < minHoursBetween * 3_600_000) {
    return;
  }

  const owner = await prisma.user.findUnique({ where: { id: group.ownerUserId } });
  const lang = normalizeLang(owner?.language);
  const sent = await tryCallApi("sendMessage", {
    chat_id: Number(group.ownerUserId),
    text: t(lang, "guard_nudge", { title: group.title ?? String(chatId) }),
  });
  if (sent !== null) {
    await prisma.group.update({ where: { chatId }, data: { guardNudgedAt: new Date() } });
    logger.info("guard nudge sent", { chatId: chatId.toString() });
  }
}

// Escape text for Telegram HTML parse mode.
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Post the configured welcome message in the group after a member is approved,
// mentioning the new member. Optionally auto-deletes after N seconds. Best
// effort: any failure is logged and swallowed.
export async function sendWelcome(
  chatId: bigint,
  applicantUserId: bigint,
  name?: string | null,
  username?: string | null
): Promise<void> {
  const group = await prisma.group.findUnique({ where: { chatId } });
  if (!group || !group.welcomeEnabled || !group.welcomeText?.trim()) return;

  const display = escapeHtml(name?.trim() || (username ? `@${username}` : "участник"));
  const mention = `<a href="tg://user?id=${applicantUserId}">${display}</a>`;
  // {name} is replaced by the mention; otherwise the mention is prefixed.
  const body = group.welcomeText.includes("{name}")
    ? group.welcomeText.replace(/\{name\}/g, mention)
    : `${mention}, ${group.welcomeText}`;

  const sent = await tryCallApi<{ message_id: number }>("sendMessage", {
    chat_id: Number(chatId),
    text: body,
    parse_mode: "HTML",
  });
  if (sent === null) {
    logger.warn("welcome send failed", { chatId: chatId.toString() });
    return;
  }
  const ttl = group.welcomeDeleteSeconds;
  if (ttl && ttl > 0 && sent.message_id) {
    setTimeout(() => {
      void tryCallApi("deleteMessage", { chat_id: Number(chatId), message_id: sent.message_id });
    }, ttl * 1000).unref?.();
  }
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
