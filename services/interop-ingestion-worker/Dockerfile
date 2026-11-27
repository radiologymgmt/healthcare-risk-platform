# syntax=docker/dockerfile:1
# Component 6: Interop Ingestion Worker (HL7 v2, FHIR R4, GCS Eventarc)
# Build from monorepo root: docker build -f services/interop-ingestion-worker/Dockerfile .

FROM node:22-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@12.21.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared-contracts/package.json ./packages/shared-contracts/
COPY packages/database/package.json ./packages/database/
COPY services/interop-ingestion-worker/package.json ./services/interop-ingestion-worker/

RUN pnpm install --frozen-lockfile --filter @healthcare/interop-ingestion-worker...

COPY packages/shared-contracts ./packages/shared-contracts
COPY packages/database ./packages/database
COPY services/interop-ingestion-worker ./services/interop-ingestion-worker

RUN pnpm --filter @healthcare/shared-contracts build \
  && pnpm --filter @healthcare/database build \
  && pnpm --filter @healthcare/interop-ingestion-worker build

FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/packages/shared-contracts/package.json ./packages/shared-contracts/
COPY --from=builder --chown=node:node /app/packages/shared-contracts/dist ./packages/shared-contracts/dist
COPY --from=builder --chown=node:node /app/packages/shared-contracts/node_modules ./packages/shared-contracts/node_modules
COPY --from=builder --chown=node:node /app/packages/database/package.json ./packages/database/
COPY --from=builder --chown=node:node /app/packages/database/dist ./packages/database/dist
COPY --from=builder --chown=node:node /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=builder --chown=node:node /app/services/interop-ingestion-worker/package.json ./services/interop-ingestion-worker/
COPY --from=builder --chown=node:node /app/services/interop-ingestion-worker/dist ./services/interop-ingestion-worker/dist
COPY --from=builder --chown=node:node /app/services/interop-ingestion-worker/node_modules ./services/interop-ingestion-worker/node_modules

USER node
EXPOSE 8080

CMD ["node", "services/interop-ingestion-worker/dist/server.js"]
