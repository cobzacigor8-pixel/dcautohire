# DC AutoHire – Vercel Deployment Guide

## What changed from the original version
- **SQLite → Vercel Postgres** (persistent cloud database)
- **Local file uploads → Vercel Blob** (persistent cloud image storage)
- **express-session → JWT tokens** (stateless, works on serverless)
- **server.js → api/index.js** (Vercel serverless function format)

---

## Step 1 — Push to GitHub

Create a new GitHub repo and push all these files.
Do NOT include `node_modules/` or `data.db`.

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USER/dcautohire.git
git push -u origin main
```

---

## Step 2 — Create project on Vercel

1. Go to https://vercel.com and sign up/login
2. Click **"Add New Project"**
3. Import your GitHub repo
4. Click **Deploy** (it will fail — that's OK, we need env vars first)

---

## Step 3 — Add Vercel Postgres database

1. In your Vercel project, go to **Storage** tab
2. Click **Create Database → Postgres**
3. Name it `dcautohire-db`, click Create
4. Click **Connect to Project** — this auto-adds the env vars

---

## Step 4 — Add Vercel Blob storage

1. In **Storage** tab, click **Create Database → Blob**
2. Name it `dcautohire-blob`, click Create
3. Click **Connect to Project** — this adds `BLOB_READ_WRITE_TOKEN`

---

## Step 5 — Add JWT secret env var

1. Go to **Settings → Environment Variables**
2. Add:
   - Name: `JWT_SECRET`
   - Value: any long random string (e.g. `my-super-secret-key-dcautohire-2024`)

---

## Step 6 — Redeploy

Go to **Deployments** tab → click the latest deployment → **Redeploy**.

Your site is live! Admin panel at: `https://your-project.vercel.app/admin`

**Default credentials:**
- Username: `admin`
- Password: `admin1234` ← Change immediately from Settings!

---

## Local development

```bash
npm install
vercel dev   # requires Vercel CLI: npm i -g vercel
```

Or to run without Vercel CLI (you'll need to set env vars manually):
```bash
# Set env vars from your Vercel dashboard (POSTGRES_URL, BLOB_READ_WRITE_TOKEN, JWT_SECRET)
node api/index.js
```
