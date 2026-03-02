# CLAUDE.md — AI Assistant Guide for `membran`

## Project Overview

**membran** is a Tauri v2 desktop app ("layer I").

| | |
|---|---|
| Platform | macOS desktop (via Tauri v2) |
| Frontend | TypeScript + React 19 + Vite |
| Backend | Rust (Tauri core) |
| Bundler | Vite |

---

## Repository Layout

```
membran/
├── index.html                # HTML entry point for Vite
├── src/
│   ├── main.tsx              # React entry point
│   ├── App.tsx               # Root React component
│   ├── App.module.css        # App styles (CSS Modules)
│   ├── styles.css            # Global styles
│   └── vite-env.d.ts         # Vite type declarations
│
├── src-tauri/
│   ├── Cargo.toml            # Rust dependencies
│   ├── tauri.conf.json       # Tauri configuration
│   ├── build.rs              # Tauri build script
│   ├── capabilities/         # Tauri permission capabilities
│   ├── icons/                # App icons
│   └── src/
│       ├── main.rs           # Rust entry point
│       └── lib.rs            # Tauri app setup
│
├── package.json              # Dependencies + npm scripts
├── tsconfig.json             # TypeScript config
├── vite.config.ts            # Vite config (dev server on port 1420)
│
├── .prettierrc.js            # Prettier config
├── .gitignore
└── CLAUDE.md                 # This file
```

---

## Prerequisites

- **Rust** — install via [rustup](https://rustup.rs/)
- **Node 20+** — use nvm: `nvm install 22`
- **Xcode Command Line Tools** — `xcode-select --install`

---

## Running the App

```bash
# Install JS dependencies
npm install

# Start the Tauri dev app (launches Vite + native window)
npm run tauri dev
```

This starts Vite on port 1420 and opens the native Tauri window with hot reload.

---

## npm Scripts

| Script | What it does |
|--------|-------------|
| `npm run dev` | Start Vite dev server only (no native window) |
| `npm run build` | TypeScript check + Vite production build |
| `npm run preview` | Preview the production build |
| `npm run tauri dev` | Start full Tauri dev app (Vite + native window) |
| `npm run tauri build` | Build production .app / .dmg |
| `npm run lint` | ESLint across src/ |
| `npm run type-check` | TypeScript type check (no emit) |

---

## Key Concepts for AI Assistants

### Frontend (src/)
Standard React + TypeScript. Use CSS Modules (`*.module.css`) for component
styles. Global styles go in `styles.css`.

### Backend (src-tauri/)
Rust code using the Tauri v2 API. Tauri commands are defined in `lib.rs` and
invoked from the frontend via `@tauri-apps/api`.

### Tauri Configuration
`src-tauri/tauri.conf.json` controls the app window, build settings, bundle
configuration, and security policies.

### Dev Server Port
Vite runs on port **1420** during development. Tauri connects to this URL
for the webview content.

---

## Git Workflow

### Branch naming

| Purpose | Pattern | Example |
|---------|---------|---------|
| AI-generated features | `claude/<description>-<session-id>` | `claude/add-auth-9mX0n` |
| Features | `feature/<description>` | `feature/settings-panel` |
| Bug fixes | `fix/<description>` | `fix/window-resize` |

- Default branch: **`main`**
- Never push directly to `main` — use a PR
- AI branches **must** start with `claude/` and end with the session ID

### Commit messages
Short imperative subject line, ≤72 characters:
```
Add settings sidebar component
Fix window not restoring last size
Remove unused import in App.tsx
```

---

## Coding Conventions

- **TypeScript** everywhere for frontend code
- **CSS Modules** for component styles — never inline style objects
- **No dead code** — delete unused files, imports, and variables
- **No premature abstraction** — extract a helper only when a pattern
  repeats three or more times

### Security
- Validate all data at system boundaries (IPC commands, external APIs, user input)
- Secrets go in environment variables, never in source code
- Review Tauri capabilities in `src-tauri/capabilities/` before adding new permissions

---

## Adding Dependencies

### Frontend (npm)
```bash
npm install <package>
```

### Rust / Tauri plugins
```bash
cd src-tauri
cargo add <crate>
```

For Tauri plugins, also add them in `lib.rs` via `.plugin()`.

---

## Updating This File

Keep this file current whenever:
- New directories or major files are added
- Build/run commands change
- A new dependency is added
- Coding conventions evolve
