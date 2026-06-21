import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { assertOwnerOf } from "./groups";
import type { ScenarioBlockDTO } from "../types/scenario";

// Read the ordered scenario blocks for a group (no owner check; used by both
// the owner panel and the applicant screening which validates separately).
export async function getScenario(chatId: bigint): Promise<ScenarioBlockDTO[]> {
  const blocks = await prisma.scenarioBlock.findMany({
    where: { chatId },
    orderBy: { order: "asc" },
  });
  return blocks.map((b) => ({
    id: b.id,
    order: b.order,
    type: b.type,
    config: b.config as unknown as ScenarioBlockDTO["config"],
  }));
}

// Replace the whole scenario for a group in one transaction. The Mini App
// builder sends the full ordered list, which keeps reorder/delete/add trivial.
export async function saveScenario(
  chatId: bigint,
  userId: bigint,
  blocks: Array<{ type: string; config: unknown }>
): Promise<ScenarioBlockDTO[]> {
  await assertOwnerOf(chatId, userId);

  await prisma.$transaction(async (tx) => {
    await tx.scenarioBlock.deleteMany({ where: { chatId } });
    if (blocks.length > 0) {
      await tx.scenarioBlock.createMany({
        data: blocks.map((b, index) => ({
          chatId,
          order: index,
          type: b.type,
          config: (b.config ?? {}) as Prisma.InputJsonValue,
        })),
      });
    }
  });

  return getScenario(chatId);
}
