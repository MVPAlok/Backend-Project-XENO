# Stage 1: Build and dependency installation
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Install build dependencies if needed (e.g. for bcrypt)
RUN apk add --no-cache python3 make g++ 

COPY package*.json ./
COPY src/prisma ./src/prisma/

# Install all dependencies (including devDependencies for builds/generators)
RUN npm ci

# Generate Prisma Client
RUN npx prisma generate --schema=./src/prisma/schema.prisma

# Stage 2: Final minimal production image
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY package*.json ./

# Install only production dependencies
RUN apk add --no-cache python3 make g++ \
    && npm ci --only=production \
    && apk del python3 make g++

# Copy generated prisma client and node_modules from builder
COPY --from=builder /usr/src/app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /usr/src/app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /usr/src/app/src/prisma ./src/prisma

# Copy source code
COPY src ./src

# Use non-root node user for security
USER node

EXPOSE 5000

CMD ["node", "src/server.js"]
