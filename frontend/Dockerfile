# ---- build ----
FROM node:20-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# NEXT_PUBLIC_APP_ENV is inlined into the browser bundle at build time.
# BACKEND_URL = the backend as seen from this container (internal docker address, not the public site address);
# it is the target of the /api rewrite. The browser only ever uses relative /api on the site's own address.
ARG NEXT_PUBLIC_APP_ENV=test
ARG BACKEND_URL=http://backend:4000
ENV NEXT_PUBLIC_APP_ENV=$NEXT_PUBLIC_APP_ENV BACKEND_URL=$BACKEND_URL
RUN npm run build

# ---- runtime: Next.js standalone server ----
FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/messages ./messages
USER node
EXPOSE 3000
CMD ["node", "server.js"]
