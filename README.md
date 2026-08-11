# PISTA

PISTA is an 18+ random 1-to-1 video and text chat platform. This repo is the
foundation (Phase 1 of 12) — project structure, tooling, and configuration.
Matchmaking, WebRTC, chat, moderation, and the admin dashboard are built in
later phases on top of this skeleton.

## Architecture overview

```
pista/
├── apps/
│   ├── web/          Next.js 14 (App Router) + TypeScript + Tailwind — all
│   │                  user-facing UI: landing page, age gate, auth, chat UI,
│   │                  admin dashboard.
│   └── server/        Fastify + Socket.IO — REST API (auth, account,
│                       admin) and real-time WebSocket layer (matchmaking
│                       queue, WebRTC signaling relay, text chat).
├── packages/
│   ├── database/       Prisma schema + generated client, shared by the
│   │                    server (and any future worker processes).
│   └── shared/          Types and constants shared between web and server
│                        (Socket.IO event names/payloads, limits).
├── docker-compose.yml  Local Postgres + Redis + coturn — zero-cost dev infra.
└── .env.example        Documented environment variables (no real secrets).
```

### Why this stack

- **Next.js + TypeScript + Tailwind**: fast to build a polished, responsive,
  SEO-friendly landing page and app UI with one framework; App Router gives
  clean route-based structure for `/`, `/chat`, `/admin`, `/privacy`, etc.
- **Fastify (not a monolith inside Next.js)**: the real-time layer
  (Socket.IO for matchmaking/signaling/chat) needs a long-lived Node
  process with a raw HTTP server to attach to — that doesn't fit serverless
  Next.js API routes well. Fastify is lightweight, has first-class
  TypeScript support, and a strong plugin ecosystem for the security
  requirements (helmet, rate-limit, cors, cookie).
- **Socket.IO**: reliable WebSocket abstraction (reconnection, rooms) ideal
  for the matchmaking queue, WebRTC signaling relay, and text chat. Actual
  video/audio media never touches this server — only small JSON signaling
  and chat messages do.
- **PostgreSQL + Prisma**: relational data (users, matches, reports, bans)
  benefits from real constraints/foreign keys; Prisma gives type-safe
  queries and migrations, and its parameterization rules out SQL injection
  by construction.
- **Redis**: purpose-built for the matchmaking queue (fast, atomic
  pop/push operations under concurrency) and for distributed rate
  limiting once there's more than one server instance. Optional in local
  dev — the matchmaking service is designed to fall back to an in-memory
  queue in Phase 4 so you don't need Redis running just to click around.
- **WebRTC + STUN + coturn**: peer-to-peer media by default (cheapest,
  lowest latency); TURN (coturn) is only a fallback relay for the
  connections that can't establish directly (symmetric NATs, restrictive
  firewalls) — this keeps bandwidth costs near zero for the common case.
- **npm workspaces monorepo**: `apps/web` and `apps/server` share the
  `@pista/shared` event contracts and the `@pista/database` Prisma client
  without publishing packages — simplest thing that works at this stage.

### What is deliberately *not* here yet

Per the phased build plan, this phase only sets up structure and tooling.
Not implemented yet: authentication, the age gate, the real landing page,
matchmaking, WebRTC signaling, chat, reporting/blocking/banning, and the
admin dashboard. The Prisma schema already models the full data model
(`User`, `Profile`, `Session`, `Match`, `Report`, `Block`, `Ban`,
`RiskProfile`, `ModerationAction`, `AdminUser`, `AuditLog`, `Consent`,
`Subscription`) so later phases build on stable foundations, but no
business logic uses it yet.

## Prerequisites

- Node.js >= 20
- Docker (for local Postgres/Redis/coturn) — or your own local installs of
  Postgres 16+ and Redis 7+ if you'd rather not use Docker
- npm >= 10 (ships with Node 20)

## Local setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
cp .env.example apps/server/.env
# Edit apps/server/.env: at minimum set NEXTAUTH_SECRET and ADMIN_SECRET
# to random strings, e.g. `openssl rand -base64 32`.

# 3. Start local infrastructure (Postgres, Redis, coturn)
docker compose up -d postgres redis

# 4. Run database migrations
npm run db:migrate

# 5. (Optional) seed a local admin account
npm run seed --workspace=packages/database

# 6. Run the server and the web app in separate terminals
npm run dev:server
npm run dev:web
```

The web app runs at http://localhost:3000, the API/WebSocket server at
http://localhost:4000. Check `http://localhost:4000/health` and
`http://localhost:4000/health/db` to confirm both the server and the
database connection are up.

### Testing with two "users" locally

Once matchmaking/chat exist (Phase 4+), open two browser windows (or one
normal + one private/incognito window, or two different browser profiles)
against `http://localhost:3000` and log in as two different test accounts
to simulate two strangers matching.

## Development commands

| Command | Description |
|---|---|
| `npm run dev:web` | Start the Next.js dev server |
| `npm run dev:server` | Start the Fastify/Socket.IO dev server (watch mode) |
| `npm run build:web` / `npm run build:server` | Production builds |
| `npm run db:generate` | Regenerate the Prisma client after schema changes |
| `npm run db:migrate` | Create/apply a dev migration |
| `npm run db:studio` | Open Prisma Studio (visual DB browser) |
| `npm run lint` | Lint both apps |

## Zero-budget → production path

Everything above runs entirely locally at no cost. When it's time to
deploy, the pieces that need a paid/managed equivalent are called out as
`OPTIONAL / PRODUCTION` in `.env.example` — a managed Postgres and Redis,
a production TURN provider (or a hardened self-hosted coturn on a small
VPS), and optionally Cloudflare Turnstile for bot protection. None of
these are required to develop or demo the MVP.

## Status

**Phase 1 of 12 complete**: project structure, tooling, environment
config, database schema, and a running (but feature-empty) web + server
scaffold. See the phase list in the project brief for what's next —
Phase 2 is database + authentication.
