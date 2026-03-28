##############################################################
# BLA Backend — Dockerfile multi-stage
##############################################################

# ── Stage 1 : dépendances ──────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Stage 2 : développement (avec hot-reload) ──────────────
FROM node:20-alpine AS development
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
CMD ["npm", "run", "dev"]

# ── Stage 3 : build TypeScript ─────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

# ── Stage 4 : production (image légère) ───────────────────
FROM node:20-alpine AS production
WORKDIR /app

# Sécurité : utilisateur non-root
RUN addgroup -g 1001 -S nodejs && adduser -S bla -u 1001 -G nodejs

COPY --from=deps    /app/node_modules ./node_modules
COPY --from=builder /app/dist          ./dist
COPY --from=builder /app/prisma        ./prisma
COPY package.json ./

USER bla

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
