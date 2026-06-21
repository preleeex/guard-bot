# Первый деплой

Бэкенд (бот + API + БД) на DigitalOcean App Platform, Mini App на Vercel,
деплой по push в `main` через GitHub Actions.

## Обзор переменных и секретов

### GitHub (Actions secrets)

| Имя | Для чего |
| --- | --- |
| `VERCEL_TOKEN` | Деплой Mini App через Vercel CLI |
| `VERCEL_ORG_ID` | Идентификатор организации Vercel |
| `VERCEL_PROJECT_ID` | Идентификатор проекта Vercel (webapp) |
| `DIGITALOCEAN_ACCESS_TOKEN` | Доступ к DigitalOcean API |
| `DIGITALOCEAN_APP_ID` | Id приложения App Platform (после первого создания) |

### Backend (DigitalOcean App Platform env)

| Переменная | Тип | Значение |
| --- | --- | --- |
| `BOT_TOKEN` | secret | токен из @BotFather |
| `BOT_USERNAME` | plain | username бота без @ |
| `OWNER_USER_ID` | plain | `7210276147` |
| `SYSTEM_LOG_CHAT_ID` | plain | `3275669277` (для супергруппы обычно с префиксом -100) |
| `WEBHOOK_SECRET_TOKEN` | secret | длинная случайная строка |
| `PUBLIC_BASE_URL` | plain | URL бэкенда на App Platform |
| `MINI_APP_URL` | plain | URL Mini App на Vercel |
| `DATABASE_URL` | secret | строка подключения Managed Postgres |
| `CRYPTO_PAY_API_TOKEN` | secret | токен Crypto Pay из @CryptoBot |
| `CRYPTO_PAY_API_BASE` | plain | `https://pay.crypt.bot/api` (или testnet) |
| `PORT` | plain | `8080` |

### Frontend (Vercel project env)

| Переменная | Значение |
| --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | URL бэкенда (как `PUBLIC_BASE_URL`) |

## Шаги

### 1. Репозиторий

1. Создайте репозиторий на GitHub, запушьте этот проект в `main`.

### 2. База данных и бэкенд (DigitalOcean)

Вариант App Platform (рекомендуется: один сервис + Managed Postgres, авто-TLS,
деплой по push):

1. Установите `doctl` и авторизуйтесь (`doctl auth init`).
2. Отредактируйте `.do/app.yaml`: впишите `GITHUB_OWNER/REPO`.
3. Создайте приложение:
   ```
   doctl apps create --spec .do/app.yaml
   ```
   Это поднимет сервис `backend` из `bot/Dockerfile` и базу `guard-db`.
4. В UI App Platform задайте значения env из таблицы выше. `DATABASE_URL`
   возьмите из подключённой базы (вкладка Database -> Connection string).
5. Сохраните id приложения (`doctl apps list`) в секрет `DIGITALOCEAN_APP_ID`.
6. Запомните публичный URL приложения -> это `PUBLIC_BASE_URL`.

Миграции применяются автоматически при старте контейнера
(`prisma migrate deploy` в `CMD` Dockerfile). Создайте первую миграцию локально:
```
cd bot
cp ../.env.example .env   # заполните DATABASE_URL и прочее
npm install
npx prisma migrate dev --name init
git add prisma/migrations && git commit -m "init migration" && git push
```

### 3. Mini App (Vercel)

1. `cd webapp && npx vercel link` -> создаст проект, выдаст `VERCEL_ORG_ID` и
   `VERCEL_PROJECT_ID` (см. `.vercel/project.json`). Внесите их в GitHub secrets.
2. Создайте `VERCEL_TOKEN` в Vercel (Account Settings -> Tokens).
3. В настройках проекта Vercel задайте `NEXT_PUBLIC_API_BASE_URL`.
4. Первый деплой можно сделать вручную: `vercel --prod`. Далее push в `main`
   с изменениями в `webapp/**` деплоит автоматически через
   `.github/workflows/deploy-webapp.yml`.
5. Запомните URL Vercel -> это `MINI_APP_URL` (внесите в env бэкенда).

### 4. Связать всё вместе

1. Пропишите `PUBLIC_BASE_URL` и `MINI_APP_URL` в env бэкенда, передеплойте.
2. Зарегистрируйте webhook:
   ```
   cd bot && npm run set-webhook
   ```
3. В @BotFather задайте Menu Button = `MINI_APP_URL` (см. SETUP_BOTFATHER.md).

### 5. Crypto Pay webhook

В @CryptoBot -> Crypto Pay -> My Apps -> Webhooks укажите URL:
```
PUBLIC_BASE_URL/crypto/webhook
```
Бэкенд проверяет подпись `crypto-pay-api-signature`. Сверьте формат вебхука с
текущей документацией Crypto Pay.

## CI/CD итог

- Push в `main` с изменениями `bot/**` -> `deploy-bot.yml` -> новый деплой на
  App Platform (rebuild Dockerfile, миграции, рестарт).
- Push с изменениями `webapp/**` -> `deploy-webapp.yml` -> деплой на Vercel.
- Любой push/PR -> `ci.yml` -> typecheck бэкенда и фронта.
