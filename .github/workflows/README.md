# GitHub Actions Workflows

This directory contains GitHub Actions workflows for the WireMock UI project.

## Release Pipeline

The release process is fully automated via [release-please](https://github.com/googleapis/release-please):

```
push to main (conventional commits)
        │
        ▼
release-please.yml  ──►  opens/updates a "Release PR"
                          (bumps version in package.json + updates CHANGELOG.md)
        │
        │  (merge Release PR)
        ▼
release-please creates tag vX.Y.Z + GitHub Release
        │
        ▼
release.yml  ──►  build · test · archive → attach .tar.gz to the GitHub Release
        │
        ▼
docker-publish.yml  ──►  build & push Docker image to GHCR
```

### Conventional Commits → Version bump rules
| Commit prefix | Bump |
|---------------|------|
| `feat:` | minor (`0.x` → `0.x+1`) |
| `fix:`, `perf:`, `refactor:` | patch |
| `feat!:` / `BREAKING CHANGE` | major |
| `chore:`, `docs:`, `ci:`, `test:` | no bump |

---

## Workflows

### 1. release-please.yml ⭐
Automates versioning, changelog, tagging and GitHub Release creation.

**Triggers:** Push to `main`

**Permissions:** contents: write, pull-requests: write

### 2. release.yml
Builds, tests, and attaches the release archive to the GitHub Release created by release-please.

**Triggers:** `release: published` (fired automatically when release-please merges its PR)

**Artifacts:** `wiremock-ui-vX.Y.Z.tar.gz` attached to the GitHub Release

### 3. ci.yml
Lint, security audit, unit tests with coverage on every push/PR to `main`.

### 4. docker-publish.yml
Builds and pushes the Docker image to GHCR on every published release.

### 5. deploy-github-pages.yml
Builds and deploys the Angular application to GitHub Pages.

**Triggers:**
- Push to any branch (build only)
- Pull requests (build + comment)
- Manual workflow dispatch (build + deploy)

**Permissions:** contents: read, pages: write, id-token: write, pull-requests: write

## Usage Examples

### Manual GitHub Pages Deploy
1. Go to Actions tab
2. Select "Deploy to GitHub Pages"
3. Click "Run workflow"

### Manual Netlify Deploy
1. Go to Actions tab
2. Select "Deploy to Netlify"
3. Click "Run workflow"

---

## Security Notes

All workflows follow security best practices:
- Minimal permissions per job
- No caching for untrusted PR code
- Permission checks for privileged operations
- Secrets never exposed to untrusted code
- Separate jobs for privileged vs unprivileged operations
