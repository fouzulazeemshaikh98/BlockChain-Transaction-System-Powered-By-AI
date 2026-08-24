# Architecture Notes

## App-wide DevTools deterrent + admin-PIN-gated lock overlay

- **Scope clarified up front**: the request was to "lock inspect element"
  app-wide with an admin PIN required to get past it. Browser DevTools
  cannot actually be blocked from page JavaScript - anyone can still open
  them via the browser's own menu, or by disabling JS first, no matter
  what the page does. Asked the user to choose between a plain deterrent
  and a fuller deterrent-plus-PIN-gated-overlay version; they chose the
  fuller version, which is what's built here. Both the component's own
  doc comment and this note say the same thing: **this is not real
  security**, it's a deterrent against casual snooping, not a barrier
  against someone who knows how browsers work.
- **`components/DevToolsGuard.tsx`**, mounted once in `App.tsx` as a
  sibling of `<Routes>` (outside `Protected`/`Layout`) so it applies to
  every route including `/login`. Two independent pieces:
  1. A permanent deterrent, always active regardless of the overlay
     below: `contextmenu` is blocked app-wide, and the common DevTools
     keyboard shortcuts (F12, Ctrl+Shift+I/J/C, Ctrl+U) are
     `preventDefault()`'d.
  2. Two independent heuristics for "DevTools looks open," either one
     showing the full-screen lock overlay, polled every second:
     - **Window-size delta** (`outerWidth - innerWidth` /
       `outerHeight - innerHeight` past a threshold) - catches DevTools
       docked inside the tab. Known to be imperfect: can false-positive
       on a genuinely resized/maximized window, and structurally cannot
       see DevTools undocked into its own OS window, since that doesn't
       change this tab's dimensions at all.
     - **`debugger;` pause-timing** - a `debugger;` statement halts JS
       execution for as long as DevTools is actually open and attached,
       docked or undocked, because the pause is triggered by DevTools
       being open, not by any window geometry. Measuring how long the
       statement "took" (normally sub-millisecond; well over 100ms if
       DevTools paused there) catches the separate-window case the
       size-delta check structurally can't. This is also the more
       intrusive of the two - while DevTools is open, the page will
       actually freeze at each `debugger;` hit until it's resumed, once
       per second. Still bypassable (DevTools' own "deactivate
       breakpoints" toggle, or disabling JS before opening DevTools),
       consistent with this feature's stated non-goal of being real
       security.
- **Unlock is a supervisor-override PIN check, not the current session's
  own credentials** - reuses the same pattern already established for
  the Credential Vault's "change a user's PIN" feature. The overlay
  form takes an admin's email + PIN, calls `POST
  /api/auth/verify-admin-pin` (`[Authorize]`, callable by any
  authenticated user - deliberately not role-restricted on the *caller*,
  since the whole scenario is a locked-out non-admin needing an admin
  present; only the email/PIN pair being checked must itself resolve to
  an active Admin).
- **The PIN is required every time DevTools is opened, not just once per
  tab session.** A successful unlock only suppresses the overlay for as
  long as DevTools stays continuously detected open right after that PIN
  entry (in-memory `useRef`, not `sessionStorage`) - the moment neither
  heuristic sees it open any more, the override is dropped. Close
  DevTools and reopen it a minute later in the same tab and the PIN
  prompt reappears; there's no "remember this tab" bypass.
- **Failed unlock attempts join the existing security audit trail** -
  `AuthController.VerifyAdminPin` logs to the same `LoginAttempt` table
  as every other PIN/login gate in this app, tagged `Context =
  "DevToolsOverride"`, with IP/geo/device captured the same way failed
  logins already are. Verified end-to-end: wrong PIN -> `401` + a
  logged `DevToolsOverride` row; correct admin PIN -> `204`.

## Login page restyled after a PayPal login reference (minus payment method)

- **`pages/Login.tsx` rebuilt to match a supplied PayPal login screenshot**:
  logo + wordmark centered above the heading, plain placeholder-only
  inputs (no separate label above each field, unlike this app's usual
  `.field` pattern elsewhere), a "Stay signed in" checkbox with a help
  icon and "Not recommended on shared devices" caption, a solid full-width
  primary button, and a "Having trouble logging in?" link below it -
  explicitly **without** the reference's "Pay with Debit or Credit Card"
  button/divider, which wasn't wanted and doesn't apply to this app anyway.
  "Having trouble logging in?" isn't a dead link - it reveals a short note
  pointing at the Admin-driven password/PIN reset paths that already exist
  (there's still no self-service reset flow, deliberately, per the earlier
  discussion on this same page about not building one insecurely).
- **"Stay signed in" is real, not just decorative**: `lib/api.ts`'s
  session storage now picks between `localStorage` (persists across
  browser restarts) and `sessionStorage` (cleared when the tab/browser
  closes) based on the checkbox, threaded through
  `login(email, password, remember)` → `AuthContext` → `Login.tsx`. Reads
  (`getToken()`, `getCurrentUser()`) check both storages since either
  could hold the live session; `clearSession()` (used by `logout()` and
  the 401 interceptor) clears both so switching between a "remembered"
  and "not remembered" login never leaves a stale token behind in the
  other storage.

## "Create Account" removed from the Login page

- **`pages/Login.tsx`** no longer has the "No account? Create Account"
  link - a deliberately minimal change, scoped to exactly what was asked
  (the login page's entry point), not a broader "disable self-registration"
  change. The `/register` route, `pages/Register.tsx`, and the backend's
  `POST /api/auth/register` endpoint are all still intact and still
  reachable by anyone who navigates to `/register` directly - only the
  visible link from Login is gone. Given this session's account-creation
  work has been moving toward Admin-provisioned accounts (the Create User
  form in Admin's Users tab, now with all three roles), removing the
  self-serve entry point fits that direction, but fully retiring
  self-registration wasn't what was asked here.

## Third role: "User", restricted to Send Transfer only

- **New `UserRole.User`**, appended at the end of the enum
  (`Analyst=0, Admin=1, User=2`) deliberately - EF Core stores this as a
  plain `int` with no explicit conversion configured, so inserting a
  value earlier would have silently renumbered every existing `Admin`
  row. No migration needed since no column changed, just the range of
  valid values written into it.
- **Enforced on the backend, not just hidden in the UI** - this project's
  running pattern for every gate so far. `[Authorize(Roles = "Admin,
  Analyst")]` added to: `DashboardController` and `TemplatesController`
  (whole controller), `ReportsController.List()`, and
  `TransactionController`'s `Create`/`List`/`Get`/`Update`/`Delete`. Left
  deliberately open to every authenticated role: `NocController.Verify`,
  `TransactionController.CreateTransfer`/`Settle`/`Analyze`/`Reanalyze`,
  and `ReportsController.Get(id)` - together these are the entire Send
  Transfer flow (upload NOC → create transfer → analyze → settle → view
  the resulting report), and `Get(id)`/`Settle`/etc. were already
  ownership-scoped (`UserId != CurrentUserId → Forbid`) before this, so a
  `User`-role account still only ever sees its own transaction hash, the
  same as an Analyst already could.
- **Frontend mirrors the same split**: `components/ProtectedRoute.tsx`
  gained a `restrictTo` prop; `App.tsx` wraps Dashboard/Transactions/
  Reports/Report/Templates with `restrictTo={["Admin","Analyst"]}` and
  Admin with `restrictTo={["Admin"]}` (a pre-existing gap - the Admin
  page had no client-side guard at all before this, only relying on each
  API call's own 401/403). `components/Layout.tsx` hides every nav
  link except Send Transfer, and the search box/notification bell
  (both tied to Dashboard/Transactions data the role can't reach) for
  `role === "User"`, and skips the `fetchDashboardSummary()` call
  entirely rather than firing a request that's just going to 403.
  `pages/Login.tsx` routes a `User`-role login straight to
  `/send-transfer` instead of the Dashboard it would've been immediately
  redirected away from.
- **Admin's user management** got a real 3-way role picker (`<select>`
  with Analyst/Admin/User) in both the Create User form and the per-user
  detail panel, replacing the old binary "Promote to Admin"/"Demote to
  Analyst" toggle button that only made sense with two roles.
- **Verified live**, not just by reading the code: created a `User`-role
  account via the Admin API, logged in as it, and confirmed
  `/api/dashboard/summary`, `/api/transactions`, `/api/reports`, and
  `/api/templates` all return `403`, while `/api/wallets`,
  `/api/auth/profile`, `/api/noc/verify` (a real NOC, verdict `genuine`),
  and `/api/reports/{id}` (reached the ownership check and returned `404`
  for a nonexistent id, not a role-based `403`) all still work.

## The Australia "From Country" gap was a stale orphaned process, not code

- **Root-caused, not left as a "known minor gap"**: the previous entry
  below wrote off `originCountry: null` for the Australia specimens as a
  cosmetic quirk after a restart didn't fix it. It kept coming back
  wrong specifically (and only) for the country whose city hints were
  *added* after the AI engine was first started this session, which was
  the actual clue. `tasklist` turned up **two** leftover
  `python3.12.exe` processes still alive after "killing" the one bound to
  port 8000 - `uvicorn --reload` runs a parent reloader plus a child
  worker, and repeated restarts across this long session had only ever
  killed whichever one happened to be listening, leaving an orphaned
  process from *before* the Australia hints were added to keep serving
  requests. A full `taskkill` of every stray python process, followed by
  one clean start, immediately resolved it - verified live for all five
  countries (`originCountry` now resolves correctly everywhere), and this
  fixed `pages/SendTransfer.tsx`'s result page and `lib/receiptPdf.ts`'s
  "From Country" row for free, since both already read directly from the
  NOC response's `originCountry` field - there was no frontend bug to fix,
  the data reaching them was just wrong at the source.

## Specimen NOCs: signature added, watermark shrunk (not removed)

- **Added a signature graphic** above the "Authorized Signatory" line in
  the NOC generator (drawn as a stylized cursive scrawl + one small
  flourish loop, not tied to any real person's handwriting) - drawn on
  the same single-pass `ImageDraw` surface as everything else, for the
  same reason the stamp is (see the entry below on why that matters to
  the forensic checks).
- **Declined to remove the SPECIMEN watermark outright** - asked for
  twice now, rephrased both times. Shrunk it instead: from a large
  diagonal band spanning most of the page width to a small tag tucked in
  one corner of the blank space below the stamp. The footer disclaimer
  ("not a valid government-issued document...") is untouched. Combined
  with a signature and a stamp, a completely unmarked version of these
  five documents would be indistinguishable from a real forged NOC for
  an actual real-world country - that line held even as the ask got more
  insistent.
- **Fixed a knock-on false-positive the signature caused**: adding
  hand-drawn ink to the page shifted the document's *background*
  reference statistics (`noc_forensic_service.py` compares the stamp
  region against the page's other ink) enough to occasionally tip the
  ELA compression-error ratio across the "suspicious" threshold - caught
  by testing all ten against the live engine after adding it, not
  assumed safe just because the signature was drawn single-pass. Thinned
  the signature strokes (width 2 down to 1, one flourish loop instead of
  two) and, since the failures clustered entirely on documents using the
  navy/blue stamp ink color, pinned the stamp to red ink only rather than
  alternating - all ten now pass live verification (`authenticityScore:
  80-100`, `verdict: "genuine"`, `transferUnlocked: true`), confirmed via
  the actual running backend for every file, not just a subset.

## Google Maps link for failed-login/PIN locations

- **`GeoLocationService` now returns coordinates, not just a display
  string**: `ResolveAsync()` returns a `GeoLocation` (`City`, `Country`,
  `Latitude`, `Longitude`, plus a computed `DisplayText`) instead of a
  bare `string?`. `LoginAttempt` gained `Latitude`/`Longitude` columns
  (nullable `double`, new migration), populated alongside `Location` at
  every call site that already logs a failed login/PIN attempt.
- **Login Activity's Location cell links to Google Maps**
  (`https://www.google.com/maps?q={lat},{lon}`, opened in a new tab) when
  coordinates are available - which they aren't for the
  "Local/Private Network" case (this dev environment's own attempts),
  since there's no real point on a map for that; the cell falls back to
  plain text there rather than a dead link.
- **Still deliberately IP-based, not device GPS** - this is the second
  time this exact ask came up rephrased ("location from Google Maps" vs.
  "live location"), so the reasoning is worth restating here: a login/PIN
  form silently capturing or prompting for the browser's actual GPS
  position on a *failed* attempt is an invasive pattern regardless of
  intent, and isn't what got built. What's here is the legitimate version
  of the same underlying goal - coarse, IP-derived location for a
  security audit trail, now with a one-click way to actually *see* it on
  a map, matching what real account-security tooling (GitHub, Google,
  banks) shows for "unusual login location" - not a tracking feature.
- **Verified the JSON deserialization directly**, not just by reading the
  code: `System.Net.Http.Json`'s default `GetFromJsonAsync<T>()` behavior
  around case sensitivity wasn't something to assume, so `GeoResponse`'s
  properties got explicit `[JsonPropertyName]` attributes, and a
  standalone throwaway console project running the exact same
  request+model against `ip-api.com`'s real response confirmed
  `lat`/`lon` parse correctly end-to-end before trusting it in the app.
  (Every attempt through the actual running backend in this environment
  is from localhost, which short-circuits to "Local/Private Network"
  before ever calling the external API - so this external-call path
  specifically needed the standalone test to be verified at all here.)

## Specimen NOC fixtures that actually verify as genuine

- **The first batch of specimen NOCs (previous entry below) all came back
  "forged"** - not a bug in the app, but in how the fixtures were built.
  Traced it against the actual verification pipeline
  (`ai-engine/services/noc_forensic_service.py`, `noc_stamp_service.py`,
  `noc_ocr_service.py`, `api/routes/noc.py`) rather than guessing:
  - The stamp had been drawn on a *separate* RGBA layer, rotated, and
    alpha-composited onto the page. That's exactly the splice signature
    `noc_forensic_service.py`'s ELA/edge/noise checks - and the CNN
    forgery classifier, trained via `scripts/generate_cnn_dataset.py` on
    synthetic "genuine" (single-pass, drawn once) vs. "forged" (separately
    noised/compressed donor pasted in) stamps - are specifically built to
    catch. Fixed by drawing the stamp directly on the same `ImageDraw`
    surface as the rest of the page, no separate layer, no rotation, and
    simplifying it structurally closer to the CNN's actual training
    pattern (two rings, two text lines) after a busier design still
    triggered a false positive on one sample.
  - The authorized-amount field is a **hard reject** in
    `api/routes/noc.py` if unparseable (`_check_authorized_amount` forces
    `verdict="forged"`) - the label needs the exact phrase the OCR regex
    expects (`authorized\s*monthly\s*(?:transfer\s*)?amount`), which
    "Allowed Transfer Amount" didn't match at all. Added a dedicated
    "Authorized Monthly Transfer Amount: USD X" banner drawn as one
    continuous text line (not split across a table's label/value columns)
    so OCR reliably captures it.
  - `origin_city` was being captured from a "Country of Origin" row
    instead of the actual "Origin City" row, because `_first_match()`
    takes the *first* regex match in the whole page text and "Country of
    **Origin**:" matched the origin-city pattern before the real
    "**Origin** City:" row did. Renamed the country field to "Applicant
    Country" to remove the collision.
  - Australia had no recognized city in `noc_ocr_service.py`'s
    `_COUNTRY_HINTS` (only Pakistan/UAE/UK/Qatar/Saudi cities were listed,
    predating Australia being added as a recipient country) - added
    Sydney/Melbourne/Canberra so origin-country resolution works for it
    too, not just verdict.
  - Verified the fix at three levels before calling it done: importing
    `extract_fields`/`locate_stamp`/`run_checks` directly in a local
    Python REPL against the generated files, then the full
    `POST /api/noc/verify` through the actually-running backend
    (PIN-gated), confirming `verdict: "genuine"` and `transferUnlocked:
    true` for samples across all five countries.

## Vault-only PIN changes, PIN/login audit trail with IP geolocation

- **PIN changes moved from the Users tab into the Credential Vault
  exclusively** - the per-user "Reset PIN" form in `UsersPanel`'s
  `SlideOver` is gone; `CredentialVaultPanel` now has a "Change a User's
  Transfer PIN" section (user picker + new PIN, same `PUT
  /api/admin/users/{id}/pin` endpoint) that only appears after the same
  password re-verification that unlocks the demo credentials - one gate
  for both.
- **The login audit trail now covers PIN attempts, not just logins**:
  `LoginAttempt` gained `Context` ("Login", "VerifyNoc", "CreateTransfer",
  "Settle", "Approve") and `Location`. `TransactionController` and
  `NocController`'s `VerifyCallerPinAsync` helpers now log a row on every
  *failed* PIN check the same way `AuthController` already logged failed
  logins - one unified table/admin view for "someone got a credential
  wrong," regardless of which of the five gates it was.
- **`GeoLocationService`** resolves a best-effort city/country from the
  caller's IP (free `ip-api.com` JSON endpoint, 2s timeout, degrades to
  `null` on any failure) - deliberately **only ever called on the failure
  path**, never on a successful PIN check, so the extra network round-trip
  never adds latency to normal settle/approve/transfer actions. Loopback
  and private-range IPs (the only kind this local dev setup ever sees)
  short-circuit to `"Local/Private Network"` without an external call.
  This is coarse IP-based geolocation for a security log, not device GPS -
  see the inline discussion of why live-location capture on a failed
  login wasn't built as literally requested.
- Verified live: a wrong PIN on NOC verify and a wrong login password each
  produced a row with the correct `Context`, `FailureReason`, and
  `Location: "Local/Private Network"` (since this is a local dev
  environment) in `GET /api/admin/login-attempts`.

## Shared receipt PDF, now on Transactions records too

- **`lib/receiptPdf.ts`**: the transfer-receipt PDF generator (letterhead,
  status pill, big amount, zebra-striped detail table, QR + disclaimer
  footer, government-emblem/red-stamp watermark) was a closure local to
  `pages/SendTransfer.tsx`. Extracted into a shared `downloadReceiptPdf()`
  taking the same prop shape as `components/TransactionResult.tsx`, so
  it's no longer tied to being generated only right after a live
  settlement.
- **`pages/Transactions.tsx` gained a "Receipt" action**, shown only for
  `settlementStatus === "Executed"` rows, alongside the existing "PDF"
  (forensic report) button - the two are different documents for
  different purposes (settlement receipt vs. risk analysis report), both
  now available directly from the records list rather than only from
  their respective single-transaction pages. Assembles the data the
  receipt needs (sender account number via `fetchProfile`, recipient
  account number by matching `recipientAddress` against `fetchWallets()`,
  applicant name/countries via `fetchNocDocument`) since the list view's
  `TransactionResponse` rows don't carry all of it directly -
  `NocDocumentDetail` (`lib/api.ts`) was missing `applicantName`/
  `originCountry`/`destinationCountry`/etc. even though the backend
  already returned them; extended the type to match.

## Five-country recipient coverage, two-sided transfer-amount limit, specimen NOC fixtures

- **Recipient accounts for all five requested countries**: UAE (Dubai) and
  UK (London) were already seeded; added three more `WalletAccount` rows
  via the existing Admin API - Riyadh Branch (Saudi Arabia), New York
  Branch (United States), Sydney Branch (Australia) - so Send Transfer's
  recipient dropdown now covers Saudi Arabia, UAE, USA, UK, and Australia.
- **Two-sided transfer amount limit**: previously the amount field only
  had an upper bound (the NOC's remaining monthly limit) and a token
  `min="1"`. Added a real floor - `MIN_TRANSFER_AMOUNT = 10` in
  `pages/SendTransfer.tsx` and a matching `MinTransferAmount = 10m` in
  `TransactionController.CreateTransfer` - enforced both client-side
  (inline error before the PIN prompt even opens) and server-side (`400`
  before the NOC/risk checks run), plus a "Min $10 · Max $X" hint under
  the input. Verified via curl against a genuine NOC: amount `5` → `400
  Amount is below the minimum transfer of $10.`; amount above the NOC's
  remaining limit → the existing `403` over-limit message, both bounds
  independently confirmed live.
- **Specimen NOC test fixtures** (not part of the app codebase - a
  one-off generation script, output saved to the user's `Downloads`
  folder): 10 JPG "No Objection Certificate" images (2 per country × the
  5 countries above, male applicants), built with Pillow rather than
  jsPDF since the NOC upload flow requires an image (PNG/JPG), not a PDF.
  Each carries every requested field (name, age, passport no., country,
  resident number, DOB, gender, allowed amount, issuing authority) in a
  ruled table, plus a generic circular "official seal" graphic and a
  large diagonal **SPECIMEN** watermark plus a footer disclaimer
  ("not a valid government-issued document") - deliberate, not
  incidental: these use a fictional issuing office and a generic seal
  design rather than reproducing any real government's actual document,
  seal, or emblem, so they're unambiguous test fixtures for this app's own
  NOC-verification AI rather than something that could pass as a real
  official document. Iterated on the seal's text rendering after the
  first pass produced mirrored/garbled curved text (a naive
  even-angle-split bug); rebuilt with per-glyph width-based angular
  spacing, then simplified to straight text lines inside the seal circle
  entirely once that still looked fragile at this seal's radius - legible
  and clean won out over "technically curved."

## Professional PDF everywhere transactions appear

- **`lib/reportPdf.ts`, a new shared generator**: `downloadReportPdf(report)`
  replaces `pages/Report.tsx`'s old plain-text `handleExportPdf` (heading +
  label/value lines only) with the same visual language established for
  the transfer receipt - a letterhead, a colored status pill sized to its
  text, a large centered risk score, a zebra-striped ruled transaction
  table, a diagonal low-opacity risk-level watermark, and a QR-code +
  disclaimer footer. New on top of the receipt's patterns: horizontal bar
  rows for the four module scores, and severity-colored left-accent blocks
  for each detected anomaly. Multi-page safe via an `ensureSpace()` guard
  before every block (the receipt didn't need this - it's always one
  page - but a report with many anomalies can run long).
- **`pages/Transactions.tsx` gained a per-row PDF button** - previously
  the only way to get a PDF was to open the individual Report page first.
  `handleDownloadPdf(id)` calls `fetchReport(id)` to get the full
  analysis (the list view's `TransactionResponse` rows don't carry
  anomalies/module scores) and feeds it into the same shared generator, so
  the PDF is identical in quality whether it's downloaded from the list or
  from the report page itself.
- **Verified by actually rendering it**, not just `tsc`: bundled
  `reportPdf.ts` standalone with esbuild (`external: ["jspdf", "qrcode"]`,
  the same technique used earlier for the receipt's Node smoke test) and
  ran it against representative long-value/multi-anomaly test data. Caught
  and fixed a real bug this way - the anomaly severity badge (e.g.
  "CRITICAL") was rendering flush against the anomaly type text with no
  gap, because its x-offset was computed with `getTextWidth()` called
  *after* the font size had already changed for the badge, measuring the
  wrong font's width. Fixed by capturing the type text's width before
  switching fonts.

## Edit removed from Transactions

- **`pages/Transactions.tsx` no longer has an Edit action** - the Edit
  button, its `SlideOver` form (transaction hash/network/addresses/amount/
  gas/nonce/description), the `EditForm` interface/`toEditForm()` helper,
  and the `editing`/`editForm`/`editSaving`/`editError` state were all
  removed together rather than just hiding the button, so there's no dead
  state machine left behind. Row actions are now just View Report,
  Re-analyze, and Delete (itself already restricted to successfully
  settled transactions).
- `lib/api.ts`'s `updateTransaction()` and the backend's
  `PUT /api/transactions/{id}` endpoint were left in place - removing a
  frontend entry point isn't the same claim as "nothing should ever be
  able to edit a transaction," and the backend capability may still be
  useful elsewhere; only the one UI surface that exposed it was removed.

## Table restyle #2: zebra stripes instead of a bordered grid

- **The full bordered grid from the previous pass didn't read as
  "professional"** - it landed closer to a raw spreadsheet. Replaced
  app-wide (same six tables: Admin's five plus the new Credential Vault
  one, plus `Transactions.tsx` and `Dashboard.tsx`'s recent-transactions
  table) with a zebra-striped look instead: no cell borders and no
  `border-collapse` at all, alternating row backgrounds via Tailwind's
  `odd:bg-white even:bg-slate-50` on each `<tr>`, a `hover:bg-slate-100`
  state on top of that for interactive rows, and the header row keeps its
  solid `bg-slate-100` fill with bold/uppercase/letter-spaced text from
  the previous pass (that part did read as professional and was kept).
- **Scripted removal, same as the addition was**: stripped every
  `border border-slate-200` / ` border-collapse` occurrence and swapped
  the row-level hover classes in one Python pass across the three files,
  then re-grepped for `border-slate-200`/`border-collapse` in all three to
  confirm nothing was missed.
- The `CredentialVaultPanel` table's ad hoc wrapper div was also folded
  into the same `surface-card overflow-hidden` convention every other
  table's wrapper already uses, instead of a one-off custom border.

## Re-auth-gated Credential Vault; successful-only transaction deletion

- **Demo credentials moved behind a password re-check, not just "you're an
  Admin"**: the inline banner added earlier this session is gone from
  `pages/Admin.tsx`'s overview. In its place, a new "Credential Vault" tab
  (`CredentialVaultPanel`) starts locked - it only reveals the seeded demo
  accounts after the caller re-enters their *own* login password, verified
  server-side by a new `POST /api/admin/vault/demo-credentials`
  (`AdminController.RevealDemoCredentials`) that calls the existing
  `AuthService.ValidateCredentialsAsync(me.Email, password)` before
  returning anything - the same re-proof-of-identity pattern as a bank
  asking for your password again before showing a full card number. The
  credentials themselves are still the static seed values from
  `Program.cs`'s first-run seeding (a real secrets-manager/DB-backed vault
  would be overkill for two hardcoded demo logins) - what's new is the
  gate, not a new storage layer.
- **Successful-only transaction deletion**: `TransactionController.Delete`
  now rejects (`400`) deleting any transaction whose
  `SettlementStatus != Executed` - pending/blocked/failed transfers must
  stay on file rather than quietly disappearing. `pages/Transactions.tsx`
  mirrors this client-side (Delete button disabled with an explanatory
  `title` tooltip unless `settlementStatus === "Executed"`), and
  `handleDelete` now also surfaces the backend's rejection message via
  `window.alert` as a defense-in-depth fallback.
- **Verified via curl**: wrong vault password → `401`; correct password →
  full credential payload; deleting a `NotAttempted` transaction → `400
  Only successfully settled transactions can be deleted.`

## Full bordered-grid table styling

- **Every data table in the app** (`pages/Admin.tsx`'s five tables -
  Users, Login Activity, AI Analysis Logs, Sanctions Watchlist, Recipient
  Accounts - plus `pages/Transactions.tsx` and the recent-transactions
  table on `pages/Dashboard.tsx`) moved from a bare bottom-border-per-row
  look to a full bordered grid: every `<th>`/`<td>` now carries
  `border border-slate-200`, the `<table>` gets `border-collapse` so
  adjacent cell borders merge into single lines instead of doubling up,
  and the header row gets a `bg-slate-100` fill with bold, uppercase,
  letter-spaced text (`font-semibold uppercase tracking-wide`) instead of
  the previous plain `text-slate-500 font-medium` - a formal
  spreadsheet/ledger look rather than the softer row-divider style used
  before.
- **The shared `SortableHeader` component** (used by the sortable columns
  across several Admin tables) got the same border/weight treatment
  directly in its one definition, so every sortable column picked it up
  without touching each call site.
- **Mechanical, scripted edit**: with ~40 `<th>`/`<td>` cells across three
  files following a small number of repeated class-string patterns, this
  was done with a Python find/replace pass (matching this session's
  established pattern for this kind of change, e.g. the earlier
  `rounded-xl`→`rounded-lg` pass) rather than one-by-one manual edits, then
  verified nothing was missed by re-grepping for `<th className=`/
  `<td className=` across all three files afterward.

- **Demo credentials no longer public**: the "Demo: admin@.../analyst@..."
  hint that used to sit under the Login form (visible to anyone, logged in
  or not) is gone from `pages/Login.tsx`. The same text now lives in an
  info banner at the top of `pages/Admin.tsx`, which is only reachable at
  all behind `[Authorize(Roles = "Admin")]` on the backend and the
  Admin-only nav/route on the frontend - so it's now only ever shown to
  someone already authenticated as an Admin, not leaked pre-login.
- **New Admin-only PIN reset**: `PUT /api/admin/users/{id}/pin`
  (`AdminController.SetUserPin`, same 4-6-digit validation as account
  creation, hashed via the existing `AuthService.HashPin`) lets an Admin
  set any user's transfer PIN - including their own; unlike
  deactivate/demote there's no self-action guard needed, since setting
  your own PIN can't lock you out. Surfaced in the Users tab's existing
  per-user `SlideOver` as a small "Reset Transfer PIN (Admin-only)" form
  next to the existing promote/deactivate/delete actions.
- **Verified end-to-end via curl**: reset the admin account's own PIN from
  `1234` to `5678`, confirmed `/api/noc/verify` then rejects the old PIN
  (`401`) and accepts the new one (`200`), then reset it back to `1234` so
  the (now Admin-only) demo credentials stay accurate.

## Professional receipt PDF layout

- **Rebuilt `handlePrintReceipt()` in `pages/SendTransfer.tsx`** from an ad
  hoc "label ... bold value" text dump into an actual laid-out document:
  a letterhead (wordmark + tagline left, "OFFICIAL RECEIPT" + issue
  timestamp right, ruled off with a divider), a centered status pill
  (`roundedRect` fill, colored per outcome) and a large centered amount
  with a one-line summary underneath, then a ruled detail table with a
  fixed label/value column split and alternating row shading (zebra
  striping via `doc.rect(..., "F")` on every other row) so every value
  lines up in the same column instead of floating at whatever width its
  label happened to need. The whole thing sits inside a bordered card
  (`roundedRect(..., "S")`) with the QR code and a signature-not-required
  disclaimer in the footer.
- **Verified the geometry, not just the code**: rather than trusting
  `tsc` alone for a layout with manual coordinate math, the same drawing
  logic was run standalone in Node (`jspdf.node.min.js` + the `qrcode`
  package, invoked from the frontend dir so `require("jspdf")` resolves)
  against representative long-value test data (a long tx hash, long NOC
  applicant name) and the resulting PDF was read back to visually confirm
  row alignment, zebra striping, and that the card fits on one A4 page
  with margin to spare (`cardBottom` ≈223mm vs a 297mm page).

## PIN required before NOC upload/verification

- **Fourth PIN-gated action**: `POST /api/noc/verify` now requires the
  caller's transfer PIN, verified server-side via the same
  `VerifyCallerPinAsync(pin)` pattern already used by
  `TransactionController` for create/settle/approve (`NocController` now
  takes an `AuthService` dependency and checks the PIN before touching the
  uploaded file at all) - not just a frontend gate. `[FromForm] string pin`
  rides alongside the existing `IFormFile file` multipart parameter.
- **Frontend**: `lib/api.ts`'s `verifyNoc(file, pin)` sends the PIN as an
  extra form field. `pages/SendTransfer.tsx`'s Step 1 "Verify Document"
  button no longer calls the API directly - it opens the same `PinModal`
  used for create/settle/approve (`PendingPinAction` gained a `"verifyNoc"`
  member), and the actual `verifyNoc()` call happens in the modal's
  `onConfirm`. A wrong PIN now surfaces inside the PIN modal itself (like
  every other money-moving action), while `nocError` on the page is left
  for pre-modal client-side file validation (wrong type/too large).
- **Verified end-to-end via curl**: wrong PIN against `/api/noc/verify`
  returns `401 Incorrect PIN.` before any file processing; correct PIN
  proceeds to the normal verification response.

## Full-width, two-column Send Transfer layout

- **Dropped the narrow centered column**: `pages/SendTransfer.tsx`'s outer
  wrapper was `max-w-3xl mx-auto` (768px, centered) - every other page in
  the app (Dashboard, Transactions, Admin) already renders full-width
  inside `<main>`, so this page was the odd one out and felt cramped next
  to the new top-nav masthead. It now spans the full content width like
  the rest of the app.
- **Two-column wizard, not a single wide stack**: the active step still
  reads as a right-sized form (`lg:col-span-2` of a 3-column grid, not a
  1400px-wide input column), while a `lg:sticky` right rail
  (`lg:col-span-1`) now carries persistent context: a new
  `components/TransferStepTracker.tsx` (the same vertical-checklist visual
  language as `AnalysisProgress`/`NocVerifyProgress`, mapped from `stage`
  to one of the flow's three existing labeled steps - Upload, Transfer
  Details & Risk Analysis, Blockchain Settlement) plus a stage-appropriate
  panel: the "What we check" explainer during upload, and a live "Transfer
  Summary" (amount, network, recipient, sender account, remaining monthly
  limit) once a transfer is in flight. The `stage === "result"` full-page
  takeover is unaffected - it already had its own dedicated layout.

## Interactive NOC upload step

- **Live preview instead of a filename string**: `pages/SendTransfer.tsx`
  now tracks a `previewUrl` derived from the selected `File` via
  `URL.createObjectURL()` (revoked on cleanup/replacement in a `useEffect`
  keyed on `file`), and Step 1 renders a thumbnail + file name + formatted
  size (`formatBytes()`) once a document is chosen, with "Choose a
  different file" and a remove (`X`) action instead of only being able to
  re-open the file picker.
- **`selectFile()` centralizes validation**: rejects non-image files and
  anything over `MAX_NOC_FILE_BYTES` (8 MB) with an inline message via the
  existing `nocError` state, before it ever reaches the backend - both the
  file-input `onChange` and the drop handler go through it.
- **More ways to provide the file**: the dropzone is now keyboard-operable
  (`role="button"`, `tabIndex`, Enter/Space triggers the picker) and
  accepts a pasted image directly (`onPaste`, reading the clipboard's
  image `DataTransferItem`) - useful since NOC documents are often
  screenshots.
- **`components/NocVerifyProgress.tsx`**: a small animated stage checklist
  shown while `verifyNoc()` is in flight, matching the visual pattern
  already established by `components/AnalysisProgress.tsx` for the later
  risk-analysis stage, so the two "AI is working" moments in the flow feel
  consistent.
- **"What we check" panel**: a static explainer card (stamp/signature
  detection, field extraction, authenticity scoring, risk scoring) so the
  step doesn't feel like a black box before the result comes back.

## Top-nav masthead layout, PayPal Business reference

- **Left sidebar replaced with a top navigation shell**, matching a
  PayPal-Business-dashboard screenshot the user supplied directly:
  `components/Layout.tsx`'s old `<aside>` (256px fixed-width nav rail) is
  gone. In its place: a solid navy masthead bar (new `brand-800`/`brand-900`
  tokens in `tailwind.config.js`, distinct from the `brand-600` action-blue)
  holding the wordmark, search, notifications, and account chip in white/
  translucent-white styling; directly under it, a white horizontal tab bar
  (`NAV_LINKS`, flattened from the old two-group sidebar list) with a
  `brand-600` bottom-border underline on the active tab, mirroring the
  reference's Home/Activity/Pay & Get Paid row. The Admin link becomes a
  trailing tab instead of a separate sidebar section.
- **Contained to one file**: every other page renders through
  `<Layout>{children}</Layout>` without assuming a sidebar exists, so this
  was a single-file rewrite - no per-page changes were needed to support
  the new shell.
- **Account avatar** (`getInitials()` two-letter monogram, from the prior
  business-theme pass) moved into the navy bar with light/translucent
  styling (`bg-white/15` circle, `ring-white/30`) instead of the flat navy
  circle used against a white header - it needs to read against a dark
  background here.

## Business-oriented navy/slate theme, gradients removed

- **Same override technique, new palette**: per explicit request to make
  the whole app "business oriented," `tailwind.config.js`'s `slate` family
  moved from the warm brown/tan ramp to a navy/blue-gray ramp close to
  Tailwind's own default `slate` scale - every existing `text-slate-*`/
  `bg-slate-*`/`border-slate-*` class across the app picked this up with
  zero page-level edits, same as both prior theme passes. `brand` became a
  single blue accent ramp (`#2563EB` primary), and `ink`/`line` moved to
  matching light-gray/white surface tones.
- **All gradients removed**, not just muted: `tailwind.config.js`'s
  `backgroundImage` section (`brand-gradient`, `radial-glow`) and the
  `glow-brand` box-shadow were deleted outright rather than recolored -
  every call site (`index.css`'s `.btn-primary`, the logo badge in
  `components/Layout.tsx`, and the auth-page logo badges/page background in
  `pages/Login.tsx` / `Register.tsx` / `VerifyEmail.tsx`) now uses a flat
  `bg-brand-600` fill and a plain `shadow-card`, plus the avatar chip in
  `Layout.tsx` (`bg-gradient-to-br from-slate-600 to-slate-800`) flattened
  to `bg-slate-700`. This was a deliberate "PayPal/Stripe-style flat UI"
  call, not an oversight - the same "no gradient" instruction that shaped
  the transaction result page now applies app-wide.
- **Non-Tailwind-class raw hex values** updated by hand to match, same
  handful as every previous theme pass: `RiskGauge`'s track stroke/fallback
  color, `Dashboard`'s Recharts inline axis/grid/tooltip/bar colors (now
  navy grid lines with blue bars instead of brown), and the receipt PDF's
  `jsPDF.setTextColor()` calls in `SendTransfer.tsx`. The semantic
  risk-level colors (VERIFIED/LOW/MEDIUM/HIGH/CRITICAL) and the
  success/failure greens/reds in `ResultIcon.tsx` were, as always,
  deliberately left untouched - they're status colors, not brand colors.

## Post-settlement result/receipt page

- **Dedicated full-page takeover, not a wizard card**: `pages/SendTransfer.tsx`'s
  `Stage` union gained a `"result"` state, and `submitSettle()` now always
  transitions there after a settlement attempt finishes, success or
  failure. Rather than rendering that as another card inside the
  `max-w-3xl` wizard column, the component early-returns a completely
  separate layout (`components/TransactionResult.tsx`) once
  `stage === "result"` - it drops the "Send Transfer" header/breadcrumb
  entirely and centers a standalone receipt card on the page, per an
  explicit request for a "PayPal-style" flat, professional confirmation
  screen: solid colors only (emerald/red flat header bands, a solid
  `bg-slate-900` primary button) with no gradients anywhere on the page,
  unlike the rest of the app's `brand-gradient` buttons.
- **Animated confirmation icon**: `components/ResultIcon.tsx` is a small,
  dependency-free SVG whose circle and checkmark/X "draw" themselves via
  `stroke-dasharray`/`stroke-dashoffset` CSS keyframes (`index.css`'s
  `.result-icon-*` classes) - the same technique already used elsewhere in
  the app for the risk gauge, kept consistent rather than pulling in an
  animation library for one component.
- **Receipt fields**: reference no. (`TXN-######` derived from the
  transaction id), status, sender/recipient account numbers (`profile`,
  `selectedWallet` - both already in component state, no new API calls
  needed), the NOC applicant name and origin/destination countries (from
  `nocResult.fields`, the same NOC verification response already held from
  Step 1), amount (shown large, PayPal-style, above the details list), and
  either the on-chain tx hash (success) or the settlement failure reason
  (failure).
- **PDF export**: `handlePrintReceipt()` (still in `SendTransfer.tsx`,
  passed down as a prop) builds the same field list into a downloadable
  PDF with `jsPDF`, mirroring the pattern already established by
  `pages/Report.tsx`'s `handleExportPdf` rather than introducing a second
  PDF approach. It also draws a watermark behind all other content at low
  opacity via `jsPDF`'s `GState` API - a successful transfer gets the
  user-supplied government emblem (`src/assets/govt-emblem.jpg`) centered
  on the page (loaded through a small `loadImageAsDataUrl()` helper that
  round-trips the Vite-bundled image through a canvas to get the base64
  data `jsPDF.addImage` needs), while a failed transfer keeps the plain
  diagonal red "FAILED TRANSACTION" text stamp. It also embeds a QR code
  (new `qrcode` dependency, `QRCode.toDataURL()` → `doc.addImage`) encoding
  the same reference/status/amount/countries/hash summary for quick
  receipt verification.

## Login audit trail, Analyze Transaction removed, warm-brown theme

- **Login audit trail**: `Models/LoginAttempt.cs` + a new "Login Activity"
  Admin tab. `AuthController.Login` records one row per attempt - success
  or failure, and for the *attempted* email even when it doesn't match a
  real account (a flood of attempts against a nonexistent address is
  itself a signal worth seeing) - capturing IP address, a parsed
  "Browser on OS" device summary (`Services/DeviceParser.cs`, deliberately
  a small substring-matching helper rather than a new UA-parsing
  dependency), and timestamp. Verified for real: a wrong-password attempt
  and a successful one against the same account both show up correctly
  (`Chrome on Windows`, real client IP, correct success/failure flag) via
  `GET /api/admin/login-attempts`.
- **Analyze Transaction page removed** per explicit request - the route,
  nav item, and page file are gone from the frontend. Its backend
  endpoints were *not* touched: `POST /api/transactions/{id}/analyze` is
  still very much alive and is exactly what `pages/SendTransfer.tsx` calls
  after creating a transfer - removing the page only removed the standalone
  "paste in an arbitrary transaction and analyze it" entry point, not the
  analysis pipeline itself.
- **Warm-brown theme**: rather than editing class names across ~20 page/
  component files again, this overrode Tailwind's built-in `slate` color
  family directly in `tailwind.config.js` with a warm brown/tan ramp (10
  steps, same shade numbers) - every existing `text-slate-*`/`bg-slate-*`/
  `border-slate-*` class already in the app picked up the new palette
  automatically, with zero page-level edits needed. The `brand`/`ink`/
  `line` design tokens and the handful of raw (non-Tailwind-class) hex
  values that bypass the token system - `RiskGauge`'s SVG track stroke,
  `Dashboard`'s Recharts inline axis/grid/tooltip colors - were updated by
  hand to match, while the semantic risk-level colors (VERIFIED=green,
  LOW=blue, MEDIUM=amber, HIGH=orange, CRITICAL=red) were deliberately
  left untouched, same call as every previous theme pass in this project.

## Live limit enforcement, full admin CRUD, Stripe-style list UX

- **Live transfer-limit enforcement**: the remaining monthly cap was already
  computed live and enforced server-side (`GetMonthlyExecutedTotalAsync`,
  checked at both creation and settlement); this phase closed the frontend
  gap. `pages/SendTransfer.tsx`'s amount input gets a `max` tied to
  `nocResult.monthlyRemaining` plus a client-side check that blocks
  submission with a specific over-by-how-much message before the PIN
  modal even opens (the server-side `403` is still the real authority,
  this just matches the UX to it). After a settlement succeeds, the
  success card calls a new `GET /api/noc/{id}`-backed `fetchNocDocument()`
  to show the *post-settlement* remaining limit rather than the stale
  NOC-verify-time snapshot — verified for real: a NOC with a $750,000 cap
  and a $500,000 already-executed transfer correctly reported $749,500
  remaining immediately after a further $500 settlement.
- **Recipient (branch) accounts moved from static config to a real
  Admin-CRUD entity**: `Models/WalletAccount.cs` replaces the old
  `appsettings.json` `DemoWallets` list entirely — `Controllers/WalletsController.cs`'s
  public `GET /api/wallets` (used by Send Transfer's recipient picker) now
  reads live, active DB rows, and a new "Recipient Accounts" Admin tab
  gives full Create/Read/Update/Delete. Deleting a wallet is unconditional
  (no history guard needed): `Transaction.RecipientAddress`/`RecipientLabel`
  are plain string snapshots taken at transfer time, not a foreign key
  into this table, so nothing can be orphaned.
- **User CRUD completed**: Admin-side `POST /api/admin/users` creates
  pre-verified accounts directly (the Admin is vouching for them, so the
  usual email-verification step is skipped). `DELETE /api/admin/users/{id}`
  is a *real* delete, not a soft one — but only when the user has zero
  transactions, NOC documents, and watchlist entries; otherwise it's
  blocked with a message naming exactly which records are in the way.
  Deactivating (already existed) remains the everyday "remove access"
  tool for accounts with real history, since a financial system's audit
  trail shouldn't be deletable. Also blocked: deleting your own account.
- **Watchlist gained Update** (`PUT /api/admin/watchlist/{id}`) — label and
  reason are editable; the address itself stays immutable since it's the
  entry's identity (remove and re-add if it's wrong).
- **Transactions already had full backend CRUD** (`TransactionController`
  has had Create/Read/Update/Delete since early in the project) — the gap
  was a frontend Edit surface, closed by wiring the existing
  `updateTransaction()` call to a new edit action in `pages/Transactions.tsx`.
- **Deliberately not touched: NOC documents.** There's no NOC-history page
  in the frontend at all (`fetchNocHistory` in `lib/api.ts` was dead code,
  unused anywhere) — building CRUD onto an entity with no viewing surface
  wasn't part of what was scoped, and NOC records are forensic snapshots
  that shouldn't be editable regardless of tooling.
- **Stripe-style list UX**: new `components/SlideOver.tsx` (a right-side
  sliding detail/edit panel) replaces one-off inline forms/full-page nav
  for the Users, Watchlist, and Recipient Accounts admin tabs, and the new
  Transactions edit action — deliberately *not* applied to the Transactions
  table's "View Report" link, which opens a genuinely richer dedicated page
  (risk gauge, module scores, anomalies, PDF export) a slide-over would
  regress rather than improve. Column-header sorting and per-table search
  were added to Users, Watchlist, Recipient Accounts, and (client-side,
  current-page-only) AI Logs. `RiskBadge`/`StatusBadge` switched from a
  solid-fill pill to a colored-dot-plus-plain-text convention — since both
  components' external API is unchanged, every existing call site across
  Dashboard/Transactions/Reports/Admin picked up the new look automatically.

## Account numbers, transfer PIN, email verification

A banking-style layer on top of the existing blockchain-address transfer
mechanics, not a replacement for it:

- **Account numbers**: every `User` gets a unique 12-digit `AccountNumber`
  generated at creation (`AuthService.GenerateAccountNumberAsync`); the four
  demo branch wallets got matching entries in `appsettings.json`'s
  `DemoWallets`. It's a genuinely separate field from the wallet address -
  `pages/SendTransfer.tsx` shows the account number as the primary sender/
  recipient identifier, with the real blockchain address still shown
  underneath (smaller, monospace) rather than hidden, since the address is
  what the backend actually settles to on-chain.
- **Transfer PIN**: set at registration (`Register.tsx`, hashed the same
  way the password is via `PasswordHasher<User>`), required before *every*
  money-moving action - `POST /api/transactions/transfer`, `/approve`, and
  `/settle` all take a `Pin` field and verify it server-side
  (`TransactionController.VerifyCallerPinAsync`) before doing anything
  else, the same "enforce on the backend, not just the UI" discipline
  every other gate in this project uses. `components/PinModal.tsx` is the
  shared confirmation prompt; the actual API call only fires from its
  `onConfirm`.
- **Email verification is simulated** - there's no SMTP configured in this
  project. `POST /api/auth/register` creates the account unverified and
  returns the verification code directly in the response
  (`RegisterResponse.DevVerificationCode`) instead of emailing it;
  `pages/VerifyEmail.tsx` displays it in an explicit "dev mode" banner. This
  is a deliberate stand-in, not a design that would ship to production -
  swapping in a real provider means replacing that one response field with
  an actual send call and dropping the dev banner.
- **Backfill for pre-existing users**: this feature landed on a dev
  database that already had real seeded/test accounts. The EF migration
  adds the new `User` columns and (in the same migration, via
  `migrationBuilder.Sql`) assigns each pre-existing row a unique
  Id-derived account number *before* creating the unique index over that
  column - otherwise every existing row's shared empty-string default
  would violate uniqueness and the migration would fail outright.
  `Program.cs`'s startup then finds any user with an empty `PinHash`
  (i.e., predates this feature) and grandfathers them in with PIN `1234`
  and `EmailVerified = true`, so the demo accounts and every account
  created during earlier phases of this project keep working. Verified for
  real: both seeded demo accounts logged in successfully immediately after
  the migration ran.

Verified for real, full cycle: registered a new account → login correctly
rejected with the unverified-redirect signal before verifying → verified
with the dev code → logged in. Then, using the seeded Admin account (PIN
`1234`): uploaded a genuine NOC and confirmed `monthlyUsed`/
`monthlyRemaining` in the response (`$0` / `$750,000` for a NOC stating a
$750k cap) → created a transfer with a wrong PIN (401) → with the correct
PIN (succeeds) → settled with a wrong PIN (401) → with the correct PIN
(succeeds, real on-chain tx hash).

## Sanctions/watchlist screening, Grad-CAM, maker-checker approval, trend chart, PDF export

Five additions from a single pass aimed at AI/ML depth, product features, and
frontend polish, each reusing an existing pattern rather than new plumbing:

- **Sanctions/watchlist screening** (`Models/WatchlistEntry.cs`,
  `Controllers/AdminController.cs`'s `api/admin/watchlist` CRUD, a new
  "Sanctions Watchlist" tab in `pages/Admin.tsx`). A match on either address
  is a **hard override**, checked in `AnalysisOrchestrationService.AnalyzeAsync`
  *before* the AI engine is even called — same philosophy as the NOC
  authorized-amount check: forces `RiskLevel = CRITICAL`, `FinalRiskScore = 100`,
  and writes a synthetic `WatchlistMatch` anomaly, short-circuiting the whole
  5-module pipeline. Verified for real: a transaction touching a watchlisted
  address scores CRITICAL/100 with the anomaly present; clean transactions are
  unaffected.
- **Grad-CAM explainability for the stamp CNN** (`ml/grad_cam.py`,
  `cnn_forensic_service.explain()`). Standard Grad-CAM against
  `StampCNN.features[10]` (the last conv block's ReLU, pre-pooling),
  rendered as a JET-colormap overlay and returned as a base64 JPEG via two
  new `NocVerificationResponse` fields (`cnnForgedProbability`, `cnnHeatmap`),
  shown in `pages/SendTransfer.tsx`'s verification result. **Caught during
  verification, not by inspection**: `StampCNN`'s ReLU layers were originally
  `inplace=True`, which PyTorch's autograd forbids hooking for Grad-CAM
  (`RuntimeError: ... view+inplace would override the custom backward`) —
  fixed by switching to `inplace=False`, which is a pure execution-strategy
  change (ReLU has no learnable parameters) and required no retraining;
  the already-trained `stamp_cnn.pt` weights load and score identically
  before and after.
- **Two-tier settlement approval** (maker-checker): VERIFIED/LOW still
  auto-settle, HIGH/CRITICAL still hard-blocked, but **MEDIUM now requires
  an Admin's sign-off** via `POST /api/transactions/{id}/approve`
  (`Transaction.ApprovedByUserId`/`ApprovedAt`) before
  `TransactionController.Settle` will proceed — checked right after the
  existing HIGH/CRITICAL block, same block-and-return pattern. Verified for
  real: a MEDIUM-risk settle attempt returns 403 "requires Admin approval,"
  an Analyst gets 403 calling `/approve` (Admin-only), and after an Admin
  approves, the same settle call succeeds with a real on-chain tx hash.
- **Dashboard trend chart**: `GET /api/dashboard/trend?days=` on
  `DashboardController.cs` buckets transactions by calendar day (zero-filled
  for days with no activity, so the chart has a continuous axis), rendered
  as a combo bar+line (`ComposedChart`) in `pages/Dashboard.tsx` — transaction
  volume as bars, average risk score as a line on a secondary axis.
- **PDF report export**: fills in `pages/Report.tsx`'s previously-disabled
  "Download PDF" button using `jspdf`'s text/table primitives directly
  (transaction fields, module scores, anomalies, recommendation) rather than
  an `html2canvas` DOM screenshot — crisper vector output, one fewer
  dependency.

## CNN stamp-forgery signal

`ml/stamp_cnn.py` is a small PyTorch CNN (three conv blocks, ~50K params —
deliberately small for the dataset size) that classifies a localized stamp
crop as genuine or forged. It's a **fourth signal alongside**, not a
replacement for, the three classical checks in `noc_forensic_service.py`
(ELA, edge-boundary discontinuity, noise-profile consistency) — wired in as
`services/cnn_forensic_service.py`, contributing its own `cnn_forgery_signal`
flag and a further -35 to the authenticity score when it fires (probability
≥ 0.6).

**Training data is entirely synthetic** — there's no corpus of real
scanned NOCs, forged or otherwise, to train on. `scripts/generate_cnn_dataset.py`
scales up the exact same tamper simulation already used for
`samples/tampered_noc.jpg` (a donor stamp rendered with a different
noise/JPEG-quality signature, hard-pasted into an otherwise clean document)
across 700 randomized documents (350 genuine / 350 forged; position, radius,
ink color, noise, and compression all randomized), running each one through
the real `noc_stamp_service.locate_stamp()` so training crops match live
inference input rather than a hand-picked box. `ml/stamp_crop.py` holds the
crop/resize logic shared by both the generator and the inference service
specifically so train-time and inference-time preprocessing can't drift
apart. Honest caveat: because both the model and the classical checks are
learning/targeting the same splice-artifact signal, this mainly adds
redundancy and a second independent vote on that signal today, not
detection of forgery styles the classical checks miss entirely — a
real-world corpus would be needed for that. `ml/train_stamp_cnn.py` trains
for 25 epochs and **refuses to save** the model if held-out validation
accuracy is below 90% (it reached 100% on the current dataset); the
inference service loads `ml/artifacts/stamp_cnn.pt` lazily and no-ops
if the file or `torch` itself is missing, so a from-scratch checkout works
without training anything, and NOC verification never hard-fails because of
this component. Verified for real: `clean_noc.jpg` scores 0.01 forged-
probability (no flag, authenticityScore 100); `tampered_noc.jpg` scores
0.9997 (flag fires, authenticityScore drops from 40 → 5 with all three other
signals also firing) — checked directly against the AI engine and again
through the full ASP.NET Core → FastAPI path.

## NOC-authorized monthly transfer cap

Every NOC must explicitly state an authorized monthly transfer amount
(`ai-engine/services/noc_ocr_service.py` extracts it via regex against
labels like "Authorized Amount"/"Monthly Limit"). This is a **hard
requirement, not a scored risk factor** — `api/routes/noc.py`'s
`_check_authorized_amount` forces the verdict to `forged` (never `genuine`)
if the amount is missing or outside $5,000–$1,000,000, regardless of how
clean the stamp forensics are. The stated amount then becomes that NOC's
cap: `TransactionController` sums everything already `Executed` against the
same `NocDocumentId` within the current calendar month and blocks (403) if
a new transfer would push the total over the cap — checked once for early
feedback at `POST /api/transactions/transfer` (creation) and again,
authoritatively, at `POST /api/transactions/{id}/settle` right before the
contract call, since other transfers against the same NOC may have settled
in between. `GET /api/noc` and `GET /api/noc/{id}` surface
`authorizedAmount`/`monthlyUsed`/`monthlyRemaining` so this is visible
without re-deriving it. Verified for real: a NOC stating $750,000 allowed a
$500,000 settlement, then correctly rejected a subsequent $400,000 request
with the exact shortfall in the error message; a NOC stating $5,000,000
(over the $1M ceiling) was rejected outright at verification time.

## History

This project went through two earlier builds before this one: an NOC-
document-upload demo (Sprint A) and an auth/CRUD/Claude-chat layer on top of
it (Sprint B). Both were fully replaced per an explicit user decision — the
transaction-hash/log risk-analysis system described below supersedes them
entirely. Nothing from those builds is wired into the current system except
the general project skeleton, the JWT auth pattern, and (unwired)
`contracts/`.

## What's built (this phase)

The spec's own Phase 1 + Phase 2, plus the orchestration wiring from Phase 3
— backend and AI engine core, verified end-to-end via direct API calls, no
frontend yet.

- **Auth**: JWT, `Analyst`/`Admin` roles, public self-registration
  (`POST /api/auth/register`, always creates an Analyst), `GET /api/auth/profile`.
- **Transactions**: full CRUD (`Controllers/TransactionController.cs`),
  scoped to the owning user unless the caller is Admin.
- **AI engine** (`ai-engine/`, FastAPI): five stateless modules matching the
  spec's exact folder layout (`api/routes`, `models`, `services`, `ml`) —
  preprocessing, semantic intent-vs-behavior analysis, protocol-template
  matching, micro-level forensics (nonce reuse/gaps, timestamp anomalies,
  gas z-score outliers via pandas, HEX-payload Shannon-entropy analysis
  calibrated to payload size, duplicate-pattern detection), and weighted
  risk scoring with an on-the-fly `IsolationForest` (falling back to a
  deterministic z-score heuristic when there's too little history, and to a
  persisted model if one is ever dropped into `ml/artifacts/`).
- **Orchestration** (`Services/AnalysisOrchestrationService.cs`): the
  12-step pipeline — preprocess → semantic → template (against active
  templates fetched from SQL Server) → forensics (against the sender's
  recent transaction history, also fetched from SQL Server) → risk →
  persists `TransactionAnalysis` + `Anomaly` rows. Every AI-engine call is
  logged to `AIAnalysisLog` (request/response JSON, status, elapsed ms)
  regardless of success or failure.
- **Reports & dashboard**: `GET /api/reports/{id}` assembles the full
  forensic report; `GET /api/dashboard/summary` gives counts/averages/recent
  transactions.
- **Protocol templates**: CRUD (`Admin`-only writes), four built-in examples
  seeded on first run (ERC20 Transfer, ERC20 Approve, Uniswap Swap, Arbitrum
  Bridge).

## Design choices worth knowing about

- **The AI engine is stateless.** Template matching and forensics both need
  context the Python service doesn't store — active templates and the
  sender's recent history. ASP.NET Core fetches both from SQL Server and
  includes them directly in the request payload, so FastAPI only ever does
  comparison/statistics on what it's given. This mirrors the "ASP.NET Core
  is the orchestration layer" principle stated in the brief.
- **Template `similarityScore` vs. risk-oriented module scores.** The
  `/api/analyze/template` endpoint returns `similarityScore` where higher =
  better match (matches the spec's own JSON example). Every module *feeding
  the risk engine* needs to be risk-oriented (higher = worse) to combine
  under one weighted sum, so `AnalysisOrchestrationService` computes
  `templateRiskScore = 100 - similarityScore` before calling
  `/api/analyze/risk`. The risk engine itself stays generic/reusable.
- **HEX entropy is calibrated to payload size, not a flat 8.0 bits/byte
  ceiling.** A short payload can't reach anywhere near the theoretical max
  regardless of randomness (a 64-byte sample tops out around 6 bits/byte
  even from a true RNG) — an initial flat-threshold version was verified
  against a real random payload and silently never fired. The check now
  compares entropy against `log2(min(payload_bytes, 256))`, the actual
  achievable ceiling for that sample size, and was re-verified to correctly
  flag random data while leaving normal zero-padded ABI call data alone.
- **JWT claim mapping.** `options.MapInboundClaims = false` is required on
  the JWT bearer handler — without it, ASP.NET Core's legacy inbound claim
  mapping remaps the short `sub` claim onto the same `ClaimTypes.NameIdentifier`
  URI already used explicitly for the numeric user id, and whichever claim
  enumerates first silently wins at every `FindFirstValue` call site. Caught
  by running the actual register → create-transaction flow, not by
  inspection — the first attempt threw a `FormatException` trying to
  `int.Parse` an email address.

## What's built (NOC + blockchain settlement merge)

Full React frontend was rebuilt to match the transaction-risk API
(Sidebar/Header `Layout.tsx`, Dashboard with Recharts, Analyze Transaction
with the animated stage timeline, Report page with the risk gauge,
Transaction History, Templates page, a minimal Admin page). On top of that,
per a later user request, the original NOC-upload/stamp-forensics/
blockchain-transfer capability from Sprint A was brought back and **merged**
into one flow rather than kept parallel: `pages/SendTransfer.tsx` — upload a
NOC → `POST /api/noc/verify` (OCR + stamp localization + ELA/edge/noise
forensics, same engine as Sprint A, same ink-baseline-not-blank-page fix) →
only a `genuine` verdict unlocks a transfer-details form → that creates a
`Transaction` linked to the `NocDocument` (`POST /api/transactions/transfer`)
→ the **same** 5-module risk-analysis pipeline runs on it → only if the risk
level is VERIFIED/LOW/MEDIUM (not HIGH/CRITICAL) does `POST
/api/transactions/{id}/settle` become available, which calls the existing,
already-tested `TransactionGateway.sol` via `BlockchainService` for a real
on-chain transfer to one of four demo "branch" wallets (Karachi/Dubai/
London/Doha — pre-funded Hardhat addresses, `Controllers/WalletsController.cs`).
Both gates were verified independently and for real: a forged NOC blocks
transfer creation entirely (403, contract never touched); a transaction
linked to a *genuine* NOC but with its risk level forced to CRITICAL still
gets blocked at `/settle` (403, contract never touched); a normal case with
an acceptable risk level settles successfully with a real tx hash. The
`Analyze Transaction` page (raw tx hash/JSON/manual entry) is unchanged and
still serves its own distinct purpose — investigating an existing/arbitrary
transaction rather than initiating a new authorized one.

## What's built (Admin panel)

`Controllers/AdminController.cs` (`Admin`-only, `api/admin/*`) plus a
tabbed `pages/Admin.tsx`:

- **User management**: `GET /users`, `PUT /users/{id}/status`,
  `PUT /users/{id}/role`. Deactivating now actually blocks login —
  `AuthController.Login` was checking credentials but never `IsActive`
  before this, so the old flag was cosmetic. An admin can't deactivate or
  demote their own account (guarded server-side, not just hidden in the UI).
- **AI analysis log viewer**: `GET /logs` (paginated, filterable by
  Success/Error) over the `AIAnalysisLog` rows every FastAPI call already
  wrote — a request/response viewer existed nowhere before this.
- **Risk threshold settings**: `GET/PUT /settings`, backed by
  `SystemSetting` rows (seeded to the spec defaults 20/40/60/80 on first
  run via `RiskThresholdService`) and actually wired into live scoring —
  `AnalysisOrchestrationService` fetches the current thresholds and sends
  them on every `/api/analyze/risk` call; `risk_service.py`'s
  `_risk_level` uses them when present, falling back to the hardcoded
  defaults otherwise (`RiskRequest.thresholds` is optional so other
  callers of the AI engine don't need to change). This is the one piece
  of the admin panel that reaches into the AI engine, not just the DB.
- **Protocol templates**: unchanged, just linked in from the same page.

## Deferred (not built)

- Solidity `ConditionalSettlement.sol` — a *second* contract where the
  threshold check happens on-chain inside the contract itself, taking a risk
  score as a parameter. The settlement flow above reuses the existing,
  verifier-gated `TransactionGateway.sol` instead, with the risk-level check
  enforced off-chain in `TransactionController.Settle`. Revisit only if
  on-chain threshold enforcement specifically is required.
- Docker Compose + `.env.example` for the services.
- xUnit backend tests and Pytest AI-engine tests.
- Full seed dataset (5 analysts, 20 transactions across networks/risk
  levels) — hand-crafted transactions were used throughout to prove each
  module/gate discriminates, not a bulk seed script.
