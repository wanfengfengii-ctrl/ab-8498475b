FROM node:22-alpine

WORKDIR /app

# Install production dependencies first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Copy application sources (server, public, tests, scripts).
COPY . .

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0

EXPOSE 8080

# Container-level health check against the API health endpoint.
HEALTHCHECK --interval=5s --timeout=3s --start-period=2s --retries=12 \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1

CMD ["node", "server/index.js"]
