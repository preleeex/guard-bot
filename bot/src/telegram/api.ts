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
  chatId: number | bigint,
  userId: number | bigint
): Promise<ChatMember> {
  return callApi<ChatMember>("getChatMember", {
    chat_id: Number(chatId),
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
