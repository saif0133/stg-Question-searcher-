# SurveyToGo Question Search

A small internal tool that searches for questions across your SurveyToGo
**customers → projects → surveys**, using the project manager's own SurveyToGo
REST API credentials.

It deploys as a **single Netlify site**: a static React app plus serverless API
functions, on one domain.

- **Frontend:** React + TypeScript + Vite (static, served by Netlify)
- **API:** Netlify Functions (Node) that call SurveyToGo
- **No database, no user accounts, no application login, no sessions/JWT.**

The SurveyToGo API itself decides whether the credentials are valid: if a request
succeeds you see the customers; if SurveyToGo returns `401`/`403` you see an
invalid‑credentials error. Credentials are kept **only in the browser's memory**
and are sent to the functions only inside HTTPS `POST` request bodies — never
stored in a database, file, log, cookie, `localStorage`, session, or environment
variable.

## How it works on Netlify

Netlify can't run a long-lived server, and each function is short‑lived
(~10 s max). A full survey search can take minutes because SurveyToGo is limited
to ~2 requests/second, so **the browser drives the search** as a sequence of
short function calls, each doing one SurveyToGo step:

```
Browser (React app)
  ├─ POST /api/customers           → list customers            (one call)
  └─ for each selected customer:
       ├─ POST /api/projects       → that customer's projects  (one call)
       └─ for each project:
            ├─ POST /api/surveys   → that project's surveys     (one call)
            └─ for each survey:
                 └─ POST /api/search-survey → matches in survey (one call)
```

Each call finishes well within a function's time limit; the browser shows live
progress, supports **Cancel**, accumulates results, and can **Export CSV**. The
matching logic (all keywords, any order), parsing, extraction, and de‑duplication
are unchanged — they run inside the functions, reusing `server/src/searchEngine.js`.

> Because the browser orchestrates the search, keep the tab open until it
> finishes. A large customer selection means many function calls (one per
> survey) and the same overall time the rate limit has always required.

## Project structure

```
survey-question-search/
├── netlify.toml              # Netlify build, functions, /api redirects, SPA fallback
├── package.json              # root: install:all / build / dev (netlify dev)
├── search.js                 # original standalone CLI (kept, still works)
├── netlify/
│   └── functions/            # serverless API (thin wrappers over the search engine)
│       ├── _shared.js        # response + error helpers
│       ├── customers.js      # POST /api/customers
│       ├── projects.js       # POST /api/projects
│       ├── surveys.js        # POST /api/surveys
│       ├── search-survey.js  # POST /api/search-survey
│       └── export.js         # POST /api/export  (CSV, UTF-8 + BOM)
├── server/
│   └── src/
│       ├── searchEngine.js   # SurveyToGo logic (per-request credentials) — shared source of truth
│       ├── csv.js            # CSV builder (UTF-8 + BOM)
│       └── cli.js            # optional CLI (prompts for credentials at runtime)
└── web/                      # React + TypeScript + Vite frontend
    ├── package.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── App.tsx           # holds credentials in memory only
        ├── api.ts            # relative /api calls + client-side search orchestration
        ├── types.ts
        ├── styles.css
        └── components/       # CredentialsForm, CustomerSelect, SearchPanel, ResultsTable, ui, highlight
```

## Prerequisites

- Node.js 18+ (Node 20 recommended — matches the Netlify build)

## Install

From the repository root:

```bash
npm install            # root deps (axios, fast-xml-parser for functions; netlify-cli for dev)
npm run install:all    # root + web dependencies
```

## Local development

Local dev uses the Netlify CLI to run the functions and the Vite dev server
together on one origin, applying the same `/api` rewrites as production. Install
the CLI once (globally or use `npx`):

```bash
npm install -g netlify-cli     # once, or prefix the command with `npx`
npm run dev                    # runs `netlify dev`  (or: npx netlify dev)
```

Open the URL it prints (default **http://localhost:8888**). `/api/*` reaches the
functions, everything else is the React app — one origin, no CORS. Credentials
travel only in POST bodies.

`netlify-cli` is intentionally **not** a project dependency, to keep Netlify's
cloud build fast — it is only needed on your machine for local dev.

## Production build

Netlify runs this automatically (see `netlify.toml`), but to build locally:

```bash
npm run build          # builds the React app into web/dist
```

## Deploy to Netlify (one site)

Push the repository to GitHub/GitLab and create a Netlify **site from the repo**.
`netlify.toml` already sets everything:

| Netlify setting     | Value (from netlify.toml)                         |
| ------------------- | ------------------------------------------------- |
| Base directory      | repository root                                   |
| Build command       | `npm install --prefix web && npm run build --prefix web` |
| Publish directory   | `web/dist`                                         |
| Functions directory | `netlify/functions`                                |

Redirects (also in `netlify.toml`):

- `/api/*` → `/.netlify/functions/:splat` (the API)
- `/*` → `/index.html` (React client-side routing)

Do **not** set SurveyToGo credentials as environment variables — they are entered
in the UI per request.

## API (Netlify Functions)

All accept credentials **only** in the JSON POST body; none store or log them.

| Path                     | Body                                             | Returns                              |
| ------------------------ | ------------------------------------------------ | ------------------------------------ |
| `POST /api/customers`    | `{ username, password }`                         | `{ customers: [{ id, name }] }`      |
| `POST /api/projects`     | `{ username, password, customerId }`             | `{ projects: [{ id, name }] }`       |
| `POST /api/surveys`      | `{ username, password, projectId }`              | `{ surveys: [{ id, name }] }`        |
| `POST /api/search-survey`| `{ username, password, surveyId, searchText }`   | `{ matches: [{ matchedText, structurePath }] }` |
| `POST /api/export`       | `{ results: [...] }`                              | CSV file (UTF-8 + BOM)               |

An unknown `/api/*` path returns a JSON function error, never the frontend HTML.

## Security notes

- Passwords are never logged; functions log nothing about the request body.
- Credentials are never placed in URLs, query strings, files, environment
  variables, or a database (there is none). They are sent only inside POST bodies
  and used immediately to build a per-request SurveyToGo client.
- The frontend keeps credentials in React state (memory) only; a page refresh or
  **Reset** clears them.

## Optional: original CLI

The CLIs **prompt for the SurveyToGo username and password at runtime** (the
password is hidden as you type); credentials live only in memory for the run.

```bash
node search.js "honor community"          # original standalone script
cd server && npm run cli -- "honor community"   # refactored engine
```
