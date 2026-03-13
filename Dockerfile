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

# Install Node.js 24 and a static FFmpeg build with NVENC/CUDA support.
# Ubuntu's default apt ffmpeg is compiled WITHOUT NVENC, so nvidia-smi shows no
# GPU usage even when hwaccel is configured. We use a static build from
# johnvansickle.com which includes all encoders (h264_nvenc, hevc_nvenc, etc.).
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    gnupg \
    xz-utils \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install static FFmpeg build that includes NVENC/CUDA hardware acceleration support.
# The static build from johnvansickle.com is compiled with --enable-nvenc and all GPU encoders.
RUN curl -fsSL https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz \
    | tar -xJ --strip-components=1 -C /usr/local/bin --wildcards '*/ffmpeg' '*/ffprobe' \
    && chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe

# Create non-root user
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Create directories for data and recordings
RUN mkdir -p /app/data /app/recordings /app/logs /tmp
RUN chown -R nextjs:nodejs /app/data /app/recordings /app/logs /tmp

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

