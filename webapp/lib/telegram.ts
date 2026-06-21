// Thin wrapper around the Telegram WebApp JS API.

export interface TelegramThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
  section_bg_color?: string;
  header_bg_color?: string;
  destructive_text_color?: string;
}

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: { id: number; username?: string; first_name?: string };
    start_param?: string;
  };
  themeParams: TelegramThemeParams;
  colorScheme: "light" | "dark";
  ready: () => void;
  expand: () => void;
  close: () => void;
  MainButton: {
    setText: (t: string) => void;
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
    showProgress: (leaveActive?: boolean) => void;
    hideProgress: () => void;
    enable: () => void;
    disable: () => void;
  };
  onEvent: (event: string, cb: () => void) => void;
  openLink: (url: string) => void;
  openTelegramLink: (url: string) => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function getWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

export function getInitData(): string {
  return getWebApp()?.initData ?? "";
}

export interface TgProfile {
  id: number;
  firstName?: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
}

// Real Telegram profile (name, @username, avatar) from the validated initData.
export function getProfile(): TgProfile | null {
  const u = getWebApp()?.initDataUnsafe?.user as unknown as
    | { id: number; username?: string; first_name?: string; last_name?: string; photo_url?: string }
    | undefined;
  if (!u) return null;
  return {
    id: u.id,
    firstName: u.first_name,
    lastName: u.last_name,
    username: u.username,
    photoUrl: u.photo_url,
  };
}

// The app must be opened inside Telegram: a real WebApp context provides a
// non-empty initData. In a plain browser it is empty.
export function isInTelegram(): boolean {
  return getInitData().length > 0;
}

// Open a payment/invoice URL. Telegram (t.me) links use openTelegramLink so the
// Mini App can hand off without leaving Telegram.
export function openExternal(url: string): void {
  if (!url) return;
  const wa = getWebApp();
  const isTelegram = /(^https?:\/\/)?t\.me\//.test(url);
  if (wa && isTelegram) wa.openTelegramLink(url);
  else if (wa) wa.openLink(url);
  else window.open(url, "_blank");
}

// Map Telegram theme params onto CSS variables so the UI follows light/dark.
export function applyTheme(): void {
  const wa = getWebApp();
  if (!wa) return;
  const t = wa.themeParams;
  const root = document.documentElement;
  const set = (name: string, value?: string) => {
    if (value) root.style.setProperty(name, value);
  };
  set("--tg-bg", t.bg_color);
  set("--tg-text", t.text_color);
  set("--tg-hint", t.hint_color);
  set("--tg-link", t.link_color);
  set("--tg-button", t.button_color);
  set("--tg-button-text", t.button_text_color);
  set("--tg-secondary-bg", t.secondary_bg_color);
  set("--tg-section-bg", t.section_bg_color ?? t.bg_color);
  set("--tg-destructive", t.destructive_text_color);
  root.dataset.scheme = wa.colorScheme;
}
