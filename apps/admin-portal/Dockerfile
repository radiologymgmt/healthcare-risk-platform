# syntax=docker/dockerfile:1
# Component 8: Admin Portal (Next.js Standalone)
# Build from monorepo root: docker build -f apps/admin-portal/Dockerfile .

FROM node:22-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@12.21.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared-contracts/package.json ./packages/shared-contracts/
COPY apps/admin-portal/package.json ./apps/admin-portal/

RUN pnpm install --frozen-lockfile --filter @healthcare/admin-portal...

COPY packages/shared-contracts ./packages/shared-contracts
COPY apps/admin-portal ./apps/admin-portal

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @healthcare/shared-contracts build \
  && pnpm --filter @healthcare/admin-portal build

FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=8080

COPY --from=builder --chown=node:node /app/apps/admin-portal/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/admin-portal/.next/static ./apps/admin-portal/.next/static
COPY --from=builder --chown=node:node /app/apps/admin-portal/public ./apps/admin-portal/public

USER node
EXPOSE 8080

CMD ["node", "apps/admin-portal/server.js"]
