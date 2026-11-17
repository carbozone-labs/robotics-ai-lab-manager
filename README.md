# Robotics & AI Lab Manager

React + Vite website on **GitHub Pages**. Data, login and security live in **your own Supabase project**.
This repo contains **no keys and no student data**. Every user adds their own Supabase keys.

## 1. Create the Supabase project
1. supabase.com -> New project (Mumbai region). Save the database password.
2. Create the database - choose ONE way:
   - **SQL Editor (no tools needed):** New query -> paste all of `supabase/setup_all.sql` -> Run. Run it once, on an empty project.
   - **CLI:**
     ```
     npx supabase@latest login
     npx supabase@latest link --project-ref <20-letter-project-ref>
     npx supabase@latest db push --remote
     ```
3. **Authentication -> Users -> Add user -> Create new user**: email `admin@lab.local`, a strong password, tick **Auto Confirm User**.
   Do this *after* step 2, so the first user becomes `admin`. Sign in with the username `admin`.
4. **Authentication -> Sign In / Providers -> Email**: turn **off** "Allow new users to sign up".
5. More users: sign in as admin -> Application Settings -> Users & roles.

## 2. Run on your computer
Create `frontend/.env` (Git ignores it - never commit it). Copy `frontend/.env.example` and fill in:
```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-PUBLISHABLE-KEY
```
Use the **publishable / anon** key (Project Settings -> API Keys). Never put a `service_role` / secret key in this project.
```
cd frontend
npm install
npm run dev
```

## 3. Deploy to GitHub Pages
1. Create an empty GitHub repo and push this folder.
2. Repo -> **Settings -> Secrets and variables -> Actions**: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Repo -> **Settings -> Pages -> Source: GitHub Actions**.
4. Push to `main` (or run the workflow from the Actions tab). The site opens at `https://<owner>.github.io/<repo>/`.
   The repo name is picked up automatically; nothing to edit.

## After the first login
- Students: import a CSV (PRN, Student name, Division, Roll no, optional Batch), then **Students -> Assign batches** (B1/B2/B3 by roll range).
- Attendance is batch-wise: pick the day's Lab Timetable session and only that division + batch is listed.
- Inventory: daily-use items appear on Issue Items (tick "Show all inventory items" for the rest). "Teacher Kit (Box 23)" can only be issued to teachers.

## Included starter data
The database setup also loads the Room 1202 Project Laboratory timetable (AY 2026-27 Sem 1), its 12 teachers (names + employee IDs), batches B1-B3, divisions and the lab inventory.
Edit or delete them in the app, or remove those rows from the migration before running it on a fresh project. If you make the repo public, check that you are fine sharing the teacher names and IDs.

## Not available yet
Issue/return/asset/maintenance report pages, Excel import, JSON backup/restore, slip PDF.

## Folders
- `frontend/` - the website
- `supabase/migrations/` - database setup in order (used by the CLI); `supabase/setup_all.sql` is the same in one file
