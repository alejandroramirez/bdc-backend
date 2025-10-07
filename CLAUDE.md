# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Cloudflare Worker backend built with Hono (web framework) and TypeScript, featuring server-side rendered JSX components. The application runs on Cloudflare's edge runtime.

## Development Commands

**Note**: This project uses `pnpm` as the package manager.

- `pnpm install` - Install dependencies
- `pnpm run dev` - Start development server using Vite (hot reload)
- `pnpm run dev:wrangler` - Start development server using Wrangler
- `pnpm run dev:full` - Build and start Wrangler dev server
- `pnpm run build` - Build for production (includes type checking)
- `pnpm run typecheck` - Run TypeScript type checking
- `pnpm run preview` - Build and preview production build locally
- `pnpm run deploy` - Build and deploy to development environment
- `pnpm run deploy:staging` - Build and deploy to staging environment
- `pnpm run deploy:production` - Build and deploy to production environment
- `pnpm run cf-typegen` - Generate TypeScript types for Cloudflare bindings
- `pnpm run lint` - Run ESLint
- `pnpm run lint:fix` - Run ESLint with auto-fix
- `pnpm run format` - Format code with Prettier
- `pnpm run format:check` - Check code formatting

## Architecture

### Core Stack

- **Runtime**: Cloudflare Workers
- **Framework**: Hono with OpenAPI/Zod validation (@hono/zod-openapi)
- **Build Tool**: Vite with Cloudflare plugin
- **Package Manager**: pnpm
- **API Documentation**: Swagger UI (available at `/docs`)
- **Rate Limiting**: @hono-rate-limiter/cloudflare with KV persistence
- **Validation**: Zod schemas for request/response validation

### Key Files

- `src/index.tsx` - Main application entry point with OpenAPI Hono setup
- `src/routes/phone-validation.ts` - Phone validation API endpoint with NumVerify integration
- `src/middleware/standard-rate-limiter.ts` - Standard rate limiting middleware
- `wrangler.toml` - Cloudflare Workers configuration with environment settings and KV bindings
- `vite.config.ts` - Vite configuration with Cloudflare and SSR plugins
- `worker-configuration.d.ts` - TypeScript bindings for Cloudflare environment variables
- `.env.example` - Sample environment variables file

### Project Structure

```
src/
├── index.tsx                        # Main OpenAPI Hono app with routes
├── routes/
│   └── phone-validation.ts          # Phone validation endpoint with NumVerify
├── middleware/
│   └── standard-rate-limiter.ts     # Rate limiting middleware
public/
├── favicon.ico                      # Site favicon
└── .assetsignore                    # Asset ignore configuration
```

## API Endpoints

### Available Endpoints

- `GET /` - API information and available endpoints
- `GET /docs` - Swagger UI documentation
- `GET /openapi.json` - OpenAPI specification
- `GET /api/validate-phone` - Phone validation endpoint (requires `number` and `country_code` query params)

### Phone Validation API

The phone validation endpoint integrates with NumVerify API:
- Requires `NUMVERIFY_API_KEY` environment variable
- Rate limited using Cloudflare KV storage
- CORS configured for biodentalcare.com (and localhost in development)
- Returns simplified response: `{ "valid": boolean }`

## Cloudflare Workers Integration

### Environment Configuration

The project uses Cloudflare Workers environments for different deployment stages:
- **Development** (default): Local development with `wrangler dev`
- **Staging**: `wrangler deploy --env staging`
- **Production**: `wrangler deploy --env production`

Each environment has its own KV namespace for rate limiting.

### Environment Detection

Use `c.env.ENVIRONMENT` to detect the current environment in your Hono routes:

```typescript
const isDevelopment = c.env.ENVIRONMENT === 'development'
```

### TypeScript Bindings

When working with Cloudflare bindings, use the generated types:

```typescript
const app = new OpenAPIHono<{ Bindings: CloudflareBindings }>()
```

Run `pnpm run cf-typegen` after modifying `wrangler.toml` to regenerate binding types.

### KV Namespaces

The project uses Cloudflare KV for rate limiting:
- `RATE_LIMIT_KV` - Stores rate limit data per widget/origin

## Development Notes

### Setup

1. Copy `.env.example` to `.dev.vars` for local development
2. Add your `NUMVERIFY_API_KEY` to `.dev.vars`
3. Run `pnpm install` to install dependencies
4. Run `pnpm run dev` for hot-reload development with Vite

### Environment Variables

- **Local Development**: Define variables in `.dev.vars` file (copy from `.env.example`)
- **Production**: Set secrets using `wrangler secret put` or Cloudflare dashboard
- **Environment Detection**: Use `c.env.ENVIRONMENT` instead of `process.env.NODE_ENV`

Required environment variables:
- `NUMVERIFY_API_KEY` - API key for NumVerify phone validation service
- `ENVIRONMENT` - Automatically set by wrangler.toml (development/staging/production)

### Secret Management

- Never commit `.dev.vars` files to git (already in .gitignore)
- Use `.env.example` as a template for required variables
- For production secrets, use `wrangler secret put NUMVERIFY_API_KEY` command

### Rate Limiting

Rate limiting is automatically disabled in these scenarios:
- When running in Vite dev mode (localhost:5173)
- When KV namespace is not available
- When KV operations fail

This allows for seamless local development without needing KV setup.

## Git Commit Guidelines

### Commit Message Style

- **No attribution required**: Commits should not include Claude Code attribution or co-authored-by tags
- **Task-based organization**: When multiple files are updated, organize commits by logical tasks rather than combining unrelated changes
- **Clear, concise messages**: Use imperative mood (e.g., "Add rate limiting" not "Added rate limiting")

### Examples

**Good - Single task commit:**
```
Add advanced rate limiting with KV persistence

- Install @hono-rate-limiter/cloudflare package
- Configure WorkersKV store for rate limiting
- Add widget-aware request fingerprinting
- Update wrangler.toml with KV namespace bindings
```

**Good - Separate commits for different tasks:**
```
Commit 1: "Implement environment detection system"
Commit 2: "Add phone validation error handling"
Commit 3: "Update deployment configuration"
```

**Avoid - Mixed unrelated changes:**
```
❌ "Update rate limiting, fix CORS, add docs, refactor types"
```
