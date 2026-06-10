# Stage 1: Dependency installation
FROM node:20-alpine AS dependencies

WORKDIR /app

# Copy package config files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Stage 2: Final minimal runtime image
FROM node:20-alpine AS runtime

# Set environment
ENV NODE_ENV=production
ENV PORT=5000

WORKDIR /app

# Copy production dependencies from Stage 1
COPY --from=dependencies /app/node_modules ./node_modules
COPY package*.json ./

# Copy application source code
COPY src ./src

# Set non-root user for security
USER node

# Expose service port
EXPOSE 5000

# Run entrypoint
CMD ["node", "src/server.js"]
