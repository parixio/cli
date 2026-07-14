# Repository Guidelines

## Project Structure & Module Organization

This repository is the **`@parix/cli`** npm package. The user-facing binary is **`parix`**. Source lives in `src/`.

- `src/cli.ts`: entrypoint that wires Commander subcommands together.
- `src/commands/`: top-level command groups such as `auth`, `api`, `database`, and `tb`.
- `src/lib/`: shared API clients, session handling, OAuth helpers, output formatting, and TigerBeetle payload helpers.

## Package identity

| Item | Value |
|------|--------|
| npm package | `@parix/cli` |
| CLI binary | `parix` |
| Install | `npm install -g @parix/cli` |
| Previous name | `@parix/parix` (deprecated rename) |

Do not rename the binary away from `parix` when changing the package name.

## Build, Test, and Development Commands

Use `bun` for package commands.

- `bun install`: install dependencies.
- `bun run build`: compile the CLI with `zshy` into `dist/`.
- `bun run build:link`: build and `bun link` the package for local shell testing.
- `bun run lint`: run Oxlint on `src/` and `test/`.
- `bun run lint:fix`: apply safe lint fixes.
- `bun run test`: run the Bun regression tests.
- `bun run typecheck`: run TypeScript without emitting files.
- `bun run cli -- auth status --base-url http://localhost:5173`: run the built CLI against a local app.
- `bun run publish:check`: full pre-publish validation (fmt, lint, test, typecheck, build, pack dry-run).
- `bun run publish:npm`: publish `@parix/cli` publicly to npm.
