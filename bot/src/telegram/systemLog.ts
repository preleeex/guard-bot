import { config } from "../config";
import { logger } from "../logger";
import { tryCallApi } from "./api";

// System/business events only. Never per-applicant screening data.
// Messages are minimal, no emoji, no em dash, per the spec style rules.
export type SystemEvent =
  | { kind: "group_connected"; title?: string; chatId: bigint; ownerUserId: bigint }
  | { kind: "group_removed"; title?: string; chatId: bigint }
  | { kind: "user_started"; userId: bigint; username?: string | null }
  | { kind: "payment"; userId: bigint; amount: string; currency: string; slots: number }
  | { kind: "manual_slots"; targetUserId: bigint; slots: number; byUserId: bigint }
  | { kind: "critical_error"; context: string; detail: string };

function format(event: SystemEvent): string {
  switch (event.kind) {
    case "group_connected":
      return `Группа подключена\nНазвание: ${event.title ?? "(без названия)"}\nchat_id: ${event.chatId}\nowner_user_id: ${event.ownerUserId}`;
    case "group_removed":
      return `Бот удалён из группы\nНазвание: ${event.title ?? "(без названия)"}\nchat_id: ${event.chatId}`;
    case "user_started":
      return `Новый пользователь\nuser_id: ${event.userId}\nusername: ${event.username ?? "(нет)"}`;
    case "payment":
      return `Оплата\nuser_id: ${event.userId}\nсумма: ${event.amount} ${event.currency}\nслотов добавлено: ${event.slots}`;
    case "manual_slots":
      return `Ручная выдача слотов\nкому user_id: ${event.targetUserId}\nслотов: ${event.slots}\nкем: ${event.byUserId}`;
    case "critical_error":
      return `Критичная ошибка\nконтекст: ${event.context}\n${event.detail}`;
  }
}

export async function sendSystemLog(event: SystemEvent): Promise<void> {
  const text = format(event);
  const result = await tryCallApi("sendMessage", {
    chat_id: config.systemLogChatId,
    text,
    disable_web_page_preview: true,
  });
  if (result === null) {
    logger.error("failed to deliver system log", { event: event.kind });
  }
}
