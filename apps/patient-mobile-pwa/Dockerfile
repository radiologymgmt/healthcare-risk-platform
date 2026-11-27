# syntax=docker/dockerfile:1
# Component 4: Patient Mobile Magic-Link PWA (Next.js Standalone)
# Build from monorepo root: docker build -f apps/patient-mobile-pwa/Dockerfile .

FROM node:22-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@12.21.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared-contracts/package.json ./packages/shared-contracts/
COPY apps/patient-mobile-pwa/package.json ./apps/patient-mobile-pwa/

RUN pnpm install --frozen-lockfile --filter @healthcare/patient-mobile-pwa...

COPY packages/shared-contracts ./packages/shared-contracts
COPY apps/patient-mobile-pwa ./apps/patient-mobile-pwa

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @healthcare/shared-contracts build \
  && pnpm --filter @healthcare/patient-mobile-pwa build

FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=8080

COPY --from=builder --chown=node:node /app/apps/patient-mobile-pwa/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/patient-mobile-pwa/.next/static ./apps/patient-mobile-pwa/.next/static
COPY --from=builder --chown=node:node /app/apps/patient-mobile-pwa/public ./apps/patient-mobile-pwa/public

USER node
EXPOSE 8080

CMD ["node", "apps/patient-mobile-pwa/server.js"]
