# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Vendure plugin for passwordless email OTP authentication. Fork of `@denz93/vendure-plugin-simple-auth`, updated for Vendure 3.x. Published as `vendure-plugin-email-otp` on npm.

## Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Clean dist/ and compile TypeScript (also copies email templates via postbuild)
pnpm test             # Run tests with Vitest
pnpm test:watch       # Run tests in watch mode
pnpm lint             # Prettier format + check, then ESLint fix
pnpm format           # Prettier format only
pnpm coverage         # Coverage report (Istanbul)
```

Run a single test by name:

```bash
pnpm vitest run -t "test name substring"
```

## Architecture

The plugin follows Vendure's NestJS-based plugin pattern with these core components:

- **SimpleAuthPlugin** (`simple-auth.module.ts`) — Main `@VendurePlugin` class. Registers cache module, GraphQL schema extensions, resolver, and auth strategy. On bootstrap, auto-registers the email handler and copies the email template to EmailPlugin's template directory.
- **SimpleAuthService** (`simple-auth.service.ts`) — OTP business logic: code generation (using `crypto.randomInt`), verification with attempt tracking, and cache management. Cache keys follow `simple-auth-service:{email}` pattern.
- **SimpleAuthResolver** (`simple-auth.resolver.ts`) — Exposes `requestOneTimeCode(email)` GraphQL query. Validates email with `isemail`, fires `OneTimeCodeRequestedEvent` via Vendure's EventBus.
- **SimpleAuthStrategy** (`simple-auth-strategy.ts`) — Implements Vendure's `AuthenticationStrategy`. Used via `authenticate` mutation with `{ simple: { email, code } }`. Creates customer/user on first login automatically.
- **Email handler** (`email-handler.ts`) — EmailPlugin event listener for `onetimecode-requested`. Auto-registered by the plugin (no manual config needed since v1.3.0).

### Initialization flow

1. `onModuleInit` — Registers email event handler with EmailPlugin (if not already present)
2. `onApplicationBootstrap` — Copies MJML email template from `src/template/` to EmailPlugin's templatePath
3. Plugin configuration callback — Pushes `SimpleAuthStrategy` into `shopAuthenticationStrategy`

### Static configuration pattern

`SimpleAuthPlugin.init(options)` merges user options with `DEFAULT_OPTIONS` and stores them on the static `SimpleAuthPlugin.options` property. Options are injected via a `Symbol`-based DI token (`SIMPLE_AUTH_PLUGIN_OPTIONS`).

## Code Style

- Tabs for indentation, single quotes, 100-char print width, no trailing commas (see `.prettierrc`)
- Unused variables must start with `_` (ESLint rule)
- Emails are normalized to lowercase at validation and authentication layers

## Testing

Tests are integration tests using `@vendure/testing` with an in-memory SQLite database (`sql.js`). The test suite bootstraps a full Vendure server with EmailPlugin and exercises the GraphQL API. Email output is written to `src/test/__data__/email/output/` (gitignored). Tests require native `bcrypt` compilation — CI environments need build tools (`build-essential`).

## Publishing

The npm publish workflow (`.github/workflows/public-package-npmjs.yml`) triggers on `v*` tags:

```bash
git tag v3.0.1
git push origin v3.0.1
```

Requires `NPM_TOKEN` secret configured in GitHub repo settings.
