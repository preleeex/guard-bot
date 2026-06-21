# Настройка бота в @BotFather

Минимальные шаги для запуска guard-бота. Названия методов и флагов Join Request
Queries (Bot API 10.1) сверьте с текущей документацией Bot API перед продакшеном.

## 1. Создать бота

1. Откройте @BotFather, отправьте `/newbot`.
2. Задайте имя и username. Сохраните токен в `BOT_TOKEN`, username в `BOT_USERNAME`.

## 2. Включить поддержку Join Request Queries

Бот должен сообщать `supports_join_request_queries = true` в `getMe`.

1. В @BotFather: `/mybots` -> выберите бота -> Bot Settings.
2. Включите режим обработки заявок на вступление (Join Request Queries), если
   пункт доступен в вашей версии BotFather.
3. Проверьте: запросите `https://api.telegram.org/bot<token>/getMe` и убедитесь,
   что в ответе `supports_join_request_queries: true`.

Если флаг недоступен, бот автоматически работает в legacy-режиме
(`approveChatJoinRequest` / `declineChatJoinRequest`).

## 3. Mini App

1. В Bot Settings -> Menu Button (или `/setmenubutton`) задайте Web App URL
   равным `MINI_APP_URL` (адрес Vercel). Это точка входа в панель владельца.
2. Убедитесь, что домен Mini App добавлен (Telegram требует HTTPS).

## 4. Права в группе

Чтобы бот мог одобрять и отклонять заявки:

1. Добавьте бота в группу администратором.
2. Выдайте право «Добавлять участников» (`can_invite_users`).
3. Назначьте бота guard-ботом чата (поле `ChatFullInfo.guard_bot`), если ваша
   версия Telegram это поддерживает. Иначе бот получает обновления
   `chat_join_request` как обычный админ.
4. Включите в группе «Заявки на вступление» (Approve new members) в настройках
   приватности группы, иначе заявки не создаются.

## 5. Webhook

После деплоя бэкенда зарегистрируйте webhook (см. docs/DEPLOY.md):

```
cd bot && npm run set-webhook
```

Webhook ставится на `PUBLIC_BASE_URL/telegram/webhook` с заголовком
`secret_token = WEBHOOK_SECRET_TOKEN`.

## 6. Команды (опционально)

`/setcommands` для бота:

```
start - Открыть панель
```
