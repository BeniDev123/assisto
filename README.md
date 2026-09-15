# Assisto

Online counterpart to the QR code shown on a `ControlCenter` error packet
("Online Info" button). A technician scans it with their own phone — the
machine itself never needs internet access, only the phone does.

Scanning opens `/case?fp=<Ids>&type=<machine type>`, which looks up any
previously documented cause/remedy for that exact or partial Id combination,
and lets the technician submit a new one if none exists yet — building a
knowledge base shared across every machine that links here, instead of each
machine's local `KnownCases.json` staying static.

## Stack

- Static pages in `public/`
- Netlify Functions at `/api/case` (GET to look up cases, POST to add one,
  PUT/DELETE for admins to edit/remove one), `/api/auth` (login) and
  `/api/users` (admin user management)
- [Netlify Blobs](https://docs.netlify.com/blobs/overview/) as the data
  store — no separate database needed

## User accounts

Looking up known cases (scanning the QR code) stays open to anyone — no
login needed. Submitting a new cause/remedy requires being logged in, so
every submission is attributed to a real technician account instead of
free text anyone could type.

- **Login**: `/login.html` — technicians sign in with a username/password
  an admin created for them. The session is a signed token stored in
  the browser (`localStorage`), valid 180 days, sent to `/api/case` as
  `Authorization: Bearer <token>` when submitting.
- **Admin page**: `/admin/` — create/delete technician and admin accounts,
  and edit or delete any submitted case (moderation). Reachable either by
  logging in with an account that has the `admin` role, or — before any
  admin account exists — with the `ASSISTO_ADMIN_SECRET` master key below.
- **Roles**: `technician` (can submit cases) and `admin` (can also manage
  users and moderate cases).

### Required environment variables

Copy `.env.example` to `.env` for local dev, and set the same two
variables in the Netlify dashboard (Site configuration → Environment
variables) for the deployed site:

- `ASSISTO_AUTH_SECRET` — signs login session tokens
- `ASSISTO_ADMIN_SECRET` — master key for `/admin/` bootstrap access

### Creating the first admin

1. Set `ASSISTO_ADMIN_SECRET` in the environment (see above).
2. Open `/admin/`, enter that value under "Master-Schlüssel".
3. Create your first `admin` user there — from then on you can log in
   normally via `/login.html` instead of using the master key.

## Local development

```bash
npm install
npx netlify dev
```

Opens the site locally (including the functions and Blobs) at the URL
`netlify dev` prints. Make sure `.env` is set up first (see above).

## Deploy

Either:

1. **Netlify CLI** — `npx netlify login`, then `npx netlify deploy --prod`
   from this folder.
2. **Git-linked** (recommended for ongoing updates) — push this repo to
   GitHub, then in the Netlify dashboard: "Import an existing project" →
   pick the repo. Netlify runs `npm install` and picks up `netlify.toml`
   automatically; every `git push` after that redeploys.

## After deploying

Update `ONLINE_INFO_BASE_URL` in `ControlCenter/Web/logs.html` from the
`care.example.com` placeholder to the real deployed URL (e.g.
`https://assisto.netlify.app/case`), then remove the `?onlineinfo=0` link
parameter used to hide the button until this existed.
