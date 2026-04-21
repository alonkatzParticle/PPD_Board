# Stage 1: Dependencies
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# Stage 2: Build
FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG MONDAY_API_KEY
ARG MONDAY_API_URL=https://api.monday.com/v2
ENV MONDAY_API_KEY=$MONDAY_API_KEY
ENV MONDAY_API_URL=$MONDAY_API_URL

# Dummy placeholder so Next.js SWC does NOT inline process.env.DATABASE_URL as undefined.
# The real value is injected at container start via docker-compose environment block.
ENV DATABASE_URL=postgresql://appuser:apppass@db:5432/mydb

RUN npm run build

# Stage 3: Production runner
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

CMD ["npm", "start"]
