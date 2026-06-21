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

# Drop dev dependencies for the runtime image.
RUN npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 8080

# Apply migrations on boot, then start.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
