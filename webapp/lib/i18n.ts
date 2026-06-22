// Mini App i18n. The language is resolved from (1) the user's explicit choice
// saved in localStorage / on the server, then (2) the Telegram client language,
// defaulting to Russian. Add a language by extending `Lang` and every dict entry.
import { getLanguage } from "./telegram";

export type Lang = "ru" | "en";

const STORAGE_KEY = "ui_lang";
let current: Lang | null = null;

function fromStorage(): Lang | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "ru" || v === "en" ? v : null;
}

export function getLang(): Lang {
  if (current) return current;
  const stored = fromStorage();
  if (stored) {
    current = stored;
    return stored;
  }
  return getLanguage().toLowerCase().startsWith("en") ? "en" : "ru";
}

// Set the active language and persist it locally. Callers also persist it to the
// backend and reload so the whole tree re-renders in the new language.
export function setLang(lang: Lang): void {
  current = lang;
  if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, lang);
}

// Initialize from a server-provided preference (e.g. /api/owner/home) if the
// user has not made a local choice yet.
export function initLang(serverLang?: string | null): void {
  if (fromStorage()) return;
  if (serverLang === "ru" || serverLang === "en") current = serverLang;
}

const dict = {
  // --- applicant: screening flow ---
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
  // --- reason / banned screens ---
  banned_title: { ru: "Вы заблокированы", en: "You are blocked" },
  banned_text: {
    ru: "Доступ к боту ограничен. Если это ошибка, обратитесь к администратору.",
    en: "Your access to the bot is restricted. If this is a mistake, contact the administrator.",
  },
  reason_emoji_title: { ru: "Нужен эмодзи-статус", en: "Emoji status required" },
  reason_emoji_text: {
    ru: "Для вступления установите нужный эмодзи-статус в профиле Telegram и подайте заявку снова.",
    en: "To join, set the required emoji status in your Telegram profile and request to join again.",
  },
  reason_generic_title: { ru: "Вступление недоступно", en: "Joining unavailable" },
  reason_generic_text: {
    ru: "Сейчас вступить не получится. Проверьте требования и попробуйте позже.",
    en: "You cannot join right now. Check the requirements and try again later.",
  },
  // --- owner: checklist ---
  checklist_title: { ru: "Готовность группы", en: "Group readiness" },
  check_run: { ru: "Проверить настройку", en: "Check setup" },
  check_ok: { ru: "ОК", en: "OK" },
  check_bad: { ru: "Нет", en: "No" },
  check_all_ok: { ru: "Всё готово. Guard работает.", en: "All set. Guard is working." },
  "check_bot_admin": { ru: "Бот администратор группы", en: "Bot is a group admin" },
  "check_can_approve": { ru: "Может одобрять заявки", en: "Can approve join requests" },
  "check_not_anonymous": { ru: "Бот не анонимный админ", en: "Bot is not an anonymous admin" },
  "check_join_by_request": { ru: "Включён приём заявок", en: "Join requests are enabled" },
  "check_guard_bot": { ru: "Бот назначен guard-ботом", en: "Bot is set as guard bot" },
  "check_scenario": { ru: "Сценарий не пустой", en: "Scenario is not empty" },
  "check_guard_enabled": { ru: "Guard включён", en: "Guard is enabled" },
  "fix_bot_admin": {
    ru: "Сделайте бота администратором группы.",
    en: "Make the bot an administrator of the group.",
  },
  "fix_can_approve": {
    ru: "Дайте боту право добавлять участников (одобрять заявки).",
    en: "Grant the bot permission to add members (approve requests).",
  },
  "fix_not_anonymous": {
    ru: "Отключите анонимность у бота-админа, иначе guard не работает.",
    en: "Disable anonymous mode for the bot admin, otherwise guard will not work.",
  },
  "fix_join_by_request": {
    ru: "Включите в группе «Заявки на вступление».",
    en: "Enable join requests in the group settings.",
  },
  "fix_guard_bot": {
    ru: "Назначьте этого бота guard-ботом в настройках вступления (в приложении Telegram). Назначение сбрасывается при правке прав бота.",
    en: "Assign this bot as the guard bot in the join settings (in the Telegram app). The assignment resets whenever the bot's rights are edited.",
  },
  "fix_scenario": { ru: "Добавьте хотя бы один блок в сценарий.", en: "Add at least one scenario block." },
  "fix_guard_enabled": { ru: "Включите Guard mode выше.", en: "Enable Guard mode above." },
  // --- owner: queue ---
  queue_title: { ru: "Очередь", en: "Queue" },
  queue_empty: { ru: "Очередь пуста.", en: "The queue is empty." },
  queue_voice: { ru: "Голосовое", en: "Voice" },
  queue_pending: { ru: "Заявка", en: "Request" },
  accept: { ru: "Принять", en: "Accept" },
  reject: { ru: "Отклонить", en: "Reject" },
  // --- owner: welcome ---
  welcome_title: { ru: "Приветствие после одобрения", en: "Welcome after approval" },
  welcome_text_ph: {
    ru: "Текст приветствия. {name} подставит имя нового участника.",
    en: "Welcome text. {name} inserts the new member's name.",
  },
  welcome_delete_ph: { ru: "Автоудаление через, сек (пусто = не удалять)", en: "Auto-delete after, sec (empty = keep)" },
  // --- owner: analytics ---
  stats_title: { ru: "Статистика", en: "Statistics" },
  period_today: { ru: "Сегодня", en: "Today" },
  period_7d: { ru: "7 дней", en: "7 days" },
  period_all: { ru: "Всё время", en: "All time" },
  stat_total: { ru: "Всего заявок", en: "Total requests" },
  stat_approve: { ru: "Прошло", en: "Passed" },
  stat_decline: { ru: "Не прошло", en: "Failed" },
  stat_queue: { ru: "В очереди", en: "In queue" },
  stat_timeout: { ru: "Таймаут", en: "Timeout" },
  stat_conversion: { ru: "Конверсия", en: "Conversion" },
  // --- owner: group bans ---
  groupban_title: { ru: "Баны в группе", en: "Group bans" },
  groupban_empty: { ru: "Список пуст.", en: "The list is empty." },
  groupban_in_group: { ru: "Забанить в группе", en: "Ban in group" },
  unban: { ru: "Разбанить", en: "Unban" },
  // --- owner: templates ---
  templates_title: { ru: "Шаблоны", en: "Templates" },
  tpl_simple: { ru: "Простая капча", en: "Simple captcha" },
  tpl_captcha_rules: { ru: "Капча + правила", en: "Captcha + rules" },
  tpl_quiz3: { ru: "Квиз 3 вопроса", en: "Quiz 3 questions" },
  tpl_max: { ru: "Антибот максимум", en: "Max anti-bot" },
  tpl_replace_confirm: {
    ru: "Заменить текущий сценарий шаблоном?",
    en: "Replace the current scenario with the template?",
  },
  // --- owner: language ---
  language: { ru: "Язык", en: "Language" },
} as const;

export type I18nKey = keyof typeof dict;

export function t(key: I18nKey): string {
  return dict[key][getLang()];
}

// Translate a dynamic key that may not exist (e.g. checklist keys from the API);
// falls back to the key itself.
export function tDyn(key: string): string {
  const entry = (dict as Record<string, { ru: string; en: string }>)[key];
  return entry ? entry[getLang()] : key;
}
