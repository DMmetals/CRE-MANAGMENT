# CRE Enquiry & Order Management â€” Phase 1

This npm-workspaces project lives in C:\Users\user\Desktop\CRRNBD. It includes CRR/NBD enquiry registers, enquiry creation/editing, quotation preview and save/download, and O2D views and transfers. Production authentication, dispatch issuing and email are still incomplete. See the current workflow notes below before deployment.

## Architecture and files

```text
apps/web/             React + TypeScript + Vite + Tailwind v4
  src/api/           Typed backend health requests
apps/api/             Fastify + TypeScript
  src/config/        Validated environment and central spreadsheet configuration
  src/modules/google/ Service-account authentication and read-only checks
  test/              API/config/connectivity tests using injected Google responses
packages/shared/      Shared response types and source identifiers
.env.example          Backend environment template
```

Browser â†’ `/api` â†’ Fastify â†’ Google Sheets API v4. There is no secondary data store. The browser never receives service-account credentials. The Google auth library signs requests to the Sheets REST API with the `spreadsheets.readonly` scope. Phase 1 contains no Google write calls. The health service reads only the configured FMS header row, not customer data. Each source is checked independently; concurrent requests share a check and results are cached for 15 seconds.

## Prerequisites and Windows quick start

Use Node.js **22.12 or later** (Node 22 LTS recommended), npm and VS Code. Commands below work in PowerShell. `npm.cmd` avoids Windows execution-policy restrictions on `npm.ps1`; normal `npm` works where allowed.

From C:\Users\user\Desktop\CRRNBD:

```powershell
npm.cmd install
if (!(Test-Path .env)) { Copy-Item .env.example .env }
code .env
npm.cmd run dev
```

Start commands work before credentials are supplied. The UI honestly reports configuration missing until Google access succeeds. No mock business data is displayed.

- Frontend: http://localhost:5173
- API liveness: http://127.0.0.1:4000/api/health
- Google connectivity: http://127.0.0.1:4000/api/health/google

The API always loads `.env`, regardless of the working directory. Existing process environment variables take precedence. Restart the API after editing `.env`. Vite proxies `/api` to port 4000; if changing the API port, also update `apps/web/vite.config.ts`.

## Google Cloud service-account setup

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create/select a project.
2. In APIs & Services â†’ Library, enable **Google Sheets API**. Drive API is not required for Phase 1; enable it later only for file functionality.
3. In IAM & Admin â†’ Service Accounts, create a dedicated service account. Do not assign broad project roles just to access Sheets.
4. Under the account's Keys tab, create a JSON key if your organization permits service-account keys. Keep that downloaded file outside the repository.
5. Populate these values in `.env` from the key:
   - `GOOGLE_PROJECT_ID`: `project_id`
   - `GOOGLE_CLIENT_EMAIL`: `client_email`
   - `GOOGLE_PRIVATE_KEY`: `private_key`, quoted with literal `\n` between PEM lines, e.g. `GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"`
6. Share **both** spreadsheets with that service-account email. Viewer is sufficient for Phase 1; Editor will be needed when the later write phase is explicitly enabled. Even if Editor is granted now, this application requests only read-only API access.
7. Keep the supplied CRR/NBD IDs, `FMS`, header row `7`, and data start row `8`, unless the source configuration changes.
8. Start/restart the backend and frontend with `npm.cmd run dev`.
9. Check `/api/health/google`: require HTTP 200, `success: true`, and both sources `connected` before progressing to enquiry writes.

Never paste credentials into frontend code, `VITE_*` variables, issues or source control. `.env` and common credential filenames are ignored. For deployment use your platform's secret manager/environment injection, and rotate downloaded keys according to your organization's policy.

## Environment

Required for Google: `GOOGLE_PROJECT_ID`, `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`.

Already configured: CRR/NBD spreadsheet IDs, FMS row settings, `CRE_API_PORT=4000`, `HOST=127.0.0.1`, `FRONTEND_URL=http://localhost:5173`, `GOOGLE_TIMEOUT_MS=10000`, `LOG_LEVEL=info`.

`DEV_AUTH_BYPASS` and `JWT_SECRET` reserve names for the later authentication phase. JWT authentication is not implemented in Phase 1. Production rejects `DEV_AUTH_BYPASS=true`. No business endpoints exist. Health output contains no raw headers, customer data, credentials or upstream error bodies.

## Commands and validation

```powershell
npm.cmd run dev
npm.cmd run dev:web
npm.cmd run dev:api
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test
npm.cmd run build
npm.cmd run format:check
```

`dev` runs both processes; the two separate commands are alternatives for separate terminals. Shared types build before the API starts. Tests cover missing credentials, both source routes/ranges, successful/partial connectivity, empty headers, sanitized failures, concurrent check coalescing, configuration validation, read-only scope and absent write routes. Tests use injected responses; passing tests **does not verify live Google connectivity**.

Manual smoke checks:

```powershell
Invoke-RestMethod http://127.0.0.1:4000/api/health
Invoke-RestMethod http://127.0.0.1:4000/api/health/google
```

