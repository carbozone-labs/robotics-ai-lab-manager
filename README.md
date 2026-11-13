# Robotics & AI Lab Manager — GitHub Pages + Supabase

No server. The React site runs on GitHub Pages and talks directly to Supabase (Postgres + login). Security is enforced by Row Level Security in `supabase/schema.sql`.

## Setup (about 10 minutes)
1. **Supabase**: create a free project at supabase.com. Open *SQL Editor*, paste all of `supabase/schema.sql`, Run.
2. **Admin login**: Authentication -> Users -> *Add user* -> email `admin@lab.local`, a strong password, tick *Auto Confirm User*. The first user becomes `admin`. Sign in with username `admin` (the part before `@`). Authentication -> Providers -> Email: turn **off** "Allow new users to sign up".
3. **GitHub**: push this folder to a repo. Settings -> Pages -> Source: **GitHub Actions**. Settings -> Secrets and variables -> Actions -> add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Supabase -> Project Settings -> API). Push to `main`; the site appears at `https://<user>.github.io/<repo>/`.
4. More users: add them in Supabase Auth as `<username>@lab.local`, then set their role in the `profiles` table (`admin`, `lab_assistant`, `teacher`).

## Local run
`cd frontend && npm install`, create `frontend/.env` with the two `VITE_` values, `npm run dev`.

## Migration status
**Working on Supabase:** login + roles, Overview, Students (list/add/edit, CSV import), Inventory, Issue Items, Return Items, Issue History, Lab Assets, Equipment Allocation, Computer Systems, **Maintenance Register, QR Labels + Scan, Teachers (add/edit/deactivate/delete), Batches and Divisions (add/rename/delete)**, and CSV export of the Issue Log, Students, Teachers, Inventory, Assets, Computers, Allocations, Maintenance.

**Not yet moved** (they show "not moved to Supabase yet"): Lab Timetable, Teacher Timetable, Attendance + Attendance Reports, Reports, Settings, Excel import / JSON backup / restore, PDF slips.

## Database setup (simple way)
1. Run `supabase/schema.sql` once (first time only).
2. Then paste **`supabase/run_all_updates.sql`** into Supabase -> SQL Editor -> Run. It contains every update, is safe to run again, and ends with a schema-cache reload. Use this one file for all future updates too.
(The separate `update_*.sql` files are the same code split into pieces.)

## QR labels
Labels point to `<site address>/#/scan/<Asset ID>`. On GitHub Pages the address is `https://<user>.github.io/<repo>`; the QR Labels page fills this in automatically.
