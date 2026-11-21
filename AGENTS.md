# Project notes

- This app uses TanStack Start, Nitro, React, and Supabase.
- Production deployment targets a Node.js server and starts with `pnpm start`.
- Keep credentials in environment variables; never commit `.env` or service role keys.
- Supabase schema changes belong in checked-in migration files and must be applied to the intended Supabase project.
