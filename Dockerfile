# ── Stage 1: Install dependencies ─────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ── Stage 2: Production image ──────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Sharp requires these native libs on Alpine
RUN apk add --no-cache vips-dev fftw-dev build-base python3

# Copy deps from stage 1 and app source
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Create upload directories
RUN mkdir -p uploads/thumbs

# Non-root user for security
RUN addgroup -S cloudpix && adduser -S cloudpix -G cloudpix
RUN chown -R cloudpix:cloudpix /app
USER cloudpix

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
    CMD wget -qO- http://localhost:3000/api/status || exit 1

CMD ["node", "server.js"]
