# Production Deployment - WireMock Web UI

## 🎯 Deployment Architecture

In production, **Nginx replaces the Angular dev server proxy** and routes requests to WireMock.

```
┌─────────────────────────────────────────────────────┐
│                  Docker Compose                     │
│                                                     │
│  ┌──────────────────────┐  ┌─────────────────────┐  │
│  │  ui (Nginx + Angular)│  │  wiremock           │  │
│  │  Port: 4200 → 80     │──│  Port: 8080         │  │
│  └──────────────────────┘  └─────────────────────┘  │
│           ↑                                         │
└───────────┼─────────────────────────────────────────┘
            │
        Browser
```

**Request flow:**
`Browser → Nginx (port 4200) → [/__admin/ or /api/] → WireMock (port 8080)`

## 🚀 Quick Deployment

```bash
# Full build and startup
make docker-up

# Real-time logs
docker-compose -f docker/docker-compose.yml logs -f

# Stop
make docker-down
```

## 🐳 Build Docker Image Only

```bash
make docker-build
# or
docker build -f docker/Dockerfile -t wiremock-ui:latest .
```

## 📁 Docker Configuration Files

All Docker files are in `docker/`:

| File | Role |
|------|------|
| `docker/Dockerfile` | Multi-stage build Angular → Nginx |
| `docker/docker-compose.yml` | Orchestration UI + WireMock |
| `docker/nginx.conf` | Nginx config: proxy `/__admin/`, `/api/`, SPA fallback |

## ⚙️ Runtime backend configuration

The published image is configured when the container starts. Set
`WIREMOCK_BACKEND` to one or more base URLs separated by semicolons:

```bash
docker run --rm -p 4200:8080 \
  -e WIREMOCK_BACKEND=http://host.docker.internal:8080 \
  ghcr.io/antoine-vaisset-pro/wiremock-ui:latest
```

The URLs are returned by `/config.json`, listed in the selector with an
`[ENV]` badge, and cannot be edited in the UI. A value supplied at container
runtime takes precedence over the value baked into an image with
`--build-arg WIREMOCK_BACKEND=...`. If no value is supplied, the UI uses its
local `/__admin` proxy.

## ⚙️ Nginx Configuration (docker/nginx.conf.template)

The Nginx proxy handles two types of requests:
- `/__admin/*` → WireMock Admin API
- `/api/*` → Mocked endpoints (for the Requester)
- Everything else → `index.html` (SPA fallback)

To add other mocked endpoint prefixes, edit `docker/nginx.conf.template`:

```nginx
location /v1/ {
    proxy_pass $wiremock_backend;
    proxy_http_version 1.1;
    # ... other headers ...
}
```

## 🔒 Deployment Checklist

- [ ] `make build` passes without error
- [ ] `docker/nginx.conf` contains all required endpoint prefixes
- [ ] `make docker-build` succeeds
- [ ] `make docker-up` starts correctly
- [ ] UI accessible at http://localhost:4200
- [ ] WireMock API accessible at http://localhost:8080/__admin/
- [ ] Test the Requester with a mocked endpoint

## 🔒 Production Security

```nginx
# Limit request size
client_max_body_size 10M;

# HTTPS (recommended)
listen 443 ssl;
ssl_certificate     /etc/nginx/ssl/cert.pem;
ssl_certificate_key /etc/nginx/ssl/key.pem;
```

## 📊 Dev vs Prod

| Aspect | Development | Production |
|--------|-------------|------------|
| Server | Angular Dev Server | Nginx |
| Proxy  | `proxy.conf.js`    | `docker/nginx.conf` |
| Build  | JIT                | AOT (minified)      |
| Hot reload | ✅             | ❌                 |
| Command | `make dev-full`   | `make docker-up`   |
