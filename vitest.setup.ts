import { JSDOM } from "jsdom";
import "@testing-library/jest-dom/vitest";

// Node 25 ships `localStorage`/`sessionStorage` as globals (`--webstorage`, on
// by default), and they throw on every method call unless `--localstorage-file`
// names a real path. Vitest's jsdom environment only installs a window key when
// globalThis lacks it, so Node's inert built-ins win and the tests see a
// Storage without `.clear`. There is nothing to recover from `window` either —
// vitest makes `window === globalThis`, so both names reach the same broken
// object. So borrow a spec-compliant Storage pair off a throwaway jsdom window.
// One per test file, which is also the isolation the tests want.
//
// Fixing it here rather than via NODE_OPTIONS='--no-experimental-webstorage'
// because setupFiles runs on every invocation path — IDE runners and bare
// `vitest` included — and needs no per-shell env plumbing.
// `poolOptions.forks.execArgv` is not an option: vitest sets the fork's
// execArgv itself and drops ours.
const donor = new JSDOM("", { url: "http://localhost" }).window;
for (const key of ["localStorage", "sessionStorage"] as const) {
  Object.defineProperty(globalThis, key, {
    value: donor[key],
    configurable: true,
    writable: true,
  });
}
