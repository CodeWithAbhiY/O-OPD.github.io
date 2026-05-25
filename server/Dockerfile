# O-OPD backend — production image for Fly.io
FROM node:20-slim

WORKDIR /app

# Install production dependencies first (better build caching).
COPY package*.json ./
RUN npm ci --omit=dev

# App source.
COPY . .

ENV NODE_ENV=production
ENV PORT=8080
ENV DB_PATH=/data/oopd.db
EXPOSE 8080

# On boot: apply migrations + seed (both idempotent), then start the API.
# The SQLite file lives on the mounted volume at /data, so data persists.
CMD ["sh", "-c", "node src/db/migrate.js && node src/db/seed.js && node index.js"]
