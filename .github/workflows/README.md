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

### 2. deploy-netlify.yml
Builds and deploys the Angular application to Netlify.

**Triggers:**
- Manual workflow dispatch only

**Required Secrets:**
- `NETLIFY_AUTH_TOKEN`
- `NETLIFY_SITE_ID`
- `WIREMOCK_URL` (optional)

### 6. pr-comment-hooks.yml
Responds to PR comments with special commands.

**Triggers:**
- Issue comment events (on PRs only)

**Commands:**
| Command | Description | Permissions |
|---------|-------------|-------------|
| `/build` | Builds the PR branch and reports status | Anyone |
| `/deploy` | Deploys PR to Netlify preview | Anyone |
| `/rebase` | Rebases PR on target branch | Collaborators with write access only |

**Required Secrets (for /deploy):**
- `NETLIFY_AUTH_TOKEN`
- `NETLIFY_SITE_ID`
- `WIREMOCK_URL` (optional)

**Security:**
- Build/deploy jobs run with read-only permissions
- npm caching disabled to prevent cache poisoning
- Rebase requires collaborator write access verification
- Comments posted by separate jobs without code checkout

## Usage Examples

### Manual GitHub Pages Deploy
1. Go to Actions tab
2. Select "Deploy to GitHub Pages"
3. Click "Run workflow"

### Manual Netlify Deploy
1. Go to Actions tab
2. Select "Deploy to Netlify"
3. Click "Run workflow"

### PR Comment Commands
On any Pull Request, post a comment with:
```
/build
```
or
```
/deploy
```
or (if you're a collaborator with write access)
```
/rebase
```

The workflow will automatically execute and post a result comment.

### 7. bump-and-release.yml ⚠️ DEPRECATED
Manual emergency workflow kept for backup only. Use release-please instead.

**Triggers:** Manual (`workflow_dispatch`) only

---

## Development

To test workflow changes:
1. Create a test branch
2. Open a PR
3. Use the comment commands to trigger workflows
4. Check workflow logs in the Actions tab

## Security Notes

All workflows follow security best practices:
- Minimal permissions per job
- No caching for untrusted PR code
- Permission checks for privileged operations
- Secrets never exposed to untrusted code
- Separate jobs for privileged vs unprivileged operations
