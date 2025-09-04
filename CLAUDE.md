# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Cloudflare Worker backend built with Hono (web framework) and TypeScript, featuring server-side rendered JSX components. The application runs on Cloudflare's edge runtime.

## Development Commands

- `npm install` - Install dependencies
- `npm run dev` - Start development server with hot reload using Vite
- `npm run build` - Build for production
- `npm run preview` - Build and preview production build locally
- `npm run deploy` - Build and deploy to Cloudflare Workers
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
- `wrangler.jsonc` - Cloudflare Workers configuration
- `vite.config.ts` - Vite configuration with Cloudflare and SSR plugins

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

When working with Cloudflare bindings (KV, D1, R2, etc.), use the generated types:

```typescript
const app = new Hono<{ Bindings: CloudflareBindings }>()
```

Run `npm run cf-typegen` after modifying `wrangler.jsonc` to regenerate binding types.

## Development Notes

- JSX components are rendered server-side using Hono's JSX renderer
- CSS is loaded via the ViteClient component in the renderer
- The build outputs to `dist/` for the client and `dist-server/` for the worker
- Environment variables should be defined in `.dev.vars` for local development
