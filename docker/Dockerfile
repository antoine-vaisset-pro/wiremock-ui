# Build stage - Angular
FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS builder

WORKDIR /app

ARG WIREMOCK_BACKEND=""
ENV WIREMOCK_BACKEND=$WIREMOCK_BACKEND

# Copy Angular app
COPY src/main/webapp/package*.json ./
RUN npm ci

COPY src/main/webapp/ ./
RUN npm run build

# Production stage - Nginx (unprivileged for Kubernetes read-only filesystem support)
FROM nginxinc/nginx-unprivileged:alpine@sha256:b5047b9b76845eac124358373c6852377c52e4b05834a47647e955dd91cb8f1e

ARG WIREMOCK_BACKEND=""
ENV WIREMOCK_BACKEND=$WIREMOCK_BACKEND
ENV WIREMOCK_API_URL=/__admin

# Copy built Angular app
COPY --from=builder /app/dist/wiremock-ui/browser /usr/share/nginx/html

# The nginx image applies this template at container start. This makes
# WIREMOCK_BACKEND a runtime setting while the build ARG above preserves the
# existing build-time configuration for deployments that bake it into the image.
USER root
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker/05-wiremock-backend.envsh /docker-entrypoint.d/05-wiremock-backend.envsh
RUN chmod +x /docker-entrypoint.d/05-wiremock-backend.envsh

EXPOSE 8080

USER 101

CMD ["nginx", "-g", "daemon off;"]
