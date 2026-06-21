# Telegram Guard Bot

Public multi-tenant Telegram bot that screens chat join requests through a
configurable Mini App. Any user can connect the bot to a group they own and
build a screening scenario (captcha, quiz, rules consent, ...) without touching
code.

## Stack and why

- **Backend: Node.js + TypeScript (grammY + Express + Prisma).** A single
  language across bot and Mini App lets us share the scenario block and
  `initData` types, and grammY gives clean update handling while still letting
  us hit raw Telegram HTTP endpoints for the newer Join Request Queries methods.
- **Database: PostgreSQL (DigitalOcean Managed Postgres) via Prisma.** Relational
  multi-tenancy (owners, groups, bindings, scenarios, quotas, payments, journal)
  maps directly to typed Prisma models with migrations.
- **Mini App: Next.js on Vercel.** Static export of a mobile-first single-column
  UI that reads native Telegram theme params; deployed independently on Vercel
  while the backend (bot webhook + Mini App API) runs on DigitalOcean.

## Layout

```
bot/                  Backend: Telegram webhook, Mini App REST API, DB
  prisma/             Prisma schema and migrations
  src/
    telegram/         Telegram API client (new query methods + legacy fallback)
    services/         Owners, groups, quota, scenarios, journal, payments
    api/              REST API for the Mini App (initData-authenticated)
webapp/               Next.js Mini App: applicant screening, owner panel, admin
.github/workflows/    CI/CD: deploy bot to DigitalOcean, webapp to Vercel
docs/                 BotFather setup, deploy guide, test plan
```

## Constants from the spec

- `OWNER_USER_ID = 7210276147` (bot operator, unlimited groups, admin view).
- `SYSTEM_LOG_CHAT_ID = 3275669277` (system/business events only).
- Free quota: 3 groups per owner. Paid: bundles of +3 groups for $3.99 via
  @CryptoBot (Crypto Pay API).

## Getting started

See [docs/DEPLOY.md](docs/DEPLOY.md) for first deploy, and
[docs/SETUP_BOTFATHER.md](docs/SETUP_BOTFATHER.md) for bot configuration.
For local development:

```bash
cd bot
cp ../.env.example .env   # fill in the values
npm install
npx prisma migrate dev
npm run dev
```

```bash
cd webapp
npm install
npm run dev
```

## Notes on the Bot API

The spec targets "Join Request Queries" from Bot API 10.1
(`answerChatJoinRequestQuery`, `sendChatJoinRequestWebApp`,
`ChatFullInfo.guard_bot`, `User.supports_join_request_queries`). The backend
calls these as raw HTTP methods behind a small abstraction
([bot/src/telegram/api.ts](bot/src/telegram/api.ts)) and automatically falls
back to the stable `approveChatJoinRequest` / `declineChatJoinRequest` methods
for groups where the query mode is unavailable. Verify method names and fields
against the current Bot API and Crypto Pay API before going live.
