# --- Stage 1: Build & Compile ---
FROM node:24-alpine AS builder

# Install build dependencies for native C++ modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /usr/src/app

# Copy dependency manifests
COPY package*.json tsconfig*.json vite.config.ts index.html ./

# Install all dependencies (including devDependencies for compiling)
RUN npm ci

# Copy source code
COPY src/ ./src/

# Compile frontend and backend
RUN npm run build

# Remove development dependencies to keep the production layer clean
RUN npm prune --production

# --- Stage 2: Runtime Image ---
FROM node:24-alpine

# Set environment defaults
ENV NODE_ENV=production
ENV PORT=3000
ENV ACTUAL_DATA_DIR=/app/data

WORKDIR /app

# Create persistent data directory and set ownership to the default non-root node user
RUN mkdir -p /app/data && chown -R node:node /app/data

# Copy built artifacts and production dependencies from builder stage
COPY --chown=node:node --from=builder /usr/src/app/dist ./dist
COPY --chown=node:node --from=builder /usr/src/app/node_modules ./node_modules
COPY --chown=node:node --from=builder /usr/src/app/package.json ./package.json

# Use the non-root node user for execution
USER node

# Expose server port
EXPOSE 3000

# Mountable volume for database file persistence
VOLUME ["/app/data"]

# Run the Express server
CMD ["node", "dist/server/index.js"]
