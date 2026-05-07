# ── Stage 1: Install production dependencies ──────────────────────────────
FROM node:20-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ── Stage 2: Production image ──────────────────────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app

# Copy installed deps and app source
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Create upload directories
RUN mkdir -p uploads/thumbs

# Non-root user for security
RUN groupadd -r cloudpix && useradd -r -g cloudpix cloudpix
RUN chown -R cloudpix:cloudpix /app
USER cloudpix

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
    CMD node -e "require('http').get('http://localhost:3000/api/status', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
