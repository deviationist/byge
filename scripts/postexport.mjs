/**
 * Injects PWA head tags into the exported SPA.
 *
 * Expo Router's `+html.tsx` only applies to `output: "static"` (SSG). We ship
 * `output: "single"` (SPA), where Expo owns the HTML template — so the tags it
 * cannot express have to be injected after export. Keeping this as an explicit
 * build step is better than a `+html.tsx` that looks live but never runs.
 *
 * Run by `bun run build:web`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const HEAD = `
    <link rel="manifest" href="/manifest.webmanifest" />
    <!-- Per-scheme, so browser chrome matches the app rather than always being
         light. Values must equal the manifest background_color, or the splash
         hands over to a differently-coloured app and reads as a page load. -->
    <meta name="theme-color" content="#F6F4F0" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#0E1113" media="(prefers-color-scheme: dark)" />
    <!-- Tells the UA both palettes exist, so form controls and scrollbars follow
         the theme instead of defaulting to light. -->
    <meta name="color-scheme" content="light dark" />
    <!-- iOS Safari ignores most of the web manifest; without these an installed
         PWA opens as a plain tab. -->
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="byge" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
    <link rel="icon" href="/icons/favicon.svg" type="image/svg+xml" />
`;

export function injectHead(html) {
  if (html.includes('rel="manifest"')) return html; // idempotent
  // viewport-fit=cover so safe-area insets are real on notched phones.
  const withViewport = html.replace(
    /<meta name="viewport"[^>]*>/,
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />',
  );
  // Expo emits its own bare theme-color; the media-scoped pair replaces it.
  const withoutBare = withViewport.replace(/\s*<meta name="theme-color" content="[^"]*">/, "");
  return withoutBare.replace("</head>", `${HEAD}  </head>`);
}

const path = join(process.cwd(), "dist", "index.html");
writeFileSync(path, injectHead(readFileSync(path, "utf8")));
console.log("postexport: injected PWA head tags into dist/index.html");