The Google endpoint returns HTTP 503 with per-source diagnostics when configuration/access fails. Liveness stays HTTP 200. Rate limits are 60 requests/minute generally and 10/minute for the Google check. Google requests have a configurable request timeout and retries disabled. The frontend also bounds its request wait.

## Production build and deployment foundation

Run `npm.cmd ci` then `npm.cmd run build`. `npm.cmd start` runs `apps/api/dist/server.js`. Publish `apps/web/dist` using a static server and reverse-proxy `/api` to Fastify under the same HTTPS origin. Set `NODE_ENV=production`, `DEV_AUTH_BYPASS=false`, the exact `FRONTEND_URL`, and backend Google secrets. Set `HOST=0.0.0.0` only when required by your container/platform. The API does not serve frontend files. Vite dev/preview servers are not production hosting. Complete authentication/authorization and operational controls in later phases before releasing business workflows.

## Troubleshooting

- `npm.ps1 cannot be loaded`: use `npm.cmd`; no execution-policy change needed.
- API unavailable: start the API, check port 4000, and check Vite's proxy target.
- `GOOGLE_NOT_CONFIGURED`: fill all three Google variables and restart the API.
- `GOOGLE_ACCESS_DENIED`: enable Sheets API in the correct project and share both Sheets with the service account.
- `GOOGLE_SHEET_NOT_FOUND`: verify IDs and sharing.
- `GOOGLE_RANGE_INVALID` / `GOOGLE_HEADERS_EMPTY`: verify FMS tab spelling and header row 7.
- `GOOGLE_CONNECTION_FAILED`: check the private-key PEM/newlines, proxy/firewall access to Google APIs and OAuth, and service-account validity.
- API startup failure: check environment types, production bypass setting and occupied ports. Startup messages deliberately exclude secrets.
- A repaired connection may take 15 seconds to appear because checks are cached.

