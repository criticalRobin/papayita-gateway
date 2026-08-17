# ---- Etapa 1: build ----
# node:20-slim (Debian/glibc), not node:20-alpine — onnxruntime-node's
# prebuilt binary (used by @xenova/transformers for classification) is
# linked against glibc and segfaults under musl even with compat shims.
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
# Pre-download the classification embedding model into the image so
# production never needs outbound internet access at container cold-start.
RUN node scripts/prewarm-model.js

# ---- Etapa 2: producción ----
FROM node:20-slim AS production
WORKDIR /app
ENV NODE_ENV=production
ENV TRANSFORMERS_CACHE_DIR=/app/.cache/transformers
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/.cache ./.cache
EXPOSE 3000
CMD ["node", "dist/main.js"]
