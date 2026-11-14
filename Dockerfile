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

# Build-time environment variable for API URL
# Can be overridden: docker build --build-arg VITE_API_URL=/api .
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

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
