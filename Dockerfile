FROM node:26-alpine AS base
WORKDIR /app

# deps installs from the manifests only, so this layer caches until a
# dependency actually changes — not on every source edit.
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- web: standalone Next build ------------------------------------------
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S dots && adduser -S dots -G dots
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
RUN mkdir -p /app/data && chown -R dots:dots /app/data
USER dots
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "server.js"]

# ---- daemon: the dot's loop, run from source through tsx ------------------
# Separate target from web: it needs the full dependency tree and the TS
# sources, which the standalone Next bundle deliberately does not carry.
FROM base AS daemon
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S dots && adduser -S dots -G dots
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY tsconfig.json ./
COPY src ./src
COPY daemon ./daemon
RUN mkdir -p /app/data && chown -R dots:dots /app/data
USER dots
CMD ["node_modules/.bin/tsx", "daemon/dotsd.ts"]