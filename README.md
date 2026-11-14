# Hospital Management System v2

Node.js + Express backend, PostgreSQL database, plain HTML/CSS/JS frontend.
Layers: public/ (presentation) -> src/routes.js (application) -> src/services.js (business logic) -> src/db.js + schema.sql (database).

## Run (quick demo, no database needed)
1. Install Node.js 18+
2. npm install
3. npm start
4. Open http://localhost:3000 (landing page with all portals)

Without DATABASE_URL it uses an in-memory PostgreSQL emulator, so data resets when you stop the server.

## Run with real PostgreSQL
1. Create a database: createdb hms
2. Set DATABASE_URL=postgres://user:password@localhost:5432/hms   (Windows: set DATABASE_URL=...)
3. npm start   (tables and demo data are created automatically)

## Logins (one page per role; each portal only accepts its own role)
Pages: admin.html, doctor.html, nurse.html, receptionist.html, lab.html, pharmacist.html, accountant.html
Username = role name, password = role name + 123 (for example doctor / doctor123). Change it in the Account tab.

## Backup and recovery
- backups/daily-DATE.json is written on start and every 24 hours; backups/weekly-DATE.json on Sundays
- Restore: npm run restore -- backups/daily-2026-11-11.json (needs DATABASE_URL)
- For production also schedule pg_dump with cron
- Every login and change is stored in the audit_logs table

## Deploy to Vercel
1. Create a free PostgreSQL database (Neon, Supabase or Vercel Postgres) and copy its connection string.
2. Push this folder to GitHub and import it in Vercel (Framework preset: Other).
3. In Project Settings > Environment Variables add:
   - DATABASE_URL = your connection string
   - SESSION_SECRET = any long random text
4. Deploy. Tables and demo accounts are created on the first request.
Note: the npm warning "Unknown env config cache-dir" is harmless. Daily JSON backups only run locally; on Vercel use your database provider's backups.
