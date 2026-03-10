# Developer Guide - WireMock Web UI

## 🚀 Installation & Startup

```bash
# Check prerequisites (Node, npm, Docker)
make check-setup

# Install npm dependencies
make install

# Start WireMock + Angular in one command
make dev-full

# Or separately:
make wiremock   # WireMock only (Docker, port 8080)
make dev        # Angular only (WireMock already running)
```

## 📦 Available Commands

```bash
make help         # List all commands
make build        # Angular production build
make test         # Unit tests
make smoke-test   # Smoke tests (requires WireMock running)
make clean        # Remove dist/, .angular/, node_modules/
make docker-build # Build the Docker image
make docker-up    # Start via docker-compose
make docker-down  # Stop docker-compose
```

## 🏗️ Architecture

```
src/main/webapp/src/app/
├── components/      # Reusable components (sidebar, header...)
├── pages/           # Application pages
│   ├── dashboard/
│   ├── stubs/
│   ├── requests/
│   ├── requester/
│   ├── recording/
│   ├── scenarios/
│   └── settings/
├── models/          # TypeScript models
├── services/        # Angular services (MappingService, RequestService...)
└── interceptors/    # HTTP interceptors
```

## 📝 Common Tasks

### Add a New Page

1. Create `src/app/pages/my-page/my-page.component.{ts,html,css}`
2. Implement the component (see examples in `pages/`)
3. Add the route in `app.routes.ts`
4. Add the entry in the sidebar menu

### Call the WireMock API

Use the existing services:

```typescript
constructor(private mappingService: MappingService) {}

ngOnInit(): void {
  this.mappingService.getMappings(0, 20, '').subscribe({
    next: (response) => { this.mappings = response.mappings; },
    error: (err) => { console.error('Error:', err); }
  });
}
```

### WireMock Proxy in Development

The `proxy.conf.js` file configures the dev server proxy to WireMock:
- `/__admin/*` → `http://localhost:8080`
- `/api/*` → `http://localhost:8080`

In production, Nginx (`docker/nginx.conf`) handles this role.

## ✅ Pre-commit Checklist

- [ ] `make build` passes without error
- [ ] `make test` passes
- [ ] No forgotten `console.log()`
- [ ] Conventional Commit: `feat:`, `fix:`, `chore:`, `docs:`...

## 🤖 PR Comment Hooks

GitHub Actions workflows are triggered via comments on PRs:

| Command  | Description                  |
|----------|------------------------------|
| `/build`  | Build the PR branch          |
| `/deploy` | Preview deployment on Netlify|
| `/rebase` | Rebase onto target branch (collaborators only) |

## 🔗 Resources

- [Angular Documentation](https://angular.dev/)
- [RxJS](https://rxjs.dev/)
- [Bootstrap](https://getbootstrap.com/)
- [WireMock Admin API](https://wiremock.org/docs/api/)
