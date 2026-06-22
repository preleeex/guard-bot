import { prisma } from "../db";
import { config, requiredChannelUrl } from "../config";
import { getChatMember } from "../telegram/api";
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
