import { Bot, InputFile, GrammyError, type Context } from "grammy";
import { config, isBotOwner } from "../config";
import { prisma } from "../db";
import { logger } from "../logger";
import { callApi } from "./api";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Operator-only, private-chat-only guard.
function opGuard(ctx: Context): boolean {
  return ctx.chat?.type === "private" && Boolean(ctx.from) && isBotOwner(ctx.from!.id);
}

// Download a Telegram file (by file_id) into a Buffer.
async function downloadFile(fileId: string): Promise<Buffer> {
  const file = await callApi<{ file_path?: string }>("getFile", { file_id: fileId });
  if (!file.file_path) throw new Error("file_path missing");
  const url = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
  const res = await fetch(url);
  return Buffer.from(await res.arrayBuffer());
}

function groupLink(chatId: bigint): string {
  const s = chatId.toString();
  return s.startsWith("-100") ? `https://t.me/c/${s.slice(4)}` : "";
}

export function registerAdminCommands(bot: Bot): void {
  // --- /dc : broadcast to every user ---------------------------------------
  bot.command("dc", async (ctx) => {
    if (!opGuard(ctx)) return;
    const text = (ctx.match ?? "").toString().trim();
    const reply = ctx.message?.reply_to_message;
    if (!text && !reply) {
      await ctx.reply("Использование: /dc текст, или ответом (reply) на сообщение -> /dc");
      return;
    }

    const users = await prisma.user.findMany({ select: { id: true } });
    const total = users.length;
    const status = await ctx.reply(`Рассылка: 0/${total}`);
    let sent = 0;
    let errors = 0;
    let removed = 0;

    const deliver = async (uid: number) => {
      if (reply) await ctx.api.copyMessage(uid, ctx.chat.id, reply.message_id);
      else await ctx.api.sendMessage(uid, text);
    };

    for (let i = 0; i < users.length; i++) {
      const uid = Number(users[i].id);
      try {
        await deliver(uid);
        sent += 1;
      } catch (err) {
        const ge = err as GrammyError;
        if (ge?.error_code === 429) {
          const wait = ge.parameters?.retry_after ?? 1;
          await sleep(wait * 1000);
          try {
            await deliver(uid);
            sent += 1;
          } catch {
            errors += 1;
          }
        } else if (ge?.error_code === 403) {
          const ok = await prisma.user
            .delete({ where: { id: users[i].id } })
            .then(() => true)
            .catch(() => false);
          if (ok) removed += 1;
          else errors += 1;
        } else {
          errors += 1;
        }
      }
      if ((i + 1) % 25 === 0) {
        await ctx.api
          .editMessageText(ctx.chat.id, status.message_id, `Рассылка: ${i + 1}/${total}`)
          .catch(() => undefined);
      }
      await sleep(40);
    }

    await ctx.api
      .editMessageText(
        ctx.chat.id,
        status.message_id,
        `Готово.\nОтправлено: ${sent}\nОшибок: ${errors}\nУдалено заблокировавших: ${removed}`
      )
      .catch(() => undefined);
  });

  // --- /dg : dump / export -------------------------------------------------
  bot.command("dg", async (ctx) => {
    if (!opGuard(ctx)) return;
    const sub = (ctx.match ?? "").toString().trim().toLowerCase();

    if (sub === "info") {
      const [users, banned, groups, paid] = await Promise.all([
        prisma.user.count(),
        prisma.bannedUser.count(),
        prisma.group.count({ where: { removedAt: null } }),
        prisma.payment.count({ where: { status: "paid" } }),
      ]);
      await ctx.reply(
        `Сводка:\nusers: ${users}\nbanned: ${banned}\ngroups: ${groups}\npaid: ${paid}\n\n` +
          `Подкоманды: /dg, /dg info, /dg users, /dg banned, /dg groups, /dg purge`
      );
      return;
    }

    if (sub === "users" || sub === "u") {
      const users = await prisma.user.findMany({ select: { id: true }, take: 200 });
      await ctx.reply(`Users (первые 200):\n${users.map((u) => u.id.toString()).join("\n") || "(пусто)"}`);
      return;
    }

    if (sub === "banned" || sub === "b") {
      const banned = await prisma.bannedUser.findMany({ take: 200 });
      await ctx.reply(
        `Banned:\n${banned.map((b) => `${b.userId}${b.reason ? ` (${b.reason})` : ""}`).join("\n") || "(пусто)"}`
      );
      return;
    }

    if (sub === "groups" || sub === "gr") {
      const groups = await prisma.group.findMany({ take: 200 });
      const lines = groups.map((g) => {
        const link = groupLink(g.chatId);
        return `${g.title ?? g.chatId}${link ? ` ${link}` : ` (${g.chatId})`}${g.removedAt ? " [removed]" : ""}`;
      });
      await ctx.reply(`Groups:\n${lines.join("\n") || "(пусто)"}`);
      return;
    }

    if (sub === "purge") {
      const users = await prisma.user.findMany({ select: { id: true } });
      let removed = 0;
      for (const u of users) {
        try {
          await ctx.api.sendChatAction(Number(u.id), "typing");
        } catch (err) {
          if ((err as GrammyError)?.error_code === 403) {
            await prisma.user.delete({ where: { id: u.id } }).then(() => (removed += 1)).catch(() => undefined);
          }
        }
        await sleep(30);
      }
      await ctx.reply(`Удалено заблокировавших: ${removed}`);
      return;
    }

    // Default: full JSON dump as a document.
    const [users, banned, groups] = await Promise.all([
      prisma.user.findMany(),
      prisma.bannedUser.findMany(),
      prisma.group.findMany(),
    ]);
    const dump = { exportedAt: new Date().toISOString(), users, banned, groups };
    // BigInt.prototype.toJSON is patched in db.ts, so this serializes safely.
    const buf = Buffer.from(JSON.stringify(dump, null, 2), "utf8");
    await ctx.replyWithDocument(new InputFile(buf, "db_export.json"));
  });

  // --- /imp : import (reverse of /dg) --------------------------------------
  bot.command("imp", async (ctx) => {
    if (!opGuard(ctx)) return;
    const doc = ctx.message?.document ?? ctx.message?.reply_to_message?.document;
    if (!doc) {
      await ctx.reply("Прикрепи файл с подписью /imp, или ответь /imp на сообщение с файлом.");
      return;
    }

    let buf: Buffer;
    try {
      buf = await downloadFile(doc.file_id);
    } catch (err) {
      logger.error("imp download failed", { err: String(err) });
      await ctx.reply("Не удалось скачать файл.");
      return;
    }

    const name = (doc.file_name ?? "").toLowerCase();

    // TXT: one user id per line.
    if (name.endsWith(".txt")) {
      const ids = buf
        .toString("utf8")
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => /^\d+$/.test(s));
      const res = await prisma.user.createMany({
        data: ids.map((id) => ({ id: BigInt(id) })),
        skipDuplicates: true,
      });
      await ctx.reply(`users: +${res.count} новых (из ${ids.length})`);
      return;
    }

    // JSON: full import.
    let data: { users?: unknown[]; banned?: unknown[]; groups?: unknown[] };
    try {
      data = JSON.parse(buf.toString("utf8"));
    } catch {
      await ctx.reply("Файл не распознан (нужен JSON из /dg или TXT с id).");
      return;
    }

    const report: string[] = [];

    const importTable = async (label: string, fn: () => Promise<number>) => {
      try {
        const total = await fn();
        report.push(`${label}: +${total} новых`);
      } catch (err) {
        logger.error(`imp ${label} failed`, { err: String(err) });
        report.push(`${label}: ошибка`);
      }
    };

    if (Array.isArray(data.users)) {
      await importTable("users", async () => {
        const rows = (data.users as Array<{ id: string | number; username?: string | null; firstName?: string | null }>).map(
          (u) => ({ id: BigInt(u.id), username: u.username ?? null, firstName: u.firstName ?? null })
        );
        const r = await prisma.user.createMany({ data: rows, skipDuplicates: true });
        return r.count;
      });
    }
    if (Array.isArray(data.banned)) {
      await importTable("banned", async () => {
        const rows = (data.banned as Array<{ userId: string | number; reason?: string | null; bannedBy?: string | number | null }>).map(
          (b) => ({ userId: BigInt(b.userId), reason: b.reason ?? null, bannedBy: b.bannedBy != null ? BigInt(b.bannedBy) : null })
        );
        const r = await prisma.bannedUser.createMany({ data: rows, skipDuplicates: true });
        return r.count;
      });
    }
    if (Array.isArray(data.groups)) {
      await importTable("groups", async () => {
        const rows = (data.groups as Array<{ chatId: string | number; ownerUserId: string | number; title?: string | null; guardEnabled?: boolean }>).map(
          (g) => ({
            chatId: BigInt(g.chatId),
            ownerUserId: BigInt(g.ownerUserId),
            title: g.title ?? null,
            guardEnabled: Boolean(g.guardEnabled),
          })
        );
        const r = await prisma.group.createMany({ data: rows, skipDuplicates: true });
        return r.count;
      });
    }

    await ctx.reply(report.length ? `Импорт:\n${report.join("\n")}` : "Нечего импортировать.");
  });
}
