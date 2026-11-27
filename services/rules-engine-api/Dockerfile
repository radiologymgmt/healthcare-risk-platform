# syntax=docker/dockerfile:1
# Component 1 & 7: Rules Engine API + Headless Chromium PDF Generator
# Build from monorepo root: docker build -f services/rules-engine-api/Dockerfile .

FROM node:22-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@12.21.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared-contracts/package.json ./packages/shared-contracts/
COPY packages/database/package.json ./packages/database/
COPY services/rules-engine-api/package.json ./services/rules-engine-api/

RUN pnpm install --frozen-lockfile --filter @healthcare/rules-engine-api...

COPY packages/shared-contracts ./packages/shared-contracts
COPY packages/database ./packages/database
COPY services/rules-engine-api ./services/rules-engine-api

RUN pnpm --filter @healthcare/shared-contracts build \
  && pnpm --filter @healthcare/database build \
  && pnpm --filter @healthcare/rules-engine-api build

FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV CHROME_BIN=/usr/bin/chromium

# Install headless Chromium for Component 8 branded PDF exports (Patient Summary, Prior-Auth, Executive)
RUN apt-get update -qq \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
     chromium \
     fonts-liberation \
     ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/packages/shared-contracts/package.json ./packages/shared-contracts/
COPY --from=builder --chown=node:node /app/packages/shared-contracts/dist ./packages/shared-contracts/dist
COPY --from=builder --chown=node:node /app/packages/shared-contracts/node_modules ./packages/shared-contracts/node_modules
COPY --from=builder --chown=node:node /app/packages/database/package.json ./packages/database/
COPY --from=builder --chown=node:node /app/packages/database/dist ./packages/database/dist
COPY --from=builder --chown=node:node /app/packages/database/migrations ./packages/database/migrations
COPY --from=builder --chown=node:node /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=builder --chown=node:node /app/services/rules-engine-api/package.json ./services/rules-engine-api/
COPY --from=builder --chown=node:node /app/services/rules-engine-api/dist ./services/rules-engine-api/dist
COPY --from=builder --chown=node:node /app/services/rules-engine-api/assets ./services/rules-engine-api/assets
COPY --from=builder --chown=node:node /app/services/rules-engine-api/node_modules ./services/rules-engine-api/node_modules

USER node
EXPOSE 8080

CMD ["node", "services/rules-engine-api/dist/server.js"]
