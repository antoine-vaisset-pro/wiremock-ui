# WireMock Web UI

A modern web interface for managing and testing [WireMock](https://wiremock.org/) mock servers — built with Angular.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
![Version](https://img.shields.io/badge/version-0.5.5-orange)
![Angular](https://img.shields.io/badge/Angular-21-red)
![WireMock](https://img.shields.io/badge/WireMock-3.10-green)
![Node](https://img.shields.io/badge/Node.js-%3E%3D22-brightgreen)

## Overview

**WireMock Web UI** is a graphical interface for [WireMock](https://wiremock.org/), the leading HTTP mock server. Instead of editing raw JSON files or calling the Admin API directly, this app gives you a clean web interface with search, filtering, real-time request inspection, and an integrated HTTP testing client.

### Architecture

```
┌─────────────────────┐
│   Angular Web UI    │  http://localhost:4200
│   (Port 4200)       │
└─────────┬───────────┘
          │ REST API
          ▼
┌─────────────────────┐
│  WireMock Server    │  http://localhost:8080
│  (Port 8080)        │
│  Docker/Standalone  │
└─────────────────────┘
```

## Features

### 📊 Dashboard
- Overview of active stubs and recent request statistics
- Time-range filters (Last Hour, Last 24h, Today, Last 7 days)
- Charts and counters powered by Highcharts

### 📋 Stub Mappings
- Paginated list of stub mappings (20 per page)
- Real-time search by URL, method, name, or JSON body
- Color-coded HTTP method badges (GET, POST, PUT, DELETE, etc.)
- Detailed view with formatted JSON for request and response
- **Import stubs** from a JSON file — supports both `[...]` and `{"mappings": [...]}` formats, with preview before applying
- **Export stubs** — export all stubs or a selection to a JSON file
- **Bulk selection** — select individual stubs to export or delete in one action

### 📜 Request Logs
- Full history of requests received by WireMock
- Filter by match status: Matched / Unmatched / Near-miss (>90%)
- Filter by time range, HTTP method, and response code
- Smart status badges: 🟢 MATCHED, 🔵 NEAR-MISS, 🟡 UNMATCHED
- Expandable headers, bulk selection, and bulk delete
- One-click navigation from a request to its matching stub

### 🚀 HTTP Requester
- Built-in HTTP client to test your stubs directly from the UI
- Supports all HTTP methods
- Pre-fill from an existing stub for fast testing
- Custom headers support
- Full response display: status, headers, body, and response time

### 🎙️ Recording Studio
- Automatically record stubs from a real API target
- Advanced configuration: URL filters, methods, headers
- Real-time recording status with automatic polling
- Save and reload named recording configurations
- Export recorded mappings

### 🎭 Scenarios
- View and manage WireMock stateful scenarios
- Reset scenario state

### ⚙️ Settings & Help
- Runtime configuration management
- In-app help and documentation

## Quick Start

### Prerequisites

- **Node.js** ≥ 22.12.0 and npm
- **Docker** (for running WireMock)

### Installation

```bash
# Clone the repository
git clone https://github.com/antoine-vaisset-pro/wiremock-ui.git
cd wiremock-ui

# Install npm dependencies
make install
```

### Run (recommended)

Start WireMock and the Angular UI together:

```bash
make dev-full
```

Then open your browser at **http://localhost:4200**.

### Alternative: Docker Compose

```bash
make docker-up
```

Access the UI at **http://localhost:4200** and the WireMock Admin API at **http://localhost:8080/__admin/**.

Stop with:
```bash
make docker-down
```

## Service URLs

| Service           | URL                                    | Description              |
|-------------------|----------------------------------------|--------------------------|
| **Web UI**        | http://localhost:4200                  | Angular interface        |
| WireMock Admin    | http://localhost:8080/__admin/         | WireMock Admin REST API  |
| WireMock Mappings | http://localhost:8080/__admin/mappings | Raw JSON stub list       |
| Mock endpoints    | http://localhost:8080/...              | Your mocked API routes   |

## Project Structure

```
wiremock-ui/
├── src/main/webapp/          # Angular application
│   └── src/app/
│       ├── components/       # Shared components (sidebar, etc.)
│       ├── pages/            # Feature pages (stubs, requests, requester, ...)
│       ├── services/         # Angular services (WireMock API calls)
│       └── models/           # TypeScript interfaces
├── mappings/                 # Example WireMock stub mappings
├── docker/                   # Dockerfile and Nginx configuration
├── docs/                     # Developer and deployment guides
├── Makefile                  # Development commands
└── CHANGELOG.md              # Version history
```

## Make Commands

```bash
make help           # List all available commands
make install        # Install npm dependencies
make dev            # Start Angular dev server (WireMock must already be running)
make wiremock       # Start WireMock standalone via Docker
make dev-full       # Start WireMock + Angular together (recommended)
make build          # Production build
make test           # Run unit tests
make clean          # Remove generated files
make docker-build   # Build the Docker image
make docker-up      # Start via Docker Compose
make docker-down    # Stop Docker Compose services
```

## Configuration

### Development

The Angular dev server proxies all `/__admin` and `/api` calls to `http://localhost:8080` via `proxy.conf.js`. No extra configuration is needed.

### Selecting a WireMock backend at runtime

The **server selector** in the top-right corner of the app lets you switch between backends without restarting. The choice is persisted in `localStorage`. You can manage custom backends in **Settings → Custom Backends**.

> **Note:** enter base URLs **without** the `/__admin` suffix (e.g. `http://my-server:8080`). The UI appends `/__admin` automatically.

### Production / Custom WireMock URL

Set the `WIREMOCK_BACKEND` environment variable to a semicolon-separated list of base URLs before building:

```bash
# Single backend
export WIREMOCK_BACKEND=https://your-wiremock-host:8080
npm run build

# Multiple backends
export WIREMOCK_BACKEND=https://staging.example.com;https://prod.example.com
npm run build
```

These URLs appear in the backend selector with an `[ENV]` badge and cannot be edited from the UI.

See [docs/PRODUCTION_DEPLOYMENT.md](docs/PRODUCTION_DEPLOYMENT.md) for full Docker and Nginx deployment instructions.

## Troubleshooting

**UI shows "Connection error"**

Verify WireMock is running and reachable:
```bash
curl http://localhost:8080/__admin/mappings
```

**CORS errors in development**

Make sure the Angular proxy is active. Restart with `make dev` and verify `proxy.conf.js` is referenced in `angular.json`.

**Port already in use**

Stop the process occupying port 4200 (Angular dev server) or 8080 (WireMock) before starting.

## Documentation

- [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) — Local setup, architecture, and contribution guidelines
- [docs/PRODUCTION_DEPLOYMENT.md](docs/PRODUCTION_DEPLOYMENT.md) — Docker, Nginx, and environment variables
- [CHANGELOG.md](CHANGELOG.md) — Version history

## Contributing

Contributions are welcome!

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'Add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

Please follow the existing code style and add tests for new features where applicable.

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE).

## Acknowledgements

- [WireMock](https://wiremock.org/) — the HTTP mock server this UI is built on top of
- [MockServer](https://www.mock-server.com/) — another open-source mock server (no longer maintained) that inspired the idea of generating stubs from an OpenAPI specification
- [Angular](https://angular.dev/) — the frontend framework
- [Bootstrap](https://getbootstrap.com/) — UI components
- [Highcharts](https://www.highcharts.com/) — dashboard charts
