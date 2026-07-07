# Actual Budget Quick-Input Client & REST API

A highly secure, mobile-friendly, dark-mode-first web utility for adding transactions to [Actual Budget](https://actualbudget.org/) instantly. 

Designed for quick mobile entry with an intuitive glassmorphic interface, autocomplete payees, automatic timezone handling, and custom transaction sign toggles.

---

## Features

- 📱 **Mobile-First & PWA-Ready**: Fully responsive, touch-friendly elements with safe-area spacing for modern mobile devices.
- 🎨 **Frosted Glass (Glassmorphic) Aesthetic**: Sleek dark-mode theme utilizing vanilla CSS variable systems.
- 🔒 **Strong Authentication & Hardened API**:
  - Session authorization using `HttpOnly`, `SameSite=Strict`, `Secure` (in production) cookies containing signed JWTs.
  - Defense-in-depth CSRF prevention using custom validation headers (`X-Auth-CSRF`).
  - Rate limiting enforced on login (5 requests/min) and general API endpoints (100 requests/min).
  - Timing-safe password comparisons to thwart side-channel attacks.
- ⚡ **Streamlined Transaction Inputs**:
  - **Account Selector**: Remembers your last-used account in `localStorage`.
  - **Smart Date Picker**: Defaulting to the local date of the device.
  - **Responsive Payee Autocomplete**: Type-to-filter dropdown allowing selection of existing payees or typing a new payee name on the fly.
  - **Expense/Income Segment Toggles**: Fast switches to input positive or negative transactions without manually typing sign characters.
  - **Category Dropdown**: Organizes categories neatly into their parent groups using standard, search-accessible browser structures.
  - **Notes / Description**: For keeping descriptions along with the entry.

---

## Technical Stack

- **Backend**: Node.js, TypeScript, Express, `@actual-app/api` (Actual Budget headless client).
- **Frontend**: React 18, TypeScript, Vite, Lucide Icons.
- **Styles**: Vanilla CSS (no Tailwind, clean styling variables).

---

## Project Structure

```text
├── src/
│   ├── server/             # Express API & Actual Budget Integration
│   │   ├── actual.ts       # Headless Client interactions & synchronizations
│   │   ├── auth.ts         # JWT Session, CSRF check, and rate limiting logic
│   │   ├── config.ts       # Environment variable checks and defaults
│   │   └── index.ts        # Express routers & static bundle server
│   └── client/             # React SPA Frontend
│       ├── components/     # UI Sub-components (dropdowns, inputs)
│       ├── App.tsx         # Root component & page router
│       ├── index.css       # Layouts, variables, and dark animations
│       ├── index.html      # Shell page & viewport tags
│       └── main.tsx        # React client entry point
├── dist/                   # Compiled outputs (Server JS + Static Frontend files)
├── package.json            # Compilation scripts & project dependencies
├── tsconfig.json           # Client TypeScript configuration
├── tsconfig.server.json    # Server TypeScript configuration
└── vite.config.ts          # Vite bundler & API dev proxy configuration
```

---

## Installation & Setup

### 1. Install Dependencies
Run the package installation:
```bash
npm install
```

### 2. Configure Environment Variables
Copy the configuration template and populate it with your Actual Budget server coordinates:
```bash
cp .env.example .env
```

Open `.env` and fill out the fields:
```env
PORT=3000
NODE_ENV=production
APP_PASSWORD=your-secure-access-password       # The password to unlock the UI
JWT_SECRET=your-random-jwt-signing-secret      # Keep session persistent on server restart

# Actual Budget Coordinates
ACTUAL_SERVER_URL=https://your-actual-server.com
ACTUAL_SERVER_PASSWORD=your-server-password
ACTUAL_BUDGET_SYNC_ID=your-budget-sync-id      # Found in Actual Settings -> Advanced
ACTUAL_DATA_DIR=./data                         # Local directory to store SQLite cache
```

---

## Running the Application

### Development Mode
Runs the Express API (port `3000`) and the Vite React Dev server (port `5173`) concurrently. Calls to `/api/*` from Vite are automatically proxied to Express.
```bash
npm run dev
```

### Production Build & Launch
Builds the client assets, compiles the server to commonjs JavaScript inside `dist/`, and runs the server. Express will host the static frontend files and the REST API together on the configured `PORT`.
```bash
# Build both frontend and backend
npm run build

# Start the unified Express server
npm run start
```
