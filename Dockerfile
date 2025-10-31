# syntax=docker/dockerfile:1
## Multi-stage build: build with pnpm, serve with nginx

FROM node:20-alpine AS builder
WORKDIR /app

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate

# Install deps first using lockfile for deterministic builds
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build mode (affects vite plugin config)
ARG BUILD_MODE=prod
ENV BUILD_MODE=${BUILD_MODE}

# Pass VITE_* envs at build time
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_APP_NAME
ARG VITE_APP_VERSION
ARG VITE_MAX_FILE_SIZE
ARG VITE_MAX_IMAGES

ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}
ENV VITE_APP_NAME=${VITE_APP_NAME}
ENV VITE_APP_VERSION=${VITE_APP_VERSION}
ENV VITE_MAX_FILE_SIZE=${VITE_MAX_FILE_SIZE}
ENV VITE_MAX_IMAGES=${VITE_MAX_IMAGES}

# Build production bundle
RUN pnpm build:prod

FROM nginx:alpine AS runner

# Copy compiled assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Configure SPA routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

