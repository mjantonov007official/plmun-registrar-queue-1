# PLMun Registrar Queue

Queue management app for registrar services, with public ticket creation and tracking, staff sign-in, queue controls, and reports.

## Requirements

- Node.js 22 LTS (Hostinger supports Node.js 18, 20, 22, and 24; this project targets 22+).
- pnpm 11.25.0 (the project uses a checked-in pnpm lockfile).
- A Supabase project for authentication, database, and application data.
- A Hostinger Business or Cloud hosting plan with Node.js web app support for managed deployment. VPS hosting also works with a Node.js service manager.

## Local development

1. Copy `.env.example` to `.env` and fill in the Supabase values.
2. Install dependencies with `pnpm install`.
3. Start the development server with `pnpm dev`.

## Production build

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

The production server listens on the `PORT` supplied by the hosting provider and serves the Nitro Node.js output from `.output/server/index.mjs`.

## Deploy from GitHub to Hostinger

1. Push this project to a GitHub repository. Keep `.env` out of Git; `.gitignore` excludes it.
2. In Hostinger hPanel, create a **Web App**, select the domain, and import the GitHub repository.
3. Select Node.js 22 (or another supported version at least 22) and pnpm. Use `pnpm install --frozen-lockfile`, `pnpm build`, and `pnpm start` if Hostinger does not detect the commands automatically.
4. Add the environment variables listed below in Hostinger's app settings before building.
5. Configure the Supabase URL configuration with the deployed app URL and `/auth` callback, and enable Google OAuth if staff will use it.
6. Deploy, then verify public ticket creation/tracking and staff sign-in against the production Supabase project.

Hostinger's managed Node.js deployment requires a Business or Cloud plan. A static-only deployment is insufficient because this app uses server-side rendering and server functions.

## Environment variables

Required for the app:

- `VITE_SUPABASE_URL` — Supabase project URL embedded in the browser build.
- `VITE_SUPABASE_PUBLISHABLE_KEY` — Supabase publishable/anon key embedded in the browser build. This is a public key; access must be protected by Supabase Row Level Security.
- `SUPABASE_URL` — server-side Supabase URL.
- `SUPABASE_PUBLISHABLE_KEY` — server-side publishable/anon key used to validate signed-in users.

Add these only when the corresponding features are used:

- `SUPABASE_SERVICE_ROLE_KEY` — server-only key for trusted admin operations that bypass Row Level Security. Never use a `VITE_` prefix for it.
- `DATABASE_URL` — PostgreSQL connection string for Drizzle schema or migration tooling.
- `APP_CRON_SECRET` and optionally `APP_CRON_SECRET_PREVIOUS` — bearer secret(s) for cron endpoints using `authenticateCronRequest`.

`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` must be available during the production build. Put all other values in Hostinger's server environment settings. Do not commit real values.

## Supabase setup checklist

- Apply the SQL migrations under `drizzle/migrations` to the production project before launch. `pnpm db:migrate` uses `DATABASE_URL`.
- Confirm Row Level Security policies support public ticket actions and restrict staff-only data.
- Configure the production site URL and allowed redirect URL (`https://your-domain/auth`) in Supabase Auth.
- Configure Google OAuth credentials in Supabase. Register Supabase's provider callback URL (`https://<project-ref>.supabase.co/auth/v1/callback`) with Google; the app URL is an allowed redirect URL in Supabase.
- Supply the same Supabase project values to the browser and server environments.

## Useful commands

```sh
pnpm dev
pnpm build
pnpm start
pnpm lint
pnpm test
```
