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
- One Netlify Function (`netlify/functions/case.mjs`) at `/api/case`,
  GET to look up cases, POST to add one
- [Netlify Blobs](https://docs.netlify.com/blobs/overview/) as the data
  store — no separate database needed

## Local development

```bash
npm install
npx netlify dev
```

Opens the site locally (including the function and Blobs) at the URL
`netlify dev` prints.

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
