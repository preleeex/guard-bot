import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { assertOwnerOf } from "./groups";

export async function addJournalEntry(entry: {
  chatId: bigint;
  applicantUserId: bigint;
  applicantUsername?: string | null;
  applicantName?: string | null;
  decision: string;
  reason?: string;
  score?: number | null;
  answers: unknown;
  startedAt: Date;
}) {
  return prisma.journalEntry.create({
    data: {
      chatId: entry.chatId,
      applicantUserId: entry.applicantUserId,
      applicantUsername: entry.applicantUsername ?? null,
      applicantName: entry.applicantName ?? null,
      decision: entry.decision,
      reason: entry.reason ?? null,
      score: entry.score ?? null,
      answers: (entry.answers ?? []) as Prisma.InputJsonValue,
      startedAt: entry.startedAt,
    },
  });
}

// Owner-scoped journal listing for the Mini App "Journal" section.
export async function listJournal(
  chatId: bigint,
  ownerUserId: bigint,
  opts: { limit?: number; cursor?: string } = {}
) {
  await assertOwnerOf(chatId, ownerUserId);
  const limit = Math.min(opts.limit ?? 50, 100);
  return prisma.journalEntry.findMany({
    where: { chatId },
    orderBy: { finishedAt: "desc" },
    take: limit,
    ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
  });
}
