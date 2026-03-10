# Build stage - Angular
FROM node:22-alpine AS builder

WORKDIR /app

# Copy Angular app
COPY src/main/webapp/package*.json ./
RUN npm ci

COPY src/main/webapp/ ./
RUN npm run build

# Production stage - Nginx (unprivileged for Kubernetes read-only filesystem support)
FROM nginxinc/nginx-unprivileged:alpine

# Copy built Angular app
COPY --from=builder /app/dist/wiremock-ui/browser /usr/share/nginx/html

# Copy nginx template — envsubst is applied automatically via /etc/nginx/templates/
# config.json is served dynamically by nginx (location = /config.json { return 200 ... })
# using WIREMOCK_API_URL and WIREMOCK_BACKEND env vars. No filesystem write at runtime.
# Fully compatible with readOnlyRootFilesystem=true.
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
