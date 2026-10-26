# ReadChime 0.2.6: source and reproducible build

This archive accompanies the publicly listed Firefox desktop extension
`readchime@local.invalid`, version 0.2.6, submitted to addons.mozilla.org.

## Build environment

The submitted package was built on Windows with Node.js 24.22.1 and npm 11.19.1.
Use those versions when reproducing the package. Node.js 22.19 or newer is required.
No credentials, API keys, environment files, Google login, or private services are
needed to build. Internet access is needed only to install public npm dependencies.

From the extracted source archive root, run:

```text
npm ci
npm run build
```

The complete extension is generated in `dist/`. Compare all files in that folder
with the uploaded `readchime-0.2.6.zip` (ZIP timestamps and compression are irrelevant).
The lockfile pins dependencies, including public React, Recharts, Zod, Vite,
esbuild, and Tailwind packages. All build tools run locally and are open source.
Tailwind source detection is explicitly limited to `src/ui/`, so unrelated files,
Git metadata, and the directory where the archive is extracted do not affect CSS.

`vite.config.ts` builds `popup.html` (entry `src/ui/popup.tsx`) and `dashboard.html`
(entry `src/ui/dashboard.tsx`); the statistics chart is a lazily loaded chunk. Then `scripts/build.mjs`
bundles the background and content scripts and generates third-party notices.
`scripts/check-build.mjs` verifies manifest metadata, packaged resource paths, and
the up-front JavaScript size budget of each page.
Minification is build output; the readable original TypeScript/React source is in
`src/`. Runtime dependencies are bundled; there is no remote executable code.

Optional static checks are `npm run typecheck`, `npm run lint`, and `npm test`.
Firefox/GeckoDriver are needed only for the optional browser smoke tests, not for
building. `npm run check` also runs Firefox extension linting.

## Archive contents and exclusions

Included: readable source, public manifest/locales/icons, build scripts, synthetic
tests, package manifest and lockfile, HTML entry points, and build configurations.
The source archive contains no `node_modules`, Git history, captured Google pages,
browser profiles, local reading backups, cookies, environment files, credentials,
or test screenshots/logs. User reading data is not part of either submission file.

## Review notes

See `docs/MOZILLA_REVIEWER_NOTES.md` for permissions, behavior, and validation limits.
