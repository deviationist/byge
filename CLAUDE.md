# CLAUDE.md

byge is an **Expo Router PWA** — React Native Web, web-first, no native build.
Metro bundles it; there is no vite, no webpack, and no Bun runtime anywhere in
the tree.

`AGENTS.md` is the working reference: data-source gotchas, conventions, app-layer
gotchas, and the test philosophy. `README.md` has the data model and
`ARCHITECTURE.md` the module map. This file covers only the toolchain.

## Toolchain

| | |
|---|---|
| Package manager | **pnpm**, pinned via `packageManager` in `package.json` |
| Bundler / dev server | Metro, through Expo (`metro.config.cjs`) |
| Tests | **vitest** + jsdom + Testing Library |
| Lint / format | biome |
| Styling | uniwind (Tailwind for RN), Metro plugin only, no Babel |

```bash
pnpm install
pnpm run web        # expo start --web  → dev server on :8081
pnpm start          # expo start        → chooser: w/i/a, QR for Expo Go
pnpm test           # vitest run
pnpm run typecheck  # tsc --noEmit
pnpm run lint       # biome lint .
pnpm run build:web  # expo export -p web && node scripts/postexport.mjs
```

**Do not use Bun here.** It was the original scaffold's installer and `bun.lock`
was removed on 2026-08-05. Nothing uses Bun's runtime — no `Bun.serve`, no
`bun:sqlite`, no `bun test` — and swapping the installer means re-validating
Metro, Expo and the PWA export against a different `node_modules` layout for no
functional gain. pnpm's strict symlinked layout works with RN 0.85 unmodified:
no `.npmrc`, no `node-linker=hoisted`, no resolver workaround.

## Toolchain gotchas

- **pnpm blocks postinstall scripts by default.** A dependency that needs one is
  allowlisted in `pnpm-workspace.yaml` under `allowBuilds`. `esbuild` is there
  because vite/vitest need it to link its platform binary; without it 
  `pnpm install` warns `ERR_PNPM_IGNORED_BUILDS` and esbuild is silently unbuilt.
- **Node 25 ships broken `localStorage`/`sessionStorage` globals.** They throw on
  every method call unless `--localstorage-file` names a real path, and vitest's
  jsdom environment will not override an existing global. `vitest.setup.ts`
  borrows a real Storage pair off a throwaway jsdom window. Do not remove it, and
  note `window === globalThis` under vitest, so there is nothing to recover from
  `window`.
- **`metro.config.cjs` blocks colocated tests from the bundle.** expo-router
  builds its route table from a `require.context` over `app/` whose regex does
  not exclude `*.test.*`, so a colocated test becomes a "route" and drags vitest
  into the web bundle. Vitest runs them directly; Metro must never see them.
- **`expo export` rewrites `expo-env.d.ts` and appends to `.gitignore`.** It
  discards the hand-written `declare module "*.css";`. Harmless — `uniwind/types`
  covers it — but it dirties the tree on every build.
- **`build:web` is two steps.** `app.json` sets `web.output: "single"` (SPA), so
  Expo owns the HTML template and `+html.tsx` never runs; the PWA head tags are
  injected afterwards by `scripts/postexport.mjs`.
