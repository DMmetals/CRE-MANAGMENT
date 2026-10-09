# Graph Report - CRRNBD  (2026-10-09)

## Corpus Check
- 138 files · ~79,238 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: .css 4, (none) 2, .example 1)

## Summary
- 905 nodes · 2415 edges · 49 communities (46 shown, 3 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 95 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- App.tsx
- BusinessError
- transfer.ts
- app.ts
- package.json
- web/package.json
- drive-auth.ts
- index.ts
- workflow.ts
- O2DPage.tsx
- dispatch/service.ts
- CRE Enquiry & Order Management â€” Phase 1
- @tanstack/react-query
- shared/package.json
- compilerOptions
- compilerOptions
- compilerOptions
- CRM implementation status ? 2026-10-07
- compilerOptions
- steps.ts
- Data dictionary - live spreadsheet verification
- O2D data dictionary
- CRR/NBD transfer diagnosis - 2026-10-08
- Business logic migration - verification pending
- README.md
- O2D implementation and verification - 2026-10-08
- O2D Process Status implementation - 8 October 2026
- env.ts
- .prettierrc.json
- AGENTS.md
- WORKFLOW.md
- EnquiryCRM.tsx
- updates.ts
- packages_shared_dist_index
- DispatchPage.tsx
- api/package.json
- o2d/repository.ts
- dependencies
- react
- Env
- workflow.test.ts
- O2D drawer: verified Sheet workflow
- scripts
- drive-oauth.test.ts
- mapO2DRows
- O2D dropdown and step-card update ? 9 October 2026
- drive.ts
- drive-auth.test.ts
- Dispatch Order migration

## God Nodes (most connected - your core abstractions)
1. `BusinessError` - 92 edges
2. `Env` - 48 edges
3. `vitest` - 35 edges
4. `mapO2DRows()` - 34 edges
5. `Components and functions` - 26 edges
6. `parseEnv()` - 24 edges
7. `O2DSnapshot` - 23 edges
8. `O2DRepository` - 23 edges
9. `O2DHeaderMap` - 21 edges
10. `Exact source files and functions changed` - 21 edges

## Surprising Connections (you probably didn't know these)
- `Party and transporter masters` --references--> `customers()`  [INFERRED]
  docs/DISPATCH_ORDER_MIGRATION.md → apps/api/src/modules/customers/service.ts
- `Values, controls and formula preservation` --references--> `purchaseActualWrite()`  [INFERRED]
  docs/O2D_SHEET_WORKFLOW.md → apps/api/src/modules/o2d/purchase.ts
- `Components and functions` --references--> `checkPdfFolder()`  [INFERRED]
  docs/DISPATCH_ORDER_MIGRATION.md → apps/api/src/modules/documents/drive.ts
- `Components and functions` --references--> `uploadPdf()`  [INFERRED]
  docs/DISPATCH_ORDER_MIGRATION.md → apps/api/src/modules/documents/drive.ts
- `Components and functions` --references--> `renderPdf()`  [INFERRED]
  docs/DISPATCH_ORDER_MIGRATION.md → apps/api/src/modules/documents/pdf.ts

## Import Cycles
- 3-file cycle: `apps/api/src/modules/o2d/purchase.ts -> apps/api/src/modules/o2d/repository.ts -> apps/api/src/modules/o2d/steps.ts -> apps/api/src/modules/o2d/purchase.ts`

## Communities (49 total, 3 thin omitted)

### Community 0 - "App.tsx"
Cohesion: 0.21
Nodes (9): get(), getGoogleHealth(), getHealth(), fetchApi(), invalidResponse(), parseApiResponse(), App(), QuotationPage() (+1 more)

### Community 1 - "BusinessError"
Cohesion: 0.10
Nodes (46): googleSources(), customers(), partyRecords(), SALES_PERSON_FALLBACK, salesPersons(), validateSelections(), DispatchParty, dispatchPartyRecords() (+38 more)

### Community 2 - "transfer.ts"
Cohesion: 0.05
Nodes (37): documentHtml(), escapeHtml(), quotationHtml(), EnquiryRepository, branchSchema, env, transferSchema, duplicateKey() (+29 more)

### Community 3 - "app.ts"
Cohesion: 0.15
Nodes (10): buildApp(), calls, env, input, O2DController, dotenv, @fastify/cors, @fastify/helmet (+2 more)

### Community 4 - "package.json"
Cohesion: 0.04
Nodes (45): devDependencies, concurrently, eslint, @eslint/js, globals, jsdom, @playwright/test, prettier (+37 more)

### Community 5 - "web/package.json"
Cohesion: 0.05
Nodes (39): dependencies, @cre/shared, @hookform/resolvers, lucide-react, react, react-dom, react-hook-form, react-router-dom (+31 more)

### Community 6 - "drive-auth.ts"
Cohesion: 0.22
Nodes (13): clientSchema, DRIVE_SCOPE, DriveUserCredentials, readJson(), readOAuthClient(), readUserCredentials(), root, storeUserCredentials() (+5 more)

### Community 7 - "index.ts"
Cohesion: 0.07
Nodes (45): Implemented, Purchase tab change record - 8 October 2026, Still awaiting existing source, Validation, Verified current mapping, normalizeBranch(), dateInputValue(), dateSerial() (+37 more)

### Community 8 - "workflow.ts"
Cohesion: 0.14
Nodes (12): editable, invoiceHeaders, isBusinessEditable(), normalizeO2DHeader(), gridSchema, PO_MAX_BYTES, resolveWorkflowFields(), stepStart() (+4 more)

### Community 9 - "O2DPage.tsx"
Cohesion: 0.15
Nodes (13): O2DDetail(), refreshWorkflowRow(), save(), upload(), workflowTab(), Column, groups, identity (+5 more)

### Community 10 - "dispatch/service.ts"
Cohesion: 0.10
Nodes (25): DispatchAudit, dispatchCompany(), dispatchFooter, dispatchTerms, dispatchEmailReady(), sendDispatchEmail(), dispatchRoutes(), amount (+17 more)

### Community 11 - "CRE Enquiry & Order Management â€” Phase 1"
Cohesion: 0.13
Nodes (15): Architecture and files, Commands and validation, CRE Enquiry & Order Management â€” Phase 1, CRM enquiry release, Current CRM routes and safe writes, Environment, Google Cloud service-account setup, Google Drive user sign-in (+7 more)

### Community 12 - "@tanstack/react-query"
Cohesion: 0.36
Nodes (5): DriveConnection(), Status, request, show(), @tanstack/react-query

### Community 13 - "shared/package.json"
Cohesion: 0.17
Nodes (11): dependencies, zod, exports, zod, name, private, scripts, build (+3 more)

### Community 14 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, jsx, lib, module, moduleResolution, noEmit, types, extends (+2 more)

### Community 15 - "compilerOptions"
Cohesion: 0.20
Nodes (9): compilerOptions, module, moduleResolution, outDir, rootDir, types, extends, include (+1 more)

### Community 16 - "compilerOptions"
Cohesion: 0.20
Nodes (9): compilerOptions, declaration, module, moduleResolution, outDir, rootDir, extends, include (+1 more)

### Community 17 - "CRM implementation status ? 2026-10-07"
Cohesion: 0.22
Nodes (8): 7 October 2026: enquiry master and transfer corrections, APIs added or completed, CRM implementation status ? 2026-10-07, Files changed, Remaining work / constraints, Run, Validation, Verified working

### Community 18 - "compilerOptions"
Cohesion: 0.22
Nodes (8): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, noUncheckedIndexedAccess, resolveJsonModule, skipLibCheck, strict, target

### Community 19 - "steps.ts"
Cohesion: 0.13
Nodes (22): purchaseDateHeaders, purchaseDefaults, materialStatusOptions, paymentTermsOptions, remarksOptions, buildStepLayout(), Cell, cellSchema (+14 more)

### Community 20 - "Data dictionary - live spreadsheet verification"
Cohesion: 0.25
Nodes (6): CRR, Data dictionary - live spreadsheet verification, Discrepancies and mapping constraints, NBD, O2D_FBD, O2D_MUM

### Community 21 - "O2D data dictionary"
Cohesion: 0.29
Nodes (7): Duplicate headers, Formula protection, Identity and business rules, O2D data dictionary, Physical dictionary (identical for FBD and MUM), Sources, Transfer mapping

### Community 22 - "CRR/NBD transfer diagnosis - 2026-10-08"
Cohesion: 0.29
Nodes (5): CRR/NBD transfer diagnosis - 2026-10-08, Current source and preview results, Mapping and write behavior, Root cause and fix, Verification

### Community 23 - "Business logic migration - verification pending"
Cohesion: 0.33
Nodes (5): Business logic migration - verification pending, Gate before Phase 2, Live verification update, Supplied-rules implementation authorized, Verified timestamp template exception

### Community 24 - "README.md"
Cohesion: 0.33
Nodes (3): Configuration and credentials, Connect Google Drive for quotation PDFs, One-time setup on this computer

### Community 25 - "O2D implementation and verification - 2026-10-08"
Cohesion: 0.33
Nodes (6): APIs, O2D implementation and verification - 2026-10-08, Transfer rules implemented, UI, Verification, Workbook verification

### Community 26 - "O2D Process Status implementation - 8 October 2026"
Cohesion: 0.33
Nodes (6): Actual dropdown discovery and displayed values, O2D Process Status implementation - 8 October 2026, Physical mappings verified against both live Sheets, PO upload and revised PO upload, Saves, formulas and dates, Verification

### Community 27 - "env.ts"
Cohesion: 0.23
Nodes (9): parseEnv(), schema, dispatchFixture(), DESTINATIONS, fixture(), HEADERS, env, env (+1 more)

### Community 31 - "EnquiryCRM.tsx"
Cohesion: 0.17
Nodes (12): loadConfig(), loadRegister(), request(), saveEnquiry(), CreateEnquiry(), EditRow(), EnquiryCRM(), EnquiryDetail() (+4 more)

### Community 32 - "updates.ts"
Cohesion: 0.14
Nodes (16): cellWrite(), O2DAuditEntry, purchaseFixture(), O2DPurchaseReader, purchaseActualWrite(), purchaseLayout(), purchaseTimestamp(), env (+8 more)

### Community 33 - "packages_shared_dist_index"
Cohesion: 0.11
Nodes (14): clients, data(), field(), preview, request, row(), AuditEntry, sectionFor (+6 more)

### Community 34 - "DispatchPage.tsx"
Cohesion: 0.12
Nodes (11): DispatchPage(), action(), change(), editable(), money(), clients, doc, materials (+3 more)

### Community 35 - "api/package.json"
Cohesion: 0.14
Nodes (13): devDependencies, tsx, @types/nodemailer, @cre/shared, zod, name, private, type (+5 more)

### Community 36 - "o2d/repository.ts"
Cohesion: 0.17
Nodes (9): O2D_SOURCES, orderSource(), isCellProtected(), O2DProtectedRange, o2dRowVersion(), protectionSchema, rangeContains(), rangeSchema (+1 more)

### Community 37 - "dependencies"
Cohesion: 0.15
Nodes (13): dependencies, @cre/shared, decimal.js, dotenv, fastify, @fastify/cors, @fastify/helmet, @fastify/multipart (+5 more)

### Community 38 - "react"
Cohesion: 0.32
Nodes (3): ErrorBoundary, client, react

### Community 39 - "Env"
Cohesion: 0.10
Nodes (18): Env, SHEETS_READONLY_SCOPE, DispatchMasters, createGoogleAuth(), hasGoogleCredentials(), safeFailure(), createGoogleHealthCheck(), check() (+10 more)

### Community 40 - "workflow.test.ts"
Cohesion: 0.18
Nodes (9): env, file, setup(), setup(), O2DUpdateService, workflowFixture(), env, request (+1 more)

### Community 41 - "O2D drawer: verified Sheet workflow"
Cohesion: 0.22
Nodes (8): Dispatch Order integration boundary, Dropdown sources and options, Exact field mappings, Files and functions changed for this request, O2D drawer: verified Sheet workflow, Source metadata and branch differences, Values, controls and formula preservation, Verification

### Community 42 - "scripts"
Cohesion: 0.40
Nodes (5): scripts, build, dev, start, typecheck

### Community 43 - "drive-oauth.test.ts"
Cohesion: 0.40
Nodes (5): calls, connect(), env, start(), google-auth-library

### Community 44 - "mapO2DRows"
Cohesion: 0.17
Nodes (13): O2DHeaderMap, mapO2DRows(), o2dRowId(), stepsFixture(), fixture(), fixture(), schema, clients (+5 more)

### Community 45 - "O2D dropdown and step-card update ? 9 October 2026"
Cohesion: 0.15
Nodes (12): 10. Tests passed, 11. Build passed, 1. Files changed, 2. Step 4 options, 3. Step 5 options, 4. Step 8 options, 5. Material Status options, 6. Remarks / Challenges options (+4 more)

### Community 46 - "drive.ts"
Cohesion: 0.35
Nodes (10): getDriveAuth(), checkPdfFolder(), driveFailure(), calls, env, folder, trashUploadedFile(), uploadFile() (+2 more)

### Community 47 - "drive-auth.test.ts"
Cohesion: 0.24
Nodes (4): DispatchOperation, constructor(), credentials, options

### Community 48 - "Dispatch Order migration"
Cohesion: 0.18
Nodes (10): API and access compatibility, Branch company configuration, Changed files, Dispatch Order migration, Identity, eligibility and mapping, Party and transporter masters, Requested acceptance report, Single document, calculations and output (+2 more)

## Knowledge Gaps
- **322 isolated node(s):** `singleQuote`, `trailingComma`, `name`, `version`, `private` (+317 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 373 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `env.ts` to `App.tsx`, `BusinessError`, `transfer.ts`, `app.ts`, `package.json`, `index.ts`, `dispatch/service.ts`, `@tanstack/react-query`, `steps.ts`, `EnquiryCRM.tsx`, `updates.ts`, `packages_shared_dist_index`, `DispatchPage.tsx`, `o2d/repository.ts`, `Env`, `workflow.test.ts`, `drive-oauth.test.ts`, `mapO2DRows`, `drive.ts`, `drive-auth.test.ts`?**
  _High betweenness centrality (0.118) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `mapO2DRows()` (e.g. with `.findColumn()` and `.requireColumn()`) actually correct?**
  _`mapO2DRows()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `singleQuote`, `trailingComma`, `name` to the rest of the system?**
  _322 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `BusinessError` be split into smaller, more focused modules?**
  _Cohesion score 0.09626064420584969 - nodes in this community are weakly interconnected._
- **Why does `BusinessError` connect `BusinessError` to `updates.ts`, `transfer.ts`, `app.ts`, `o2d/repository.ts`, `drive-auth.ts`, `workflow.ts`, `dispatch/service.ts`, `drive-oauth.test.ts`, `mapO2DRows`, `drive.ts`, `steps.ts`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **Should `transfer.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0502283105022831 - nodes in this community are weakly interconnected._
- **Why does `@tanstack/react-query` connect `@tanstack/react-query` to `App.tsx`, `packages_shared_dist_index`, `DispatchPage.tsx`, `web/package.json`, `react`, `O2DPage.tsx`, `mapO2DRows`, `EnquiryCRM.tsx`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._