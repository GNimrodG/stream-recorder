# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN yarn build

# Production stage - Use Ubuntu base for NVIDIA GPU support
FROM nvidia/cuda:12.3.1-runtime-ubuntu22.04 AS runner

WORKDIR /app

# Install Node.js 20 and ffmpeg with NVIDIA hardware acceleration support
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    gnupg \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y \
    nodejs \
    ffmpeg \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Create directories for data and recordings
RUN mkdir -p /app/data /app/recordings /tmp
RUN chown -R nextjs:nodejs /app/data /app/recordings /tmp

# Declare volumes for persistent data
VOLUME ["/app/data", "/app/recordings"]

# Set environment variables
ENV NODE_ENV=production
ENV RECORDINGS_DB_PATH=/app/data/recordings.json
ENV SETTINGS_FILE_PATH=/app/data/settings.json
ENV STREAMS_FILE_PATH=/app/data/streams.json
ENV RECORDINGS_OUTPUT_DIR=/app/recordings
ENV FFMPEG_PATH=ffmpeg
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]

