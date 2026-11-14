# Multi-stage build: Node.js build → Nginx production serve
# Build with: docker build -t earth-jukebox-webapp .
# Run with:   docker run -p 80:80 earth-jukebox-webapp

# ─────────────────────────────────────────────────────────────
# Stage 1: Build the Vite/React application
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies (clean install for reproducibility)
RUN npm ci

# Copy source code
COPY . .

# API base URL, baked into the bundle at build time (required, no default):
#   docker build --build-arg VITE_API_URL=/api .
# Local .env files are kept out by .dockerignore, so the .env Vite reads is
# written here from the build arg. It only exists in this build stage.
ARG VITE_API_URL
RUN if [ -z "$VITE_API_URL" ]; then \
        echo "ERROR: build arg VITE_API_URL is required (e.g. --build-arg VITE_API_URL=/api)" >&2; exit 1; \
    fi \
    && printf 'VITE_API_URL=%s\n' "$VITE_API_URL" > .env \
    && echo "Generated .env:" && cat .env

# Build the production bundle
RUN npm run build

# ─────────────────────────────────────────────────────────────
# Stage 2: Serve with Nginx
# ─────────────────────────────────────────────────────────────
FROM nginx:alpine AS production

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

# Start nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
