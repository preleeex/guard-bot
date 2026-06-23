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
    ru: "Доступ к боту ограничен. Если это ошибка, подайте апелляцию.",
    en: "Your access to the bot is restricted. If this is a mistake, submit an appeal.",
  },
  appeal_open: { ru: "Подать апелляцию", en: "Submit appeal" },
  appeal_form_title: { ru: "Апелляция", en: "Appeal" },
  appeal_form_hint: {
    ru: "Опишите ситуацию и при необходимости приложите скриншот.",
    en: "Describe what happened and attach a screenshot if needed.",
  },
  appeal_text_ph: {
    ru: "Почему доступ должен быть восстановлен?",
    en: "Why should your access be restored?",
  },
  appeal_add_photo: { ru: "Добавить фото", en: "Add photo" },
  appeal_remove_photo: { ru: "Убрать фото", en: "Remove photo" },
  appeal_submit: { ru: "Отправить", en: "Send" },
  appeal_pending: {
    ru: "Апелляция на рассмотрении. Ожидайте решения.",
    en: "Your appeal is under review. Please wait for a decision.",
  },
  appeal_rejected: {
    ru: "Апелляция отклонена. Повторно подать нельзя.",
    en: "Your appeal was rejected. You cannot submit another one.",
  },
  appeal_approved: {
    ru: "Апелляция одобрена. Перезапустите Mini App.",
    en: "Your appeal was approved. Restart the Mini App.",
  },
  appeal_ban_reason: { ru: "Причина бана", en: "Ban reason" },
  appeal_load_failed: { ru: "Не удалось загрузить статус.", en: "Could not load status." },
  appeal_submit_failed: { ru: "Не удалось отправить.", en: "Could not submit." },
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
  // --- owner: scenario builder ---
  b_captcha: { ru: "Капча", en: "Captcha" },
  b_quiz: { ru: "Квиз", en: "Quiz" },
  b_rules: { ru: "Правила", en: "Rules" },
  cap_type: { ru: "Тип капчи", en: "Captcha type" },
  cap_math: { ru: "Математическая", en: "Math" },
  cap_visual: { ru: "Визуальная (код)", en: "Visual (code)" },
  cap_button: { ru: "Кнопочная", en: "Button" },
  cap_btn_ph: { ru: "Текст кнопки (по умолчанию: Я не робот)", en: "Button label (default: I am not a robot)" },
  quiz_need: { ru: "Сколько верных нужно", en: "Correct answers required" },
  quiz_qtext_ph: { ru: "Текст вопроса", en: "Question text" },
  quiz_option: { ru: "Вариант", en: "Option" },
  quiz_photo_q: { ru: "Фото вопроса", en: "Question photo" },
  quiz_add_opt: { ru: "Вариант", en: "Option" },
  quiz_add_q: { ru: "Вопрос", en: "Question" },
  quiz_del_q: { ru: "Удалить вопрос", en: "Delete question" },
  quiz_correct: { ru: "Верный ответ", en: "Correct answer" },
  quiz_no_correct: {
    ru: "В каждом вопросе отметьте хотя бы один верный ответ.",
    en: "Mark at least one correct answer in every question.",
  },
  rules_text_ph: { ru: "Текст правил", en: "Rules text" },
  rules_agree_ph: { ru: "Текст кнопки согласия (по умолчанию: Согласен)", en: "Agree button text (default: I agree)" },
  img_s: { ru: "Размер: маленькое", en: "Size: small" },
  img_m: { ru: "Размер: среднее", en: "Size: medium" },
  img_l: { ru: "Размер: большое", en: "Size: large" },
  optimg_s: { ru: "Фото вариантов: маленькое", en: "Option photos: small" },
  optimg_m: { ru: "Фото вариантов: среднее", en: "Option photos: medium" },
  optimg_l: { ru: "Фото вариантов: большое", en: "Option photos: large" },
  remove: { ru: "Убрать", en: "Remove" },
  aria_up: { ru: "Вверх", en: "Up" },
  aria_down: { ru: "Вниз", en: "Down" },
  aria_delete: { ru: "Удалить", en: "Delete" },
  // --- owner: navigation + billing + group tabs ---
  nav_groups: { ru: "Группы", en: "Groups" },
  nav_billing: { ru: "Тариф", en: "Plan" },
  nav_help: { ru: "Помощь", en: "Help" },
  nav_admin: { ru: "Админ", en: "Admin" },
  plan_your: { ru: "Ваш тариф", en: "Your plan" },
  plan_change: { ru: "Поменять план", en: "Change plan" },
  plan_check: { ru: "Проверить оплату", en: "Check payment" },
  plan_best: { ru: "выгоднее всего", en: "best value" },
  plan_small: { ru: "+5 групп", en: "+5 groups" },
  plan_big: { ru: "+15 групп", en: "+15 groups" },
  plan_unlimited: { ru: "Безлимит", en: "Unlimited" },
  perk_5groups: { ru: "5 дополнительных групп", en: "5 extra groups" },
  perk_15groups: { ru: "15 дополнительных групп", en: "15 extra groups" },
  perk_unlim_groups: { ru: "Группы без лимита", en: "Unlimited groups" },
  perk_support_basic: { ru: "Базовая поддержка", en: "Basic support" },
  perk_priority_load: { ru: "Приоритетная загрузка", en: "Priority loading" },
  perk_support_chat: { ru: "Поддержка в чате", en: "Chat support" },
  perk_priority_max: { ru: "Максимальный приоритет", en: "Maximum priority" },
  perk_support_24: { ru: "Поддержка 24/7", en: "24/7 support" },
  gd_scenario: { ru: "Сценарий", en: "Scenario" },
  gd_settings: { ru: "Настройки", en: "Settings" },
  gd_journal: { ru: "Журнал", en: "Journal" },
  guard_mode: { ru: "Guard mode", en: "Guard mode" },
  go_to_group: { ru: "Перейти в группу", en: "Open the group" },
  dec_approve: { ru: "Одобрено", en: "Approved" },
  dec_decline: { ru: "Отклонено", en: "Declined" },
  dec_queue: { ru: "Очередь", en: "Queue" },
  dec_timeout: { ru: "Таймаут", en: "Timeout" },
  save: { ru: "Сохранить", en: "Save" },
  saved: { ru: "Сохранено.", en: "Saved." },
  save_error: { ru: "Ошибка сохранения.", en: "Save error." },
  // --- owner: language ---
  language: { ru: "Язык", en: "Language" },
  // --- owner: group setup guide ---
  setup_title: { ru: "Настройка группы", en: "Group setup" },
  setup_intro: {
    ru: "Чтобы проверка при вступлении работала, выполните 4 шага в самой группе:",
    en: "For join screening to work, do these 4 steps in the group itself:",
  },
  setup_step_join: {
    ru: "Включите «Заявки на вступление». Управление группой, Тип группы, пункт про вступление по заявке.",
    en: "Enable join requests. Manage group, Group type, the join-by-request option.",
  },
  setup_step_admin: {
    ru: "Сделайте бота администратором с правом «Добавлять участников» и отключите у него анонимность.",
    en: "Make the bot an admin with the Add members right and turn off its anonymity.",
  },
  setup_step_guard: {
    ru: "Назначьте бота guard-ботом в настройках вступления (делается в приложении Telegram).",
    en: "Assign the bot as the guard bot in the join settings (done in the Telegram app).",
  },
  setup_step_scenario: {
    ru: "Соберите сценарий и включите Guard mode в карточке группы.",
    en: "Build a scenario and turn on Guard mode in the group card.",
  },
  setup_note_guard: {
    ru: "Важно: назначение guard-бота сбрасывается при любой правке прав бота. Если перестало работать, переназначьте заново.",
    en: "Note: the guard bot assignment resets whenever the bot's rights are edited. If it stops working, assign it again.",
  },
  setup_note_check: {
    ru: "Проверить всё сразу можно кнопкой «Проверить настройку» в карточке группы.",
    en: "Verify everything at once with the Check setup button in the group card.",
  },
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
