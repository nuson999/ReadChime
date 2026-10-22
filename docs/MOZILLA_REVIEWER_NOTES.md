# ReadChime 0.2.3: notes for Mozilla reviewers

Requested channel: **unlisted / self-distributed**. The developer intends personal
use and does not request a public AMO listing. This is a Firefox desktop extension.

ReadChime stores a personal reading library, reading-time estimates, and reminder
settings locally. There is no developer account service, analytics, telemetry,
server upload, remote JavaScript, remote fonts, or background account API access.

Permissions:

- `storage`: local reading data and ephemeral UI/import state.
- `alarms`: daily reminders and reminder/session reconciliation.
- `notifications`: optional local reading reminder notifications.
- `https://play.google.com/books*`: outer reader metadata/URL observations and
  user-requested library imports on this path. The extension does not request
  general browsing-history, cookie, webRequest, or download permissions.

The reader URL's Google book ID is compared to the saved reader URLs. A newly
opened reader offers a start prompt; no reading time is recorded until the user
presses Start. If opening the toolbar popup is unavailable, an in-page prompt is
used. Timing counts confirmed visible observations approximately every five
seconds. A selected, non-minimized book tab may keep counting when another
application has keyboard focus. Hidden intervals are excluded. Returning within
five seconds continues automatically; longer absences require an explicit Resume
reading click in a collapsible card at the top right of the reader. Reloading or
directly selecting another tab of the same book preserves the session and grace
period. Merely visible readers in other windows cannot take over a session.
Opening a different book saves the previous confirmed intervals and waits for
another explicit start. A manual pause/stop is not undone by refresh or ordinary
tab switching. Book content/DRM iframe contents are never inspected.

An unknown book may be added after supported outer reader structure is detected.
Its outer document title or metadata supplies a title when available. A separate
library import runs only after an explicit dashboard request and saves only the
books the user selects; it does not crawl Google library pages or private APIs.

No Google account is needed to open the extension dashboard or build/test its
source. Real Google reading requires the user's own account and access to a book.
We do not provide or embed user credentials. Automated browser smoke tests use
synthetic outer reader/library metadata rather than authenticated private books.

Validation before packaging: 81 unit/integration tests, strict TypeScript,
ESLint, build/resource/size-budget checks, and Firefox extension lint. Firefox 158.0.1 smoke
tests cover reader prompts, the five-second grace period, collapsible resume UI,
trusted resume clicks, and continued counting in a visible unfocused window,
plus keyboard navigation of the statistics calendar.
Current authenticated Google reader layouts and actual cross-application window
occlusion have not been verified. Version 0.2.1 permanent signed installation and
restart persistence were verified in an isolated profile; a signed 0.2.3
package does not exist yet. Permissions and the content script are unchanged
from 0.2.2 except that the in-page prompt now follows the user's light/dark
theme setting and draws its play icon as an inline SVG built with DOM APIs.

`web-ext lint` reports two `UNSAFE_VAR_ASSIGNMENT` warnings inside the bundled
React DOM dependency. Application code does not use `dangerouslySetInnerHTML`,
evaluate user code, or insert book metadata as HTML. In-page prompt metadata is
assigned with `textContent`; the React interfaces use normal escaped rendering.
Third-party runtime licenses are included as `THIRD_PARTY_NOTICES.txt` in the
extension package.
