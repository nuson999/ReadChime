# Mozilla unlisted signing checkpoint

## Version 0.2.3 prepared for manual upload (2026-10-22)

Built from branch `feat/ui-perf-polish`. The user will upload this update
directly; nothing has been uploaded by the agent. Use the existing unlisted
add-on, not a new registration:

`https://addons.mozilla.org/ko/developers/addon/e82fa53c1dda474d995b/versions/submit/`

- Extension: `artifacts/readchime-0.2.3.zip` (SHA-256 `C7973F1F…C0FCEFE7`).
- Matching source: `artifacts/readchime-0.2.3-source.zip` (67 allowlisted files, SHA-256 `CFCFB743…543EFFDB`).
- Release notes: `docs/RELEASE_NOTES_0.2.3.md`.
- Rebuild evidence: `artifacts/readchime-0.2.3-reproducibility.json`.

The source archive was extracted into a new folder and built with a fresh
`npm ci` and `npm run build` (Node.js 24.20.0, npm 11.19.0); all 16 packaged
files match by SHA-256. The source ZIP holds committed file contents only.
Extension ID and permissions are unchanged. `npm run check` passed (81 tests,
zero web-ext lint errors, the same two bundled React DOM warnings), and all four
Firefox smoke tests passed on Firefox 158.0.1 before the version-only bump.
If 0.2.2 was never uploaded, 0.2.3 still applies cleanly as the next version.

## Version 0.2.2 prepared for manual upload (2026-10-22)

The user will upload this update directly. No version 0.2.2 package or source
has been uploaded by the agent, and no signed 0.2.2 XPI has been downloaded.
Use the existing unlisted add-on, not a new registration:

`https://addons.mozilla.org/ko/developers/addon/e82fa53c1dda474d995b/versions/submit/`

- Extension: `artifacts/readchime-0.2.2.zip`.
- Matching source: `artifacts/readchime-0.2.2-source.zip` (54 allowlisted files).
- Release notes: `docs/RELEASE_NOTES_0.2.2.md`.
- Rebuild evidence: `artifacts/readchime-0.2.2-reproducibility.json`.

The source archive was extracted into a new folder and built with a fresh
`npm ci` and `npm run build`, using Node.js 24.20.0 and npm 11.19.0. All 13
packaged files match the fresh rebuild by SHA-256. Browser profiles, reading
backups, credentials, screenshots, logs, Git history, and local artifacts are
excluded from the source ZIP. The extension ID and all permissions match 0.2.1;
the only manifest change is the version number.

`npm run check` passed with 81 tests and zero Firefox extension lint errors.
The two bundled React DOM warnings remain documented for reviewers. The reader
smoke test passed on Firefox 158.0.1 before the version-only packaging change,
including the 5-second grace period, trusted page resume, collapsed prompt, and
visible unfocused-window counting. Authenticated Google books and actual
cross-application window occlusion remain unverified.

Upload the extension ZIP as a new version, retain the self-distribution channel
and Firefox desktop target, then provide the matching source ZIP when asked
about bundled/minified code. Review notes and exact build instructions are in
the source archive. Submission and Mozilla approval are still pending.

## Previously approved version 0.2.1

Version: 0.2.1. Channel: self-distributed (unlisted), without a public AMO listing.

## Prepared and verified

- Extension archive: `artifacts/readchime-0.2.1.zip`.
- Reviewable source: `artifacts/readchime-0.2.1-source.zip`.
- Build instructions: `docs/MOZILLA_BUILD.md`.
- Reviewer notes: `docs/MOZILLA_REVIEWER_NOTES.md`.
- Exact rebuild comparison: `artifacts/readchime-0.2.1-reproducibility.json`.

The source ZIP was extracted to an isolated workspace folder and built using a
fresh `npm ci` installation. All 13 packaged files match the rebuilt files by
SHA-256. Tailwind source scanning is explicitly limited to `src/ui/` to prevent
unrelated files or extraction location from changing build output. TypeScript,
ESLint, all 73 tests, build/resource checks, and Firefox extension lint passed;
the two existing React DOM lint warnings remain disclosed in the reviewer notes.
The localization Firefox smoke test also passed after the CSS source-scan change.

The archive allowlist includes source, public assets, build/test scripts, package
manifests, and reviewer build notes. Browser profiles, captured Google HTML, local
reading backups, screenshots, logs, Git history, and environment files are excluded.

## Submission state

The user completed Mozilla login, additional developer authentication, and the
Firefox Add-on Distribution Agreement/review-policy consent directly in the UI.
The self-distribution channel was selected. The browser is on the authenticated
package upload step:

`https://addons.mozilla.org/ko/developers/addon/submit/upload-unlisted`

The user uploaded `readchime-0.2.1.zip`. Mozilla validation passed with zero errors
and three warnings: two existing React DOM innerHTML warnings, plus an Android
minimum-version/data-collection-permission warning. Only Firefox desktop is
selected; Firefox Android is not selected.

Validation report:
`https://addons.mozilla.org/ko/developers/upload/c9ba10391a7d4b698f874c19483faaec`

The package was continued, creating the unlisted draft add-on
`e82fa53c1dda474d995b`. The browser is now on:

`https://addons.mozilla.org/ko/developers/addon/e82fa53c1dda474d995b/submit/source-unlisted`

The user attached the matching source archive and completed submission. Although
the finish page still displayed its generic signature-pending message, the actual
version-management page confirmed version 0.2.1 was **Approved** and offered a
signed XPI. The source-code field has a Current view link, confirming attachment.

Approved version:
`https://addons.mozilla.org/ko/developers/addon/e82fa53c1dda474d995b/versions/6604594`

Signed download:
`https://addons.mozilla.org/firefox/downloads/file/5148715/e82fa53c1dda474d995b-0.2.1.xpi`

The downloaded file is preserved as `artifacts/readchime-0.2.1-signed.xpi`.
All runtime files match the submitted ZIP by SHA-256. Mozilla reformatted
`manifest.json`; its parsed fields and values are identical. Five `META-INF/`
signing metadata files were added. Verification details and the signed XPI hash
are saved in `artifacts/readchime-0.2.1-signed-verification.json`.

`node scripts/smoke-signed-firefox.mjs` passed in an isolated Firefox 158.0.1
profile. It creates a temporary installation with synthetic reading-library data,
installs the signed XPI normally without uninstalling the temporary extension,
checks that existing data survives, fully quits Firefox, and opens the same
profile again **without calling installAddon**. The extension and stored data
remain available. The profile metadata records `location: app-profile` and
`signedState: 2`. Evidence: `.tmp/signed-firefox-qa.json`.

Before changing the user's installed temporary extension, export its reading data
to a local JSON backup. Do not upload that backup to Mozilla. Do not uninstall the
temporary extension as an installation shortcut that could discard local data.
Permanent signed installation and restart persistence are verified in that
isolated profile. The user's primary Firefox profile has not been changed by
automation. Install the signed XPI once using Firefox's Add-ons Manager → Install
Add-on From File. Do not create another AMO add-on; use the existing add-on/version
management pages for future signed updates.
