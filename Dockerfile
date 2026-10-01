FROM node:26-alpine AS base
ENV PNPM_HOME=/pnpm PATH=$PNPM_HOME:$PATH
WORKDIR /app

FROM base AS deps
RUN npm install --no-audit --no-fund

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup -S dots && adduser -S dots -G dots
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
RUN mkdir -p /app/data && chown -R dots:dots /app/data
USER dots
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]