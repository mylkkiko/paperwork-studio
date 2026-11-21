#!/bin/sh
# Container start: apply migrations, seed demo data once, start the API (+ workers + reminder scheduler).
set -e
npx prisma migrate deploy
if [ "$SEED_ON_START" = "true" ]; then
  node dist/prisma/seed.js
fi
exec node dist/src/server.js
