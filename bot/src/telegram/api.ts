import { config } from "../config";
import { logger } from "../logger";

const API_ROOT = `https://api.telegram.org/bot${config.botToken}`;

export class TelegramApiError extends Error {
  constructor(
    public method: string,
    public errorCode: number | undefined,
    public description: string | undefined
  ) {
    super(`Telegram ${method} failed: ${errorCode} ${description}`);
    this.name = "TelegramApiError";
  }
}

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
}

// Raw call to any Bot API method. Used both for grammY-covered methods and for
// the newer Join Request Queries methods that the SDK may not expose yet.
export async function callApi<T = unknown>(
  method: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const res = await fetch(`${API_ROOT}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = (await res.json()) as TelegramResponse<T>;
  if (!data.ok) {
    throw new TelegramApiError(method, data.error_code, data.description);
  }
  return data.result as T;
}

// Best-effort variant: never throws, returns null on failure. For non-critical
// side effects such as notifying an applicant who may not have a DM open.
export async function tryCallApi<T = unknown>(
  method: string,
  params: Record<string, unknown> = {}
): Promise<T | null> {
  try {
    return await callApi<T>(method, params);
  } catch (err) {
    logger.warn("telegram call failed", { method, err: String(err) });
    return null;
  }
}

export interface ChatMember {
  status: "creator" | "administrator" | "member" | "restricted" | "left" | "kicked";
  user: { id: number; username?: string; first_name?: string };
  can_invite_users?: boolean;
}

export async function getChatMember(
  chatId: number | bigint | string,
  userId: number | bigint
): Promise<ChatMember> {
  return callApi<ChatMember>("getChatMember", {
    chat_id: typeof chatId === "string" ? chatId : Number(chatId),
    user_id: Number(userId),
  });
}

export interface BotInfo {
  id: number;
  username?: string;
  // Bot API 10.1 capability flag for Join Request Queries.
  supports_join_request_queries?: boolean;
}

export async function getMe(): Promise<BotInfo> {
  return callApi<BotInfo>("getMe");
}

export interface ChatInfo {
  id: number;
  type: string;
  title?: string;
  username?: string;
  // Custom emoji id of the user's emoji status. Returned only via getChat for a
  // private chat (the other party), and only if the bot can resolve that user.
  emoji_status_custom_emoji_id?: string;
  // Bot API 10.1: which bot is assigned as guard bot (admins only).
  guard_bot?: { id: number; username?: string };
}

// Resolve a chat by numeric id or @username, returning id and title.
export async function getChat(chat: string | number): Promise<ChatInfo> {
  return callApi<ChatInfo>("getChat", { chat_id: chat });
}

export async function sendMessage(
  chatId: number | bigint | string,
  text: string,
  replyMarkup?: unknown
): Promise<unknown> {
  return callApi("sendMessage", {
    chat_id: typeof chatId === "string" ? chatId : Number(chatId),
    text,
    reply_markup: replyMarkup,
    disable_web_page_preview: true,
  });
}

// Re-send a voice message by its file_id (used to forward an applicant's voice
// note to the group owner for manual review).
export async function sendVoice(
  chatId: number | bigint,
  fileId: string,
  caption?: string,
  replyMarkup?: unknown
): Promise<unknown> {
  return callApi("sendVoice", {
    chat_id: Number(chatId),
    voice: fileId,
    caption,
    reply_markup: replyMarkup,
  });
}

// Read a user's current emoji status (premium custom emoji), or null if unset
// or unreadable. Only works when the bot can resolve the user via getChat
// (e.g. the user has started the bot).
export async function getEmojiStatus(userId: number | bigint): Promise<string | null> {
  const info = await tryCallApi<ChatInfo>("getChat", { chat_id: Number(userId) });
  return info?.emoji_status_custom_emoji_id ?? null;
}

// ---------------------------------------------------------------------------
// Join request handling. We prefer the query methods and fall back to the
// stable approve/decline methods when the query mode is unavailable.
// ---------------------------------------------------------------------------

export type JoinDecision = "approve" | "decline" | "queue";

// New API: answer a join request query. result = approve | decline | queue.
export async function answerChatJoinRequestQuery(
  queryId: string,
  result: JoinDecision
): Promise<void> {
  await callApi("answerChatJoinRequestQuery", {
    chat_join_request_query_id: queryId,
    result,
  });
}

// New API: show a Mini App to the applicant before deciding.
export async function sendChatJoinRequestWebApp(
  queryId: string,
  webAppUrl: string
): Promise<void> {
  await callApi("sendChatJoinRequestWebApp", {
    chat_join_request_query_id: queryId,
    web_app_url: webAppUrl,
  });
}

// Legacy API: directly approve a pending join request.
export async function approveChatJoinRequest(
  chatId: number | bigint,
  userId: number | bigint
): Promise<void> {
  await callApi("approveChatJoinRequest", {
    chat_id: Number(chatId),
    user_id: Number(userId),
  });
}

// Legacy API: directly decline a pending join request.
export async function declineChatJoinRequest(
  chatId: number | bigint,
  userId: number | bigint
): Promise<void> {
  await callApi("declineChatJoinRequest", {
    chat_id: Number(chatId),
    user_id: Number(userId),
  });
}

// --- member moderation (open-group captcha via restrict-on-join) -----------

const NO_PERMS = {
  can_send_messages: false,
  can_send_audios: false,
  can_send_documents: false,
  can_send_photos: false,
  can_send_videos: false,
  can_send_video_notes: false,
  can_send_voice_notes: false,
  can_send_polls: false,
  can_send_other_messages: false,
  can_add_web_page_previews: false,
};

const FULL_PERMS = {
  can_send_messages: true,
  can_send_audios: true,
  can_send_documents: true,
  can_send_photos: true,
  can_send_videos: true,
  can_send_video_notes: true,
  can_send_voice_notes: true,
  can_send_polls: true,
  can_send_other_messages: true,
  can_add_web_page_previews: true,
};

// Mute a member until they pass screening.
export async function muteMember(chatId: number | bigint, userId: number | bigint): Promise<void> {
  await callApi("restrictChatMember", {
    chat_id: Number(chatId),
    user_id: Number(userId),
    permissions: NO_PERMS,
  });
}

// Lift restrictions after a member passes.
export async function unmuteMember(chatId: number | bigint, userId: number | bigint): Promise<void> {
  await callApi("restrictChatMember", {
    chat_id: Number(chatId),
    user_id: Number(userId),
    permissions: FULL_PERMS,
  });
}

// Remove a member (ban then unban so they can rejoin and retry later).
export async function kickMember(chatId: number | bigint, userId: number | bigint): Promise<void> {
  await callApi("banChatMember", { chat_id: Number(chatId), user_id: Number(userId) });
  await tryCallApi("unbanChatMember", {
    chat_id: Number(chatId),
    user_id: Number(userId),
    only_if_banned: true,
  });
}

export async function deleteMessage(
  chatId: number | bigint,
  messageId: number
): Promise<void> {
  await tryCallApi("deleteMessage", { chat_id: Number(chatId), message_id: messageId });
}

export async function setWebhook(url: string, secretToken: string): Promise<void> {
  await callApi("setWebhook", {
    url,
    secret_token: secretToken,
    allowed_updates: [
      "message",
      "callback_query",
      "chat_join_request",
      "my_chat_member",
    ],
    drop_pending_updates: false,
  });
}
