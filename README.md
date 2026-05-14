# parix

`parix` is the Parix command line interface.

## Install

```bash
npm install -g @parix/parix
parix --help
```

Current commands:

- `parix auth login`
- `parix auth status`
- `parix auth logout`
- `parix api <path>`
- `parix database catalog`
- `parix database create <database>`
- `parix database list`
- `parix database info <database-id>`
- `parix database remove <database-id>`
- `parix tb create-accounts <database-id>`
- `parix tb create-transfers <database-id>`
- `parix tb lookup-accounts <database-id>`
- `parix tb lookup-transfers <database-id>`
- `parix tb get-account-transfers <database-id>`
- `parix tb get-account-balances <database-id>`
- `parix tb query-accounts <database-id>`
- `parix tb query-transfers <database-id>`

## Auth flow

- Starts a local loopback callback server on `127.0.0.1`
- Starts the Better Auth OIDC flow for the first-party `parix` client
- Opens the browser authorization flow with PKCE
- Forces the Better Auth consent screen on every `parix auth login`
- Receives an authorization code through the local callback
- Redirects the browser to the Parix success page at `/cli-oauth-consent-granted`
- Exchanges the code for access and refresh tokens
- Stores the local session at `~/.config/parix/session.json`

`parix auth status` validates the stored session, refreshes tokens if needed, and prints the authenticated user plus active organization context.

If you want to override the OIDC prompt manually, use `--prompt <value>`.

## Database commands

- `parix database catalog`: show the available provider, region, cluster config, cluster size, and storage tier options for database creation
- `parix database create <database>`: create a database in the active organization, using defaults or explicit `--provider`, `--region`, `--cluster-config-id`, `--cluster-size-id`, `--storage-tier-id`, and `--storage-gb` inputs
- `parix database list`: list databases in the active organization, including database IDs, with optional `--search`, `--limit`, and `--json`
- `parix database info <database-id>`: show database metadata, profile state, gateway URL, latest provision job, and metrics summary
- `parix database remove <database-id>`: queue database removal; use `--yes` for non-interactive runs

## TigerBeetle commands

Supported operations:

- `create-accounts`
- `create-transfers`
- `lookup-accounts`
- `lookup-transfers`
- `get-account-transfers`
- `get-account-balances`
- `query-accounts`
- `query-transfers`

TigerBeetle commands support both styles:

- flag-driven payloads for common workflows such as `--from`, `--to`, `--amount`, `--ledger`, `--code`, repeated `--id`, and repeated `--flag`
- raw JSON overrides with `--payload '<json>'` or `--file ./payload.json`

Operational notes:

- database and TB commands use the active organization from the current `parix` token
- `db:read` and `db:write` OIDC scopes are enforced on the Worker API surface
- newly provisioned databases may take a short time to become ready for TB operations; the CLI/API includes readiness retries for fresh databases

## Development

```bash
bun install
bun run build
bun run test
bun run typecheck
bun run cli -- auth login --base-url http://localhost:5173
bun run cli -- auth status --base-url http://localhost:5173
bun run cli -- api /api/v1/session --base-url http://localhost:5173
bun run cli -- database catalog --json
bun run cli -- database create demo-ledger --provider gcp --region asia-southeast1 --json
bun run cli -- database list --json
bun run cli -- database info <database-id>
bun run cli -- database remove <database-id> --yes --json
bun run cli -- tb query-accounts <database-id> --limit 10 --json
bun run cli -- tb create-transfers <database-id> --from 1000 --to 1001 --amount 1 --ledger 1 --code 1
```

You can override the target app URL with `--base-url` or `HTX_BASE_URL`.

## Publishing

```bash
bun run publish:check
bun run publish:npm
```

`publish:check` runs formatting, linting, tests, type checking, a fresh build, and `npm pack --dry-run` using a repo-local npm cache directory. `publish:npm` publishes the package publicly to npmjs.com using that same local cache.

## GitHub Actions

- `.github/workflows/ci.yml` runs lint, tests, typecheck, build, and `npm pack --dry-run` on pushes and pull requests
- `.github/workflows/publish.yml` publishes to npm when a GitHub Release is published, using the `NPM_ACCESS_TOKEN` secret, and uploads the published npm tarball to the GitHub Release

Recommended release flow:

```bash
# bump version in package.json
git tag v0.1.2
git push origin main --tags
```

Then publish a GitHub Release from tag `v0.1.2`. The publish workflow verifies that the release tag matches `package.json`, packs the npm tarball, publishes that tarball to npm, and uploads the same `.tgz` as a GitHub Release asset.
