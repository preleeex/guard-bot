import { prisma } from "../db";

// Aggregate statistics for the operator admin view.
export async function getGlobalStats() {
  const [owners, totalGroups, activeGroups, users, paidPayments] = await Promise.all([
    prisma.group.findMany({ where: { removedAt: null }, distinct: ["ownerUserId"], select: { ownerUserId: true } }),
    prisma.group.count(),
    prisma.group.count({ where: { removedAt: null } }),
    prisma.user.count(),
    prisma.payment.findMany({ where: { status: "paid" }, select: { slotsAdded: true, amount: true, currency: true } }),
  ]);

  const paidSlots = paidPayments.reduce((s, p) => s + p.slotsAdded, 0);
  const revenueByCurrency: Record<string, number> = {};
  for (const p of paidPayments) {
    revenueByCurrency[p.currency] = (revenueByCurrency[p.currency] ?? 0) + Number(p.amount);
  }

  return {
    owners: owners.length,
    users,
    totalGroups,
    activeGroups,
    paidBundles: paidPayments.length,
    paidSlots,
    revenueByCurrency,
  };
}
