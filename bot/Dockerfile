# Backend image for DigitalOcean App Platform / Droplet.
FROM node:20-slim AS base
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Install dependencies (including dev for build).
COPY package.json package-lock.json* ./
RUN npm install

# Build: generate Prisma client and compile TypeScript.
COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate && npm run build

# Keep dev dependencies: the Prisma CLI is needed at boot to sync the schema.

ENV NODE_ENV=production
EXPOSE 8080

# Sync the schema to the database on boot (creates tables on first run), then
# start. Switch to `prisma migrate deploy` once migration files are committed.
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
