# syntax=docker/dockerfile:1
# Component 3: Patient Web Intake Portal (Next.js Standalone)
# Build from monorepo root: docker build -f apps/patient-web/Dockerfile .

FROM node:22-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@12.21.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared-contracts/package.json ./packages/shared-contracts/
COPY apps/patient-web/package.json ./apps/patient-web/

RUN pnpm install --frozen-lockfile --filter @healthcare/patient-web...

COPY packages/shared-contracts ./packages/shared-contracts
COPY apps/patient-web ./apps/patient-web

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @healthcare/shared-contracts build \
  && pnpm --filter @healthcare/patient-web build

FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=8080

COPY --from=builder --chown=node:node /app/apps/patient-web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/patient-web/.next/static ./apps/patient-web/.next/static

USER node
EXPOSE 8080

CMD ["node", "apps/patient-web/server.js"]
