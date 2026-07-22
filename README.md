# SurveyToGo Question Search

A small internal tool that searches for questions across your SurveyToGo
**customers → projects → surveys**, using the project manager's own SurveyToGo
REST API credentials.

- **Frontend:** React + TypeScript + Vite
- **Backend:** Node.js + Fastify
- **No database, no user accounts, no application login, no sessions/JWT.**

The SurveyToGo API itself decides whether the credentials are valid: if a request
succeeds you see the customers; if SurveyToGo returns `401`/`403` you see an
invalid‑credentials error. Credentials are kept **only in the browser's memory**
and are sent to the backend only inside HTTPS `POST` request bodies — never
stored in a database, file, log, cookie, or `localStorage`.

## Project structure

```
survey-question-search/
├── search.js                 # original standalone CLI (kept, still works)
├── server/                   # Fastify backend
│   ├── package.json
│   └── src/
│       ├── index.js          # Fastify server (body logging disabled)
│       ├── routes.js         # /api/customers, /api/search, /api/search/stream, /api/export
│       ├── searchEngine.js   # refactored search logic (credentials per request)
│       ├── csv.js            # CSV builder (UTF-8 + BOM)
│       └── cli.js            # optional CLI using the refactored engine
└── web/                      # React + TypeScript + Vite frontend
    ├── package.json
    ├── vite.config.ts        # proxies /api → backend in dev
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx           # holds credentials in memory only
        ├── api.ts            # fetch calls + NDJSON progress stream
        ├── types.ts
        ├── styles.css
        └── components/
            ├── CredentialsForm.tsx
            ├── CustomerSelect.tsx
            ├── SearchPanel.tsx
            ├── ResultsTable.tsx
            ├── highlight.tsx
            └── ui.tsx
```

## Prerequisites

- Node.js 18+ (the backend uses `node --watch`; Node 20+ recommended)

## Install

Open two terminals — one for the backend, one for the frontend.

```bash
# 1) Backend
cd server
npm install

# 2) Frontend
cd ../web
npm install
```

## Run (development)

```bash
# Terminal 1 — backend on http://127.0.0.1:3001
cd server
npm run dev

# Terminal 2 — frontend on http://localhost:5173
cd web
npm run dev
```

Open **http://localhost:5173**. Vite proxies every `/api/*` request to the
backend, so there is no CORS setup and credentials only ever travel in POST
bodies.

## How to use

1. Enter your SurveyToGo **username** (`REST-API-KEY/username`) and **password**,
   then click **Continue**. This only verifies that a SurveyToGo request can be
   completed — it is not an application login.
2. Select one or more **customers** (searchable, with select‑all / clear).
3. Type a keyword, several keywords, a phrase, or a full question, and click
   **Search**. All entered words must appear in the matched text, in any order
   (identical to the original `search.js` behaviour). You can **Cancel** a
   running search and watch live progress by customer/project/survey.
4. Review results in the table: search within results, filter by customer or
   project, paginate, and **Export CSV** (UTF‑8 with BOM so Arabic displays
   correctly in Excel). Matched keywords are highlighted.
5. Click **Reset** to clear the credentials and all results from memory.

## API endpoints

| Method & path            | Purpose                                                        |
| ------------------------ | -------------------------------------------------------------- |
| `POST /api/customers`    | Verify credentials against SurveyToGo and return customers.    |
| `POST /api/search`       | Search selected customers; returns the full result set (JSON). |
| `POST /api/search/stream`| Same search, streamed as NDJSON progress + final result.       |
| `POST /api/export`       | Turn the current results into a downloadable CSV file.         |

All four accept credentials **only** in the JSON request body.

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

- The password is never logged (Fastify request‑body logging is disabled and
  `username`/`password`/`authorization` are redacted as a second line of defence).
- Credentials are never placed in URLs, query strings, error responses, files, or
  the database (there is none). They are sent only inside POST bodies.
- The frontend keeps credentials in React state (memory) only; a page refresh or
  **Reset** clears them.

## Optional: original CLI

Both CLIs **prompt for the SurveyToGo username and password at runtime** (the
password is hidden as you type). Credentials are never taken from environment
variables, files, or arguments — they live only in memory for the duration of
the run and are used immediately to build the SurveyToGo Axios client.

The original standalone script:

```bash
node search.js "honor community"
# → prompts: SurveyToGo Username, SurveyToGo Password
```

Or the refactored engine via the backend CLI:

```bash
cd server
npm run cli -- "honor community"
# → prompts: SurveyToGo Username, SurveyToGo Password
```

## Production build (optional)

```bash
cd web
npm run build      # outputs web/dist
```

Serve `web/dist` behind your reverse proxy (terminating **HTTPS**) and run the
backend with `cd server && npm start`. Point the proxy's `/api/*` at the backend
so credentials are only ever transmitted over HTTPS.
