# Sakred Body — Mastermind + Retreats Landing Page

## Overview

Sakred Body is a single-page landing site for a premium health mastermind and retreat program targeting entrepreneurs and high-capacity professionals. The site presents program information and collects applications through a modal form. The application is a full-stack TypeScript project with a React frontend served by an Express backend, backed by a PostgreSQL database.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript, bundled by Vite
- **Routing**: Wouter (lightweight client-side router) — currently just `/` (Landing) and a 404 page
- **UI Components**: shadcn/ui (new-york style) built on Radix UI primitives with Tailwind CSS
- **Styling**: Tailwind CSS with CSS custom properties for theming (light/dark mode support via HSL variables). Custom color palette designed around a warm, earthy "Sakred" brand aesthetic
- **State/Data**: TanStack React Query for server state; react-hook-form + Zod for form handling and validation
- **Animations**: Framer Motion for scroll animations and entry effects
- **Fonts**: Playfair Display (display/headers), DM Sans (body text) loaded via Google Fonts
- **Path aliases**: `@/` maps to `client/src/`, `@shared/` maps to `shared/`

### Backend
- **Runtime**: Node.js with Express 5
- **Language**: TypeScript, executed via `tsx` in development
- **API**: Single REST endpoint — `POST /api/applications` for submitting program applications
- **Development**: Vite dev server is integrated as middleware for HMR during development (see `server/vite.ts`)
- **Production**: Client is built to `dist/public`, server is bundled with esbuild to `dist/index.cjs`

### Shared Layer (`shared/`)
- **Schema** (`shared/schema.ts`): Drizzle ORM table definitions and Zod validation schemas (using `drizzle-zod`). Single table: `applications`
- **Routes** (`shared/routes.ts`): API contract definitions with paths, methods, input schemas, and response schemas — shared between client and server for type safety

### Database
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Connection**: Uses `pg` Pool with SSL enabled. Looks for `SAKREDBODY_DATABASE_URL` first, then falls back to `DATABASE_URL`
- **Schema push**: `npm run db:push` uses `drizzle-kit push` to sync schema to the database
- **Migrations**: Output directory is `./migrations`

### Database Schema
One table:
- **applications**: `id` (serial PK), `name` (text), `email` (text), `goals` (text), `stressLevel` (text), `willingness` (text), `constraints` (text), `whyNow` (text), `createdAt` (timestamp, default now)

### Key Design Decisions
1. **Shared route contracts**: The `shared/routes.ts` file defines API paths and Zod schemas used by both server-side validation and client-side form handling, ensuring type safety across the stack
2. **No authentication**: This is a public-facing landing page with a simple application form — no auth needed
3. **Single-page architecture**: The entire site is one Landing page component with multiple sections and a modal for the application form
4. **Storage abstraction**: `server/storage.ts` uses an `IStorage` interface with a `DatabaseStorage` implementation, allowing the storage layer to be swapped if needed

## External Dependencies

### Database
- **PostgreSQL**: Required. Connection string must be provided via `SAKREDBODY_DATABASE_URL` or `DATABASE_URL` environment variable. SSL is enabled with `rejectUnauthorized: false` (designed for hosted Postgres like Supabase/Neon)

### External Services
- None currently integrated (no auth providers, payment processors, or email services are active)

### Key npm Packages
- **drizzle-orm** + **drizzle-kit**: Database ORM and migration tooling
- **express**: HTTP server
- **@tanstack/react-query**: Client-side data fetching/caching
- **react-hook-form** + **@hookform/resolvers**: Form management with Zod validation
- **framer-motion**: Animation library
- **wouter**: Lightweight client-side routing
- **shadcn/ui** components (Radix UI + Tailwind CSS)
- **connect-pg-simple**: Session store (available but not currently used)