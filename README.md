# WireMock UI — Web GUI for WireMock

WireMock UI is an open-source, self-hosted web UI/GUI for WireMock. Manage stub mappings, inspect matched and unmatched requests, record from a live API, and test with a built-in HTTP client—without hand-editing JSON or calling the Admin API.

![WireMock UI dashboard](docs/screenshots/dashboard.png)

[![Latest release](https://img.shields.io/github/v/release/antoine-vaisset-pro/wiremock-ui)](https://github.com/antoine-vaisset-pro/wiremock-ui/releases)
[![CI](https://github.com/antoine-vaisset-pro/wiremock-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/antoine-vaisset-pro/wiremock-ui/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
[![Angular](https://img.shields.io/badge/Angular-22-red)](https://angular.dev/)
[![WireMock](https://img.shields.io/badge/WireMock-3.10-green)](https://wiremock.org/)

## Try it in 30 seconds

Run the published multi-architecture image and point it at WireMock:

```bash
docker run --rm -p 4200:8080 \
  -e WIREMOCK_BACKEND=http://host.docker.internal:8080 \
  ghcr.io/antoine-vaisset-pro/wiremock-ui:latest
```

Open <http://localhost:4200>. Multiple backends can be supplied as a semicolon-separated list. They appear in the selector with an `[ENV]` badge and cannot be edited in the UI.

For a complete local stack:

```yaml
services:
  wiremock:
    image: wiremock/wiremock:3.10.0
    ports: ["8080:8080"]
  ui:
    image: ghcr.io/antoine-vaisset-pro/wiremock-ui:latest
    ports: ["4200:8080"]
    environment:
      WIREMOCK_BACKEND: http://wiremock:8080
```

## Why WireMock UI?

| Option | Best suited for | Trade-off |
|---|---|---|
| WireMock UI | Self-hosted visual management and testing | You operate the UI and WireMock server |
| Raw Admin API | Automation and scripts | No visual browsing or interactive workflow |
| WireMock Studio | Visual WireMock workflows | Proprietary product and discontinued |
| WireMock Cloud | Hosted WireMock environments | SaaS service and hosted deployment model |

WireMock UI is Apache-2.0 licensed and free for commercial and enterprise use.

## Features

### Dashboard
Overview of active stubs and recent request statistics, with time-range filters and Chart.js charts.

![Dashboard](docs/screenshots/dashboard.png)

### Stub mappings
Paginated search, detailed request/response inspection, JSON import/export, and bulk selection.

![Stub list](docs/screenshots/stub-list.png)
![Stub detail](docs/screenshots/stub-detail.png)

### Request logs
Browse matched, unmatched, and near-miss requests with filters, expandable headers, bulk deletion, and direct navigation to matching stubs.

![Request logs](docs/screenshots/request-logs.png)

### HTTP requester
Test any stub with all HTTP methods, custom headers, request bodies, and full response details.

![HTTP requester](docs/screenshots/http-requester.png)

### Recording Studio
Record stubs from a live API with URL, method, and header filters, then review and export the mappings.

![Recording Studio](docs/screenshots/recording-studio.png)

### OpenAPI stub generator
Parse OpenAPI 2 and 3 specifications, generate multiple WireMock stub variants, edit them, and import the results.

### Scenarios, settings, and help
Manage stateful WireMock scenarios, select local/environment/custom backends, and use the in-app documentation.

## Development

### Prerequisites

- Node.js >= 22.12.0 and npm
- Docker (for WireMock and the Docker image)

```bash
git clone https://github.com/antoine-vaisset-pro/wiremock-ui.git
cd wiremock-ui
make install
```

Start the full development stack with `make dev-full`, or use `make docker-up` for the production-like Nginx image. The UI is at <http://localhost:4200> and WireMock's Admin API is at <http://localhost:8080/__admin/>.

```bash
make help
make build
make test
make docker-build
make docker-down
```

### Configuration

The Angular development proxy routes `/__admin` and `/api` to `http://localhost:8080`. For a production image, set `WIREMOCK_BACKEND` at container runtime:

```bash
WIREMOCK_BACKEND=https://staging.example.com;https://prod.example.com make docker-up
```

The build-time variable remains supported by `npm run build` and `docker build --build-arg WIREMOCK_BACKEND=...`; a runtime value takes precedence.

See [docs/PRODUCTION_DEPLOYMENT.md](docs/PRODUCTION_DEPLOYMENT.md) and [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md).

## Project structure

```text
wiremock-ui/
├── src/main/webapp/          # Angular application and CHANGELOG.md
│   ├── src/app/              # Components, pages, services, and models
│   └── public/               # Runtime configuration defaults
├── docker/                   # Dockerfile, Compose, and Nginx template
├── docs/                     # Deployment, developer guide, API reference, screenshots
├── scripts/                  # Screenshot and maintenance scripts
├── Makefile                  # Development commands
├── LICENSE                   # Apache License 2.0
└── NOTICE                    # Copyright and project notice
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Please use Conventional Commits and include tests for new behavior.

## License

WireMock UI is licensed under the [Apache License 2.0](LICENSE). Versions from 1.1.0 onward are Apache-2.0 licensed.

## Acknowledgements

- [WireMock](https://wiremock.org/) — the HTTP mock server this UI is built on
- [Angular](https://angular.dev/) — the frontend framework
- [Bootstrap](https://getbootstrap.com/) — UI components
- [Chart.js](https://www.chartjs.org/) — dashboard charts (MIT License)
