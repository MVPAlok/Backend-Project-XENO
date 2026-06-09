FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .

# Final stage
FROM node:20-alpine

# Use non-root user
USER node

WORKDIR /app

COPY --chown=node:node --from=builder /app/package*.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/src ./src

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "src/server.js"]
