// Minimal structured logger. Critical errors are also mirrored to the Telegram
// system log group by callers that import sendSystemLog.

type Level = "debug" | "info" | "warn" | "error";

function log(level: Level, message: string, meta?: unknown): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(meta !== undefined ? { meta } : {}),
  };
  const serialized = JSON.stringify(line, (_k, v) =>
    typeof v === "bigint" ? v.toString() : v
  );
  if (level === "error") {
    console.error(serialized);
  } else {
    console.log(serialized);
  }
}

export const logger = {
  debug: (m: string, meta?: unknown) => log("debug", m, meta),
  info: (m: string, meta?: unknown) => log("info", m, meta),
  warn: (m: string, meta?: unknown) => log("warn", m, meta),
  error: (m: string, meta?: unknown) => log("error", m, meta),
};
