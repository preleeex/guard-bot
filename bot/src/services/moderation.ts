import { prisma } from "../db";
import { config, requiredChannelUrl, isBotOwner } from "../config";
import { getChatMember, getEmojiStatus, leaveChat } from "../telegram/api";
import { markGroupRemoved, assertOwnerOf } from "./groups";
import { logger } from "../logger";

// --- bans ------------------------------------------------------------------

export async function isBanned(userId: bigint): Promise<boolean> {
  const row = await prisma.bannedUser.findUnique({ where: { userId } });
  return Boolean(row);
}

export async function banUser(userId: bigint, by: bigint, reason?: string): Promise<void> {
  await prisma.bannedUser.upsert({
    where: { userId },
    update: { reason: reason ?? null, bannedBy: by },
    create: { userId, bannedBy: by, reason: reason ?? null },
  });
}

export async function unbanUser(userId: bigint): Promise<void> {
  await prisma.bannedUser.deleteMany({ where: { userId } });
}

// Ban a user and immediately pull the bot out of every group they own. Used by
// the operator to shut down an abusive owner in one action.
export async function banUserEverywhere(
  userId: bigint,
  by: bigint,
  reason?: string
): Promise<{ groupsLeft: number }> {
  await banUser(userId, by, reason);
  const groups = await prisma.group.findMany({
    where: { ownerUserId: userId, removedAt: null },
    select: { chatId: true },
  });
  let groupsLeft = 0;
  for (const g of groups) {
    try {
      await leaveChat(g.chatId);
      await markGroupRemoved(g.chatId);
      groupsLeft += 1;
    } catch (err) {
      logger.warn("ban: failed to leave group", { chatId: g.chatId.toString(), err: String(err) });
    }
  }
  return { groupsLeft };
}

// List banned users (most recent first) for the admin panel.
export async function listBanned(limit = 100) {
  return prisma.bannedUser.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}

// --- per-group bans (set by the group owner) -------------------------------

export async function isGroupBanned(chatId: bigint, userId: bigint): Promise<boolean> {
  const row = await prisma.groupBan.findUnique({
    where: { chatId_userId: { chatId, userId } },
  });
  return Boolean(row);
}

export async function banInGroup(
  chatId: bigint,
  ownerUserId: bigint,
  target: { userId: bigint; username?: string | null; name?: string | null; reason?: string | null }
) {
  await assertOwnerOf(chatId, ownerUserId);
  return prisma.groupBan.upsert({
    where: { chatId_userId: { chatId, userId: target.userId } },
    update: { reason: target.reason ?? null, username: target.username ?? null, name: target.name ?? null },
    create: {
      chatId,
      userId: target.userId,
      username: target.username ?? null,
      name: target.name ?? null,
      reason: target.reason ?? null,
      createdBy: ownerUserId,
    },
  });
}

export async function unbanFromGroup(chatId: bigint, ownerUserId: bigint, userId: bigint) {
  await assertOwnerOf(chatId, ownerUserId);
  await prisma.groupBan.deleteMany({ where: { chatId, userId } });
}

export async function listGroupBans(chatId: bigint, ownerUserId: bigint, limit = 200) {
  await assertOwnerOf(chatId, ownerUserId);
  return prisma.groupBan.findMany({
    where: { chatId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

// --- anti-raid (in-memory sliding window per chat) -------------------------
//
// LIMITATION: this state lives in process memory. It resets on redeploy and is
// not shared across instances. The backend currently runs as a single instance,
// so this is acceptable. If scaled horizontally, move the window/threshold into
// the group settings and the counters into Redis or the database.

const RAID_WINDOW_MS = 30_000;
const RAID_THRESHOLD = 25; // join requests within the window
const RAID_COOLDOWN_MS = 120_000;

const joinTimes = new Map<string, number[]>();
const raidUntil = new Map<string, number>();

// Record a join request and report whether the chat is being raided. While a
// raid is active, callers should queue requests for manual review instead of
// opening a screening session for each one (which would flood the bot).
export function recordJoin(chatId: bigint): { raid: boolean; justStarted: boolean } {
  const key = chatId.toString();
  const now = Date.now();
  if (now < (raidUntil.get(key) ?? 0)) return { raid: true, justStarted: false };

  const arr = (joinTimes.get(key) ?? []).filter((t) => now - t < RAID_WINDOW_MS);
  arr.push(now);
  if (arr.length >= RAID_THRESHOLD) {
    raidUntil.set(key, now + RAID_COOLDOWN_MS);
    joinTimes.delete(key);
    return { raid: true, justStarted: true };
  }
  joinTimes.set(key, arr);
  return { raid: false, justStarted: false };
}

// Whether the applicant is still in the post-decline cooldown for this group
// (anti-spam: a recently declined/timed-out user cannot retry immediately).
export async function isOnCooldown(
  chatId: bigint,
  userId: bigint,
  cooldownSeconds: number
): Promise<boolean> {
  if (cooldownSeconds <= 0) return false;
  const last = await prisma.journalEntry.findFirst({
    where: { chatId, applicantUserId: userId, decision: { in: ["decline", "timeout"] } },
    orderBy: { finishedAt: "desc" },
    select: { finishedAt: true },
  });
  if (!last) return false;
  return Date.now() - last.finishedAt.getTime() < cooldownSeconds * 1000;
}

// --- emoji-status gate -----------------------------------------------------

// Whether the user's current emoji status matches the required one. Fails
// closed (returns false) when the status cannot be read, because the gate is a
// deliberate, opt-in paid restriction: the applicant is told how to fix it.
export async function hasRequiredEmojiStatus(
  userId: bigint,
  requiredEmojiId: string
): Promise<boolean> {
  const current = await getEmojiStatus(userId);
  if (current === null) {
    logger.info("emoji gate: status unreadable, treating as not matching", {
      userId: userId.toString(),
    });
    return false;
  }
  return current === requiredEmojiId;
}

// --- channel subscription gate ---------------------------------------------

export interface ChannelRequirement {
  required: boolean;
  subscribed: boolean;
  username?: string;
  url?: string;
}

const SUBSCRIBED_STATUSES = ["creator", "administrator", "member", "restricted"];

// Whether the user is subscribed to the mandatory channel. Fails open (treats
// as subscribed) if the check errors, e.g. the bot is not an admin of the
// channel, so a misconfiguration never locks everyone out.
export async function checkSubscription(userId: bigint): Promise<ChannelRequirement> {
  if (isBotOwner(userId)) return { required: false, subscribed: true };

  const channel = config.requiredChannel;
  if (!channel) return { required: false, subscribed: true };

  const username = channel.replace(/^@/, "");
  const url = requiredChannelUrl();
  try {
    const member = await getChatMember(channel, userId);
    return {
      required: true,
      subscribed: SUBSCRIBED_STATUSES.includes(member.status),
      username,
      url,
    };
  } catch (err) {
    logger.warn("subscription check failed (is the bot an admin of the channel?)", {
      err: String(err),
    });
    return { required: true, subscribed: true, username, url };
  }
}
