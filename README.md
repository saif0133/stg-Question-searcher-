# SurveyToGo Question Search

A small internal tool that searches for questions across your SurveyToGo
**customers → projects → surveys**, using the project manager's own SurveyToGo
REST API credentials.

It is a **single unified full-stack application**: one Fastify server serves both
the API (`/api/*`) and the built React app, from one repository, as one web
service on one domain.

- **Frontend:** React + TypeScript + Vite
- **Backend:** Node.js + Fastify (also serves the built frontend)
- **No database, no user accounts, no application login, no sessions/JWT.**
- **No separate frontend/backend deployments, no cross-domain CORS.**

The SurveyToGo API itself decides whether the credentials are valid: if a request
succeeds you see the customers; if SurveyToGo returns `401`/`403` you see an
invalid‑credentials error. Credentials are kept **only in the browser's memory**
and are sent to the backend only inside HTTPS `POST` request bodies — never
stored in a database, file, log, cookie, `localStorage`, session, or environment
variable.

## Unified architecture

```
Browser
  → one public application URL
    → Fastify server (single Node process)
       ├─ /api/*   → backend API routes
       ├─ /health  → health check
       └─ (everything else, GET) → React app from web/dist
```

- In **production**, Fastify serves `web/dist` (the built React app) and the API
  from the same origin. The frontend uses **relative** URLs (`/api/...`,
  `/health`), so there is no CORS and no external backend URL.
- In **development**, Vite serves the app on `:5173` and proxies `/api` and
  `/health` to the Fastify server on `:3000`, so the browser still talks to a
  single origin.

## Project structure

```
survey-question-search/
├── package.json              # root: install:all / build / start / dev scripts
├── search.js                 # original standalone CLI (kept, still works)
├── server/                   # Fastify backend (serves API + built frontend)
│   ├── package.json
│   └── src/
│       ├── index.js          # server: @fastify/static + SPA fallback, listens 0.0.0.0:PORT
│       ├── routes.js         # /api/customers, /api/search, /api/search/stream, /api/export
│       ├── searchEngine.js   # search logic (credentials per request, returns results)
│       ├── csv.js            # CSV builder (UTF-8 + BOM)
│       └── cli.js            # optional CLI (prompts for credentials at runtime)
└── web/                      # React + TypeScript + Vite frontend
    ├── package.json
    ├── vite.config.ts        # dev-only proxy of /api and /health → :3000
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx           # holds credentials in memory only
        ├── api.ts            # relative fetch calls + NDJSON progress stream
        ├── types.ts
        ├── styles.css
        └── components/       # CredentialsForm, CustomerSelect, SearchPanel, ResultsTable, ui, highlight
```

## Prerequisites

- Node.js 18+ (Node 20+ recommended; the backend dev script uses `node --watch`)

## Install

From the repository root:

```bash
npm install            # root tools (concurrently for `npm run dev`)
npm run install:all    # installs server/ and web/ dependencies
```

## Local development

Runs the Fastify API (`:3000`) and the Vite dev server (`:5173`) together:

```bash
npm run dev
```

Open **http://localhost:5173**. Vite proxies `/api/*` and `/health` to the
Fastify server, so the browser only ever uses one origin — no CORS, and
credentials only travel in POST bodies. NDJSON streaming from
`/api/search/stream` passes through the proxy unbuffered.

> In dev the Fastify server has no `web/dist` yet, so it serves the API only and
> logs a note to that effect. That is expected — Vite serves the frontend.

## Production build & run (single process)

```bash
npm run build          # builds the React app into web/dist
npm start              # starts Fastify, which serves the API AND web/dist
```

Then open **http://localhost:3000** (or the platform's assigned `PORT`). One
process serves everything.

## Deployment (Render or Railway — one Web Service)

Deploy as a single persistent Node.js **Web Service** (not Netlify Functions,
not a static site). Both platforms inject `PORT`; the server already listens on
`0.0.0.0` using `process.env.PORT` (default `3000`).

**Render**

| Setting        | Value                                     |
| -------------- | ----------------------------------------- |
| Root Directory | repository root                           |
| Environment    | Node                                      |
| Build Command  | `npm run install:all && npm run build`    |
| Start Command  | `npm start`                               |
| Health Check   | `/health`                                 |

**Railway**

| Setting        | Value                                     |
| -------------- | ----------------------------------------- |
| Build Command  | `npm run install:all && npm run build`    |
| Start Command  | `npm start`                               |
| Healthcheck    | `/health`                                 |

`PORT` is server configuration only. **Do not** set SurveyToGo credentials as
environment variables — they are entered in the UI per request.

## API endpoints

| Method & path            | Purpose                                                        |
| ------------------------ | -------------------------------------------------------------- |
| `GET  /health`           | Health check → `{ "status": "ok" }`.                           |
| `POST /api/customers`    | Verify credentials against SurveyToGo and return customers.    |
| `POST /api/search`       | Search selected customers; returns the full result set (JSON). |
| `POST /api/search/stream`| Same search, streamed as NDJSON progress + result + done.      |
| `POST /api/export`       | Turn the current results into a downloadable CSV file.         |

All `/api/*` routes accept credentials **only** in the JSON request body. Any
unknown `/api/*` path returns a JSON `404` (never the frontend HTML).

### `POST /api/customers`

```json
{ "username": "REST-API-KEY/username", "password": "password" }
```

### `POST /api/search`

```json
{
  "username": "REST-API-KEY/username",
  "password": "password",
  "searchText": "favorite social media influencer",
  "customerIds": ["customer-id-1", "customer-id-2"]
}
```

Returns:

```json
{ "totalMatches": 0, "totalErrors": 0, "results": [], "errors": [] }
```

## Security notes

- The password is never logged (Fastify request bodies are not logged, and
  `username`/`password`/`authorization` are redacted as a second line of defence).
- Credentials are never placed in URLs, query strings, error responses, files,
  environment variables, or a database (there is none). They are sent only inside
  POST bodies and used immediately to build a per-request SurveyToGo client.
- The frontend keeps credentials in React state (memory) only; a page refresh or
  **Reset** clears them.

## Optional: original CLI

Both CLIs **prompt for the SurveyToGo username and password at runtime** (the
password is hidden as you type). Credentials are never taken from environment
variables, files, or arguments — they live only in memory for the run.

```bash
node search.js "honor community"          # original standalone script
# or, using the refactored engine:
cd server && npm run cli -- "honor community"
```
