import { prisma } from "../db";
import { config, FREE_GROUP_SLOTS, isBotOwner } from "../config";

export interface QuotaStatus {
  unlimited: boolean;
  usedGroups: number;
  freeSlots: number; // base free slots
  manualExtraSlots: number; // granted by operator
  paidSlots: number; // from paid bundles
  totalSlots: number; // free + manual + paid
  remaining: number; // totalSlots - usedGroups (>= 0), Infinity if unlimited
}

// Count active groups bound to this owner (removed groups do not occupy a slot).
async function countOwnedGroups(ownerUserId: bigint): Promise<number> {
  return prisma.group.count({
    where: { ownerUserId, removedAt: null },
  });
}

async function countPaidSlots(userId: bigint): Promise<number> {
  const paid = await prisma.payment.findMany({
    where: { userId, status: "paid" },
    select: { slotsAdded: true },
  });
  return paid.reduce((sum, p) => sum + p.slotsAdded, 0);
}

export async function getQuota(userId: bigint): Promise<QuotaStatus> {
  const usedGroups = await countOwnedGroups(userId);

  if (isBotOwner(userId)) {
    return {
      unlimited: true,
      usedGroups,
      freeSlots: FREE_GROUP_SLOTS,
      manualExtraSlots: 0,
      paidSlots: 0,
      totalSlots: Number.POSITIVE_INFINITY,
      remaining: Number.POSITIVE_INFINITY,
    };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const manualExtraSlots = user?.manualExtraSlots ?? 0;
  const paidSlots = await countPaidSlots(userId);
  const totalSlots = FREE_GROUP_SLOTS + manualExtraSlots + paidSlots;

  return {
    unlimited: false,
    usedGroups,
    freeSlots: FREE_GROUP_SLOTS,
    manualExtraSlots,
    paidSlots,
    totalSlots,
    remaining: Math.max(0, totalSlots - usedGroups),
  };
}

// Whether the owner can connect one more group right now.
export async function canAddGroup(userId: bigint): Promise<boolean> {
  if (isBotOwner(userId)) return true;
  const quota = await getQuota(userId);
  return quota.remaining > 0;
}

export { config };
