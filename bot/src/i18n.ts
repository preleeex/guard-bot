// Bot-side i18n. Applicant-facing messages use the applicant's Telegram client
// language; owner-facing DMs use the owner's stored/inferred language. Add a new
// language by extending `Lang` and every entry in `dict`.

export type Lang = "ru" | "en";

// Normalize a Telegram language_code (e.g. "en-US") or stored preference to a
// supported language, defaulting to Russian.
export function normalizeLang(code?: string | null): Lang {
  return (code ?? "").toLowerCase().startsWith("en") ? "en" : "ru";
}

type Entry = Record<Lang, string>;

const dict = {
  // --- applicant: voice screening ---
  voice_default_prompt: {
    ru: "Запишите голосовое сообщение, чтобы вступить в группу.",
    en: "Record a voice message to join the group.",
  },
  voice_send_here: {
    ru: "Отправьте голосовое сообщение сюда, в этот чат.",
    en: "Send a voice message here, in this chat.",
  },
  voice_sent_wait: {
    ru: "Голосовое отправлено на проверку. Ожидайте решения.",
    en: "Voice message sent for review. Please wait for a decision.",
  },
  voice_deliver_failed: {
    ru: "Не удалось отправить владельцу. Попробуйте позже.",
    en: "Could not deliver to the owner. Try again later.",
  },
  voice_time_up: { ru: "Время на проверку истекло.", en: "The verification time is up." },
  check_not_found: {
    ru: "Проверка не найдена или уже завершена.",
    en: "Verification not found or already finished.",
  },
  // --- applicant: gates ---
  emoji_required: {
    ru: "Для вступления нужен определённый эмодзи-статус. Установите его в профиле и подайте заявку снова.",
    en: "A specific emoji status is required to join. Set it in your profile and request to join again.",
  },
  // --- applicant: decision DMs ---
  request_approved: { ru: "Заявка одобрена.", en: "Request approved." },
  request_declined: { ru: "Заявка отклонена.", en: "Request declined." },
  // --- applicant: start / panel ---
  maintenance: {
    ru: "Идут технические работы. Загляни немного позже.",
    en: "Maintenance in progress. Please check back a bit later.",
  },
  verify_to_join: { ru: "Проверка для вступления в группу.", en: "Verification to join the group." },
  pass_verification: { ru: "Пройти проверку", en: "Start verification" },
  // --- owner: guard nudge ---
  guard_nudge: {
    ru:
      "Guard-бот в группе \"{title}\" слетел. Назначьте бота guard-ботом заново: настройки группы, раздел вступления, выбрать этого бота. Без этого проверка при вступлении не сработает.",
    en:
      'The guard bot in "{title}" was unassigned. Re-assign this bot as the guard bot in the group join settings, otherwise screening on join will not work.',
  },
  // --- owner: decision labels ---
  label_approve: { ru: "Прошёл", en: "Passed" },
  label_decline: { ru: "Не прошёл", en: "Failed" },
  label_queue: { ru: "Очередь", en: "Queue" },
  label_timeout: { ru: "Таймаут", en: "Timeout" },
} satisfies Record<string, Entry>;

export type I18nKey = keyof typeof dict;

export function t(lang: Lang | string | null | undefined, key: I18nKey, params?: Record<string, string>): string {
  const l = typeof lang === "string" && (lang === "ru" || lang === "en") ? lang : normalizeLang(lang);
  let text = dict[key][l];
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), v);
    }
  }
  return text;
}
