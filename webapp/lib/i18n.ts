// Minimal applicant-facing i18n. Picks English for English Telegram clients,
// Russian otherwise. Only the applicant screening flow is translated; the owner
// panel stays in Russian.
import { getLanguage } from "./telegram";

type Lang = "ru" | "en";

const dict = {
  loading: { ru: "Проверка", en: "Verification" },
  unavailable_title: { ru: "Проверка недоступна", en: "Verification unavailable" },
  load_failed: { ru: "Не удалось загрузить проверку.", en: "Could not load the verification." },
  closes_auto: { ru: "Окно закроется автоматически.", en: "This window will close automatically." },
  approve: { ru: "Заявка одобрена.", en: "Request approved." },
  decline: { ru: "Заявка отклонена.", en: "Request declined." },
  queue: { ru: "Заявка отправлена на ручную проверку.", en: "Request sent for manual review." },
  done: { ru: "Проверка завершена.", en: "Verification complete." },
  time_up: { ru: "Время вышло.", en: "Time is up." },
  send_error: { ru: "Ошибка отправки.", en: "Submit error." },
  sub_title: { ru: "Подпишись на канал", en: "Subscribe to the channel" },
  sub_text: {
    ru: "Чтобы вступить, подпишись на канал и нажми «Проверить».",
    en: "To join, subscribe to the channel and tap Check.",
  },
  open_channel: { ru: "Открыть канал", en: "Open channel" },
  check: { ru: "Проверить", en: "Check" },
  confirm_join: { ru: "Подтверждение вступления", en: "Confirm joining" },
  continue: { ru: "Продолжить", en: "Continue" },
  step: { ru: "Шаг", en: "Step" },
  of: { ru: "из", en: "of" },
  next: { ru: "Далее", en: "Next" },
  finish: { ru: "Завершить", en: "Finish" },
  back: { ru: "Назад", en: "Back" },
  voice_title: { ru: "Голосовая проверка", en: "Voice verification" },
  voice_default_prompt: {
    ru: "Запишите голосовое сообщение, чтобы вступить в группу.",
    en: "Record a voice message to join the group.",
  },
  voice_open_bot: { ru: "Открыть бота и записать", en: "Open the bot and record" },
  voice_hint: {
    ru: "Откроется чат с ботом. Запишите там голосовое сообщение и ждите решения.",
    en: "The bot chat opens. Record a voice message there and wait for a decision.",
  },
} as const;

export type I18nKey = keyof typeof dict;

export function getLang(): Lang {
  return getLanguage().toLowerCase().startsWith("en") ? "en" : "ru";
}

export function t(key: I18nKey): string {
  const lang = getLang();
  return dict[key][lang];
}
