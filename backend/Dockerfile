# ---- build ----
FROM node:20-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- runtime ----
FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl wget && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY prisma ./prisma
COPY seed ./seed
COPY docker/entrypoint.sh ./docker/entrypoint.sh
RUN mkdir -p /app/storage && chown -R node:node /app/storage
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --retries=12 CMD wget -qO- http://localhost:4000/api/health || exit 1
ENTRYPOINT ["./docker/entrypoint.sh"]