Implementation references: [Fastify TypeScript](https://fastify.dev/docs/latest/Reference/TypeScript/), [Tailwind Vite setup](https://tailwindcss.com/docs/installation/using-vite), [Google Sheets scopes](https://developers.google.com/workspace/sheets/api/scopes).

CRE_API_PORT takes precedence over PORT when supplied.

## Updated Phase 0/1 verification

See BUSINESS_LOGIC_MIGRATION.md, DATA_DICTIONARY.md and WORKFLOW.md. Legacy code has not been supplied. GET /api/meta/sheets checks all four spreadsheets, returns actual tab names, and reads headers only for explicitly configured tab/row pairs. O2D tab names and header rows remain blank until verified; metadata does not guess them. Google health also checks O2D spreadsheet access. A connected O2D source without configured headers is not a verified data dictionary.

Service-account email: deligation@all-gmail-api.iam.gserviceaccount.com. Project ID all-gmail-api is inferred from that email and should be verified against the JSON key. The backend supports either the three credential values or GOOGLE_APPLICATION_CREDENTIALS pointing to an absolute JSON key path outside the repository. Do not paste private keys into chat. Share all four spreadsheets with this email. JSON-file authentication takes precedence when configured. No Drive scope or write scope is requested in this phase.

After configuring credentials, restart the backend and run:

```powershell
Invoke-RestMethod http://localhost:4000/api/meta/sheets | ConvertTo-Json -Depth 8
```

## Verified connection

The supplied local service-account key successfully accessed all four spreadsheets. Actual tabs/header rows: CRR FMS/7, NBD FMS/7, O2D FBD/6, O2D MUM/6. See DATA_DICTIONARY.md for exact headers and remaining mapping ambiguities. The JSON key remains outside this repository; only its path is in the ignored .env file. Restart the backend after changing .env.

## CRM enquiry release

Open CRR or NBD from the sidebar. The register now loads real material rows, includes enquiry-level KPIs, search/filters, sorting, resizing, pagination, CSV export, customer history and grouped enquiry details. Use **Add enquiry** to create a customer enquiry with multiple materials. Save writes to the selected FMS and its CRE Audit Log tab atomically. No test records are added to your live Sheets.

This release enables saves only for local development (`DEV_AUTH_BYPASS=true`, loopback). Production business access and distributed deployment require the later authentication/locking work. The same-host lock does not coordinate edits from Google Sheets or Apps Script. Derived columns containing formulas are left under Sheet control; formulas are not copied to newly inserted rows. Confirm that your Sheet's own automatic formulas cover inserted rows. `runtime/locks/enquiry-create.lock` is an exclusive lock: after a crash, verify no request remains active and review the prior save before removing it.

Quotation generation, editing and O2D transfer are implemented subject to the configuration described below. Final dispatch issuing remains incomplete.

## Current CRM routes and safe writes

Open /crr or /nbd for the actual register, Add Enquiry, Edit Row and quotation/O2D actions. /quotation/crr and /quotation/nbd support rate entry and backend PDF preview/download. /o2d/fbd and /o2d/mum load their real Sheets. /dispatch/fbd and /dispatch/mum open dispatch selection and draft PDF forms.

ENABLE_SHEET_WRITES defaults to false; the local .env controls whether writes are enabled. All write routes return SHEET_WRITES_DISABLED before attempting a write. Quotation preview and the /api/quotations/pdf endpoint remain read-only. Save & download PDF calls /api/quotations/save-and-download and requires writes to be enabled. To enable real saves explicitly, set ENABLE_SHEET_WRITES=true and restart. Local DEV_AUTH_BYPASS is still required; this is not a production-authenticated deployment.

The provided Drive folder is configured for quotation and dispatch documents. DM company name/address use the user-supplied quotation template unless overridden by DM_COMPANY_NAME/ADDRESS; MM requires MM_COMPANY_NAME/ADDRESS. No GSTIN is invented. The configured Drive folder must allow file uploads by the configured account. Upload and Sheet writeback are separate systems; a PDF_SAVED_LINK_PENDING response reports the file URL if link writeback fails. Email still requires sender configuration and implementation. Dispatch issuing remains blocked until the approval rules and party/transporter mappings are verified.

O2D uses **Enquiry No + Sr no**. It never allocates an Order No or changes the sheet structure for one. In the CRR/NBD register, choose **Transfer to O2D FBD/MUM** on an eligible Won material, review the destination/material preview, then confirm. Each transferred material needs PO Number, Remarks, a positive quantity and a quotation Rate. The app uses FMS Order Qty when populated, or FMS Qty when Order Qty is blank. Other incomplete or non-Won materials do not block eligible materials. Branch aliases such as Faridabad and Mumbai are normalized centrally; the backend validates the destination against FMS. The app retains the configured replacement CRR spreadsheet.

O2D pages `/o2d/fbd` and `/o2d/mum` read the actual `gid=0` tabs, with grouped columns, filters, material editing, and separate invoice history. Formula cells (including header-array outputs) are read-only. Transfers preserve the Balance Qty and Total Value formulas. PO Date and Payment Terms remain blank until a source mapping is verified; Nos remains blank on transfer. No automatic FMS writeback is performed. [O2D data dictionary](docs/O2D_DATA_DICTIONARY.md) documents each physical column and repeated header.

A filesystem lock protects serial allocation and writes across app processes on this host. External spreadsheet editors and other hosts do not share this lock; changed snapshots are rejected before writing. Retrying a transfer checks the duplicate signature against live O2D rows. Do not run multiple backend hosts against these sheets without a shared lock service.

Historical rows without a unique DB_ID cannot be edited using Edit Row. Quotation saves can match a historical row by an unambiguous Enquiry No + SKU and its unchanged full-row snapshot. Rows with DB_ID also require that stable identity to match. No bulk identity migration has been performed. Existing row edits compare a full-row hash and LAST_EDIT_TS; external Sheet writers can still race between read and write because Sheets has no conditional compare-and-swap. Same-host web writes share one lock.

## Quotation terms and Sheet writeback

Edit the visible Note/make, Delivery, GST, Payment, Packing & Forwarding, Transportation, Validity, Prepared by, Closing message and Sign-off fields before Preview quotation or Save & download PDF. Enter a rate for every material. Blank rates are not silently treated as zero.

Save & download PDF uploads the generated PDF to QUOTATION_PDF_FOLDER_ID and atomically updates the selected source rows: X (Rate), Z (Quote Link), LAST_EDIT_TS and an audit entry. It matches Enquiry No + SKU and DB_ID where present; each selected material keeps its own rate. The CRR/NBD source is determined by the selected workspace. Column headers must match the verified X/Z mapping. The downloaded bytes are the same PDF uploaded to Drive. No PDF download is reported as saved if upload or Sheet writeback fails.

The service rechecks the row snapshot before upload and again before writing, and it refuses formula-managed targets. Google Sheets has no compare-and-swap operation, so an external edit between the final read and write remains a concurrency limitation. A failed writeback after successful upload reports the saved URL for recovery; retries are not automatic. This avoids pretending that Drive upload and Sheet updates form one cross-service transaction.

Verification: typecheck, lint, build and 53 automated tests passed on 7 October 2026, including different rates for two SKUs, CRR/NBD isolation, unrelated rows, stale edits, protected formulas and the combined download endpoint. At verification time the provided PDF folder still returned access denied to the service account; no test uploads or live Sheet writes were performed.

## Google Drive user sign-in

For the existing My Drive PDF folder, follow [the one-time sign-in setup](docs/GOOGLE_DRIVE_SIGN_IN.md). The quotation screen now shows Drive status and a Connect Google Drive button when the OAuth client is configured. Sheets continue to use the existing service account. The client JSON and saved user credentials stay in the gitignored credentials directory.

### O2D Process Status

Open an O2D material and select **Process Status** for Step 2 Order Verification and Step 3 approval/material controls. Upload PO Copy and Upload Revised PO accept PDF/JPG/PNG files up to 10 MB using the existing Drive account. Save changes submits only changed fields; CRDD uses a calendar date and formula fields remain protected.

Both configured Sheets currently have no dropdown validation lists in these fields, so the API uses the supplied business options. Sheet validation takes precedence whenever configured. The current mappings, options, upload folder and verification results are in [O2D Process Status](docs/O2D_PROCESS_STATUS.md).
