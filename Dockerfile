FROM node:26-alpine AS base

# Install corepack and enable it to use the correct version of yarn
RUN npm install -g corepack && corepack enable

# Build stage
FROM base AS builder

WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN yarn build

# Shared runtime base. The FFmpeg integration-test image derives from this
# exact stage so it exercises the same Ubuntu FFmpeg build as production.
FROM nvidia/cuda:13.3.1-runtime-ubuntu26.04 AS runtime-base

WORKDIR /app

# Install Node.js 26 and ffmpeg with NVIDIA hardware acceleration support
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    gnupg \
    xz-utils \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y nodejs ffmpeg \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Opt-in FFmpeg integration test stage. This intentionally installs development
# dependencies in a separate image; none of them are copied into production.
FROM runtime-base AS ffmpeg-test

ENV NODE_ENV=test

RUN npm install --global yarn@1.22.22

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .

CMD ["yarn", "test:docker:inside"]

# Production stage
FROM runtime-base AS runner

# Create non-root user
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Create directories for data and recordings
RUN mkdir -p /app/data /app/recordings /app/logs /tmp && chown -R nextjs:nodejs /app/data /app/recordings /app/logs /tmp

# Declare volumes for persistent data
VOLUME ["/app/data", "/app/recordings", "/app/logs"]

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

