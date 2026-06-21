// Public, non-secret config for the Mini App.
export const BOT_USERNAME = process.env.NEXT_PUBLIC_BOT_USERNAME ?? "SpaceToBanBot";

// Deep link that opens Telegram's "add bot to a group" picker and pre-selects
// the admin rights the guard bot needs, so it is promoted in one step.
const ADMIN_RIGHTS = [
  "invite_users",
  "restrict_members",
  "delete_messages",
  "promote_members",
  "pin_messages",
].join("+");
export const ADD_TO_GROUP_LINK = `https://t.me/${BOT_USERNAME}?startgroup&admin=${ADMIN_RIGHTS}`;
