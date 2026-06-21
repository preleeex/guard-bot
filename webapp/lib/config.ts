// Public, non-secret config for the Mini App.
export const BOT_USERNAME = process.env.NEXT_PUBLIC_BOT_USERNAME ?? "SpaceToBanBot";

// Deep link that opens Telegram's "add bot to a group" picker.
export const ADD_TO_GROUP_LINK = `https://t.me/${BOT_USERNAME}?startgroup=true`;
