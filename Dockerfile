# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build args for env vars (available at build time for Next.js)
ARG MONDAY_API_KEY
ARG MONDAY_API_URL=https://api.monday.com/v2
ENV MONDAY_API_KEY=$MONDAY_API_KEY
ENV MONDAY_API_URL=$MONDAY_API_URL

RUN npm run build

# Stage 3: Production runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
