# CarpoolCampus

A student ride-sharing coordination web app for campus commuters. The project is organized as a monorepo with separate `frontend/` and `backend/` folders.

## Project Structure

```
CarpoolCampus_p4/
├── package.json              # Root — workspace config, scripts, and shared dependencies
├── node_modules/             # Shared dependencies (hoisted by npm workspaces)
├── README.md                 # This file
├── exploration_notes.md      # Project exploration notes
├── CarpoolCampus_PRD.docx    # Product requirements document
├── frontend/
│   ├── package.json          # Frontend metadata and scripts
│   ├── vite.config.js        # Vite dev server + React plugin config
│   ├── index.html            # HTML entry point
│   ├── src/
│   │   ├── main.jsx           # React components (all UI logic)
│   │   └── styles.css         # Global styles
│   ├── dist/                  # Production build output (git-ignored)
│   └── .gitignore
└── backend/
    ├── package.json          # Backend metadata and scripts
    ├── server/
    │   └── index.js          # Express API server
    ├── db/
    │   └── schema.sql        # Database schema
    ├── .env                  # Environment variables (git-ignored)
    ├── .env.example          # Example environment template
    ├── server.log            # Server log output
    └── .gitignore
```

## Run Locally

```powershell
npm install
npm run dev:full
```

- Frontend dev server: `http://localhost:5173`
- Backend (Express API): `http://localhost:4000` (proxies `/api` from the frontend)

### Available Scripts

| Script           | Description                                            |
| ---------------- | ------------------------------------------------------ |
| `npm run dev`    | Starts the Vite frontend dev server                    |
| `npm run build`  | Builds the frontend for production (`frontend/dist`)   |
| `npm run preview` | Serves the production build locally                   |
| `npm run api`    | Starts the Express backend API server                  |
| `npm run start`  | Starts the backend API server (alias for `api`)        |
| `npm run dev:full` | Runs both backend API and frontend dev server concurrently |

### PostgreSQL Setup

The local `.env` is configured for the supplied PostgreSQL database:

- Database: `Carpool_Campus`
- User: `postgres`
- Host: `localhost`
- Port: 5432

Create the database with `backend/db/schema.sql` if it does not already exist. The API also creates tables automatically when it starts. Passwords are hashed with bcrypt and the database password is never sent to the browser.

For a clean machine, run `npm install` with network access first.

## Included Product Flows

- Student dashboard and confirmed daily commute
- Ranked route matches and seat-request state
- Recurring route posting, pickup-zone privacy notice, and time preferences
- Trip management with schedule, skip, trip-sharing, and cost estimate views
- Safety/emergency contact experience
- Live rider, driver, and admin dashboards
- Live routes, ride requests, trips, members, and safety reports

Authentication, routes, requests, trips, members, and safety reports are stored in a secure relational database and served through the API. Maps and real-time Socket.IO updates are the next integration phase.