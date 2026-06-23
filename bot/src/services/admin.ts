import { prisma } from "../db";

export interface FeedItem {
  kind: "group" | "payment" | "ban" | "user";
  at: Date;
  text: string;
}

// A merged recent-activity feed for the operator, aggregated from existing
// tables (no separate events table needed).
export async function getAdminFeed(limit = 30): Promise<FeedItem[]> {
  const [groups, payments, bans, users] = await Promise.all([
    prisma.group.findMany({
      orderBy: { connectedAt: "desc" },
      take: 15,
      select: { title: true, chatId: true, connectedAt: true },
    }),
    prisma.payment.findMany({
      where: { status: "paid" },
      orderBy: { paidAt: "desc" },
      take: 15,
      select: { userId: true, amount: true, currency: true, slotsAdded: true, paidAt: true },
    }),
    prisma.bannedUser.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { userId: true, reason: true, createdAt: true },
    }),
    prisma.user.findMany({
      orderBy: { startedAt: "desc" },
      take: 15,
      select: { id: true, username: true, startedAt: true },
    }),
  ]);

  const items: FeedItem[] = [
    ...groups.map((g) => ({
      kind: "group" as const,
      at: g.connectedAt,
      text: `Группа: ${g.title ?? g.chatId}`,
    })),
    ...payments
      .filter((p) => p.paidAt)
      .map((p) => ({
        kind: "payment" as const,
        at: p.paidAt as Date,
        text: `Оплата: ${p.amount} ${p.currency}, +${p.slotsAdded} (${p.userId})`,
      })),
    ...bans.map((b) => ({
      kind: "ban" as const,
      at: b.createdAt,
      text: `Бан: ${b.userId}${b.reason ? ` (${b.reason})` : ""}`,
    })),
    ...users.map((u) => ({
      kind: "user" as const,
      at: u.startedAt,
      text: `Новый: ${u.username ? `@${u.username}` : u.id}`,
    })),
  ];

  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

// Full lookup of a single user for the operator: profile, owned groups, ban
// status and paid history.
export async function findAdminUser(userId: bigint) {
  const [user, groups, banned, payments] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.group.findMany({
      where: { ownerUserId: userId, removedAt: null },
      select: { chatId: true, title: true, guardEnabled: true },
    }),
    prisma.bannedUser.findUnique({ where: { userId } }),
    prisma.payment.findMany({
      where: { userId, status: "paid" },
      orderBy: { paidAt: "desc" },
      select: { amount: true, currency: true, slotsAdded: true, paidAt: true },
    }),
  ]);
  return { user, groups, banned: Boolean(banned), payments };
}
