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
**Working on Supabase:** login + roles, Overview, Students (list/add/edit, CSV import), Inventory, Issue Items, Return Items, Issue History, Batches/Divisions (list/add), Teachers (list), and CSV export of the Issue Log, Students, Teachers, Inventory.

**Database ready, screens not yet moved** (they show "not moved to Supabase yet"): Lab Assets, Computer Systems, Equipment Allocation, Maintenance Register, QR Labels, Lab Timetable, Teacher Timetable, Attendance, Reports, Settings, Excel import / JSON backup / restore, PDF slips.
The CSV exports for assets, computers, allocations, maintenance and timetable work but stay empty until those screens are moved.

## SQL files: run in this order in Supabase -> SQL Editor
1. `supabase/schema.sql`  2. `supabase/update_1_returns.sql`  3. `supabase/update_2_modules.sql`
