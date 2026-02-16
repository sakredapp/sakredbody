# Sakred Body — Mastermind + Retreats Platform

## Overview

Sakred Body is a premium health mastermind and retreat platform targeting entrepreneurs and high-capacity professionals. The site has two main areas:

1. **Public Landing Page** (`/`) — Program information, application form, brand storytelling
2. **Member Portal** (`/member`) — Concierge-style retreat booking system (Inspirato/Airbnb-inspired) where members browse upcoming retreats, select housing tiers, and submit booking requests handled by the Sakred Body concierge team

The application is a full-stack TypeScript project with a React frontend served by an Express backend, backed by a PostgreSQL database with Replit Auth for member authentication.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript, bundled by Vite
- **Routing**: Wouter — `/` (Landing), `/member` (Member Dashboard), 404 page
- **UI Components**: shadcn/ui (new-york style) built on Radix UI primitives with Tailwind CSS
- **Styling**: Tailwind CSS with CSS custom properties for theming. Custom "Sakred" brand palette with gold accents (--gold HSL variables), warm earth tones
- **State/Data**: TanStack React Query for server state; react-hook-form + Zod for form handling and validation
- **Animations**: Framer Motion for scroll animations and entry effects
- **Fonts**: Playfair Display (display/headers), DM Sans (body text) loaded via Google Fonts
- **Path aliases**: `@/` maps to `client/src/`, `@shared/` maps to `shared/`, `@assets/` maps to `attached_assets/`
- **Auth**: `useAuth()` hook from `@/hooks/use-auth.ts` for authentication state

### Backend
- **Runtime**: Node.js with Express 5
- **Language**: TypeScript, executed via `tsx` in development
- **Authentication**: Replit Auth (OpenID Connect) via `server/replit_integrations/auth/`
  - Auth is set up BEFORE other routes in `server/index.ts`
  - Login: `/api/login`, Logout: `/api/logout`, User: `/api/auth/user`
  - Protected routes use `isAuthenticated` middleware
- **API Endpoints**:
  - `POST /api/applications` — Submit program application (public)
  - `GET /api/retreats` — List active retreats (public)
  - `GET /api/retreats/:id` — Get single retreat (public)
  - `GET /api/retreats/:id/properties` — List properties for a retreat (public)
  - `POST /api/booking-requests` — Create booking request (auth required)
  - `GET /api/booking-requests/me` — Get user's booking requests (auth required)
- **Development**: Vite dev server is integrated as middleware for HMR during development (see `server/vite.ts`)
- **Production**: Client is built to `dist/public`, server is bundled with esbuild to `dist/index.cjs`

### Shared Layer (`shared/`)
- **Schema** (`shared/schema.ts`): Drizzle ORM table definitions and Zod validation schemas. Re-exports auth models from `shared/models/auth.ts`
- **Routes** (`shared/routes.ts`): API contract definitions with paths, methods, input schemas
- **Auth Models** (`shared/models/auth.ts`): Users and sessions tables for Replit Auth

### Database
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Connection**: Uses `pg` Pool with SSL enabled. Looks for `SAKREDBODY_DATABASE_URL` first, then falls back to `DATABASE_URL`
- **IMPORTANT**: When running `npm run db:push`, must override DATABASE_URL: `DATABASE_URL=$SAKREDBODY_DATABASE_URL npm run db:push`
- **Migrations**: Output directory is `./migrations`
- **Seed Script**: `npx tsx server/seed.ts` seeds retreats and properties

### Database Schema
Tables:
- **users**: Replit Auth user storage (id varchar PK, email, firstName, lastName, profileImageUrl, timestamps)
- **sessions**: Replit Auth session storage (sid varchar PK, sess jsonb, expire timestamp)
- **applications**: Program applications (id serial PK, name, email, goals, stressLevel, willingness, constraints, whyNow, createdAt)
- **retreats**: Retreat events (id serial PK, name, location, description, startDate, endDate, capacity, imageUrl, active)
- **properties**: Housing options per retreat (id serial PK, retreatId FK, name, tier [standard/premium/elite], description, bedrooms, bathrooms, maxGuests, pricePerNight, imageUrl, amenities text[], available)
- **booking_requests**: Member booking requests (id serial PK, userId FK, retreatId FK, propertyId FK, status [requested/confirmed/completed/cancelled], guestCount, specialRequests, conciergeNotes, timestamps)

### Key Design Decisions
1. **Concierge model**: Members browse and request bookings; the Sakred Body team reviews and confirms. Bookings flow: requested → confirmed → completed
2. **Housing tiers**: Three levels — Essential (standard), Premium, Elite — with increasing amenities and pricing
3. **Replit Auth**: OpenID Connect authentication supporting Google, GitHub, email/password
4. **Shared route contracts**: API paths and Zod schemas shared between client and server
5. **Storage abstraction**: `server/storage.ts` uses an `IStorage` interface with `DatabaseStorage` implementation
6. **Stock images**: Property and retreat images stored in `client/public/images/`

## External Dependencies

### Database
- **PostgreSQL**: Required. Connection string via `SAKREDBODY_DATABASE_URL` or `DATABASE_URL`. SSL enabled with `rejectUnauthorized: false`

### External Services
- **Replit Auth**: OpenID Connect provider for member authentication

### Key npm Packages
- **drizzle-orm** + **drizzle-kit**: Database ORM and migration tooling
- **express**: HTTP server
- **passport** + **openid-client**: Authentication
- **express-session** + **connect-pg-simple**: Session management
- **@tanstack/react-query**: Client-side data fetching/caching
- **react-hook-form** + **@hookform/resolvers**: Form management with Zod validation
- **framer-motion**: Animation library
- **wouter**: Lightweight client-side routing
- **shadcn/ui** components (Radix UI + Tailwind CSS)
