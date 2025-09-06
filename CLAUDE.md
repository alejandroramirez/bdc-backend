# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Cloudflare Worker backend built with Hono (web framework) and TypeScript, featuring server-side rendered JSX components. The application runs on Cloudflare's edge runtime.

## Development Commands

- `npm install` - Install dependencies
- `npm run dev` - Start development server using Wrangler
- `npm run build` - Build for production (includes type checking)
- `npm run typecheck` - Run TypeScript type checking
- `npm run preview` - Build and preview production build locally
- `npm run deploy` - Build and deploy to development environment
- `npm run deploy:staging` - Build and deploy to staging environment
- `npm run deploy:production` - Build and deploy to production environment
- `npm run cf-typegen` - Generate TypeScript types for Cloudflare bindings

## Architecture

### Core Stack

- **Runtime**: Cloudflare Workers
- **Framework**: Hono for web server functionality
- **Build Tool**: Vite with Cloudflare plugin
- **Styling**: Plain CSS with SSR support via vite-ssr-components
- **JSX**: Hono's JSX renderer for server-side rendering

### Key Files

- `src/index.tsx` - Main application entry point, defines routes using Hono
- `src/renderer.tsx` - JSX renderer configuration for HTML document structure  
- `src/style.css` - Application styles
- `wrangler.toml` - Cloudflare Workers configuration with environment settings
- `vite.config.ts` - Vite configuration with Cloudflare and SSR plugins
- `worker-configuration.d.ts` - TypeScript bindings for Cloudflare environment variables

### Project Structure

```
src/
├── index.tsx     # Main Hono app with routes
├── renderer.tsx  # JSX renderer for HTML document structure
└── style.css     # Application styles
public/
├── favicon.ico   # Site favicon
└── .assetsignore # Asset ignore configuration
```

## Cloudflare Workers Integration

### Environment Configuration

The project uses Cloudflare Workers environments for different deployment stages:
- **Development** (default): Local development with `wrangler dev`
- **Staging**: `wrangler deploy --env staging`
- **Production**: `wrangler deploy --env production`

### Environment Detection

Use `c.env.ENVIRONMENT` to detect the current environment in your Hono routes:

```typescript
const isDevelopment = c.env.ENVIRONMENT === 'development'
```

### TypeScript Bindings

When working with Cloudflare bindings, use the generated types:

```typescript
const app = new Hono<{ Bindings: CloudflareBindings }>()
```

Run `npm run cf-typegen` after modifying `wrangler.toml` to regenerate binding types.

## Development Notes

- JSX components are rendered server-side using Hono's JSX renderer
- CSS is loaded via the ViteClient component in the renderer
- The build outputs to `dist/` for the client and `dist-server/` for the worker

### Environment Variables

- **Local Development**: Define variables in `.dev.vars` file
- **Production**: Set secrets using `wrangler secret put` or Cloudflare dashboard
- **Environment Detection**: Use `c.env.ENVIRONMENT` instead of `process.env.NODE_ENV`

### Secret Management

- Never commit `.dev.vars` files to git (already in .gitignore)
- Use environment-specific files: `.dev.vars.staging`, `.dev.vars.production`
- For sensitive data, use `wrangler secret put` command instead of plain variables
