# syntax=docker/dockerfile:1
# Component 5: Provider Triage Dashboard (Next.js Standalone)
# Build from monorepo root: docker build -f apps/provider-dashboard/Dockerfile .

FROM node:22-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@12.21.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared-contracts/package.json ./packages/shared-contracts/
COPY apps/provider-dashboard/package.json ./apps/provider-dashboard/

RUN pnpm install --frozen-lockfile --filter @healthcare/provider-dashboard...

COPY packages/shared-contracts ./packages/shared-contracts
COPY apps/provider-dashboard ./apps/provider-dashboard

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @healthcare/shared-contracts build \
  && pnpm --filter @healthcare/provider-dashboard build

FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=8080

COPY --from=builder --chown=node:node /app/apps/provider-dashboard/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/provider-dashboard/.next/static ./apps/provider-dashboard/.next/static

USER node
EXPOSE 8080

CMD ["node", "apps/provider-dashboard/server.js"]
