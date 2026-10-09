# Graph Report - CRRNBD  (2026-10-08)

## Corpus Check
- 111 files · ~56,578 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: .css 3, (none) 2, .example 1)

## Summary
- 703 nodes · 1767 edges · 31 communities (27 shown, 4 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 33 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- packages_shared_dist_index
- BusinessError
- transfer.ts
- app.ts
- package.json
- web/package.json
- drive-auth.ts
- index.ts
- o2d/repository.ts
- po-upload.ts
- workflow.ts
- CRE Enquiry & Order Management â€” Phase 1
- workflow.test.ts
- shared/package.json
- compilerOptions
- compilerOptions
- compilerOptions
- CRM implementation status ? 2026-10-07
- compilerOptions
- updates.ts
- Data dictionary - live spreadsheet verification
- O2D data dictionary
- CRR/NBD transfer diagnosis - 2026-10-08
- Business logic migration - verification pending
- README.md
- O2D implementation and verification - 2026-10-08
- O2D Process Status implementation - 8 October 2026
- config.ts
- .prettierrc.json
- AGENTS.md
- WORKFLOW.md

## God Nodes (most connected - your core abstractions)
1. `BusinessError` - 70 edges
2. `Env` - 37 edges
3. `vitest` - 29 edges
4. `parseEnv()` - 20 edges
5. `mapO2DRows()` - 20 edges
6. `request()` - 20 edges
7. `saveQuotation()` - 18 edges
8. `googleSources()` - 17 edges
9. `SheetsService` - 16 edges
10. `O2DHeaderMap` - 16 edges

## Surprising Connections (you probably didn't know these)
- `local()` --calls--> `BusinessError`  [EXTRACTED]
  apps/api/src/modules/documents/drive-oauth.ts → apps/api/src/modules/enquiries/creation.ts
- `buildApp()` --calls--> `driveOAuthRoutes()`  [EXTRACTED]
  apps/api/src/app.ts → apps/api/src/modules/documents/drive-oauth.ts
- `buildApp()` --calls--> `documentRoutes()`  [EXTRACTED]
  apps/api/src/app.ts → apps/api/src/modules/documents/routes.ts
- `buildApp()` --calls--> `enquiryRoutes()`  [EXTRACTED]
  apps/api/src/app.ts → apps/api/src/modules/enquiries/routes.ts
- `buildApp()` --calls--> `O2DController`  [EXTRACTED]
  apps/api/src/app.ts → apps/api/src/modules/o2d/controller.ts

## Import Cycles
- None detected.

## Communities (31 total, 4 thin omitted)

### Community 0 - "packages_shared_dist_index"
Cohesion: 0.05
Nodes (56): get(), getGoogleHealth(), getHealth(), fetchApi(), invalidResponse(), parseApiResponse(), App(), ErrorBoundary (+48 more)

### Community 1 - "BusinessError"
Cohesion: 0.07
Nodes (60): Env, schema, googleSources(), SHEETS_READONLY_SCOPE, customers(), partyRecords(), SALES_PERSON_FALLBACK, salesPersons() (+52 more)

### Community 2 - "transfer.ts"
Cohesion: 0.06
Nodes (33): buildApp(), parseEnv(), env, calls, env, input, EnquiryRepository, GoogleSheetsEnquiryRepository (+25 more)

### Community 3 - "app.ts"
Cohesion: 0.05
Nodes (44): dependencies, @cre/shared, dotenv, fastify, @fastify/cors, @fastify/helmet, @fastify/multipart, @fastify/rate-limit (+36 more)

### Community 4 - "package.json"
Cohesion: 0.04
Nodes (45): devDependencies, concurrently, eslint, @eslint/js, globals, jsdom, @playwright/test, prettier (+37 more)

### Community 5 - "web/package.json"
Cohesion: 0.05
Nodes (39): dependencies, @cre/shared, @hookform/resolvers, lucide-react, react, react-dom, react-hook-form, react-router-dom (+31 more)

### Community 6 - "drive-auth.ts"
Cohesion: 0.12
Nodes (25): clientSchema, DRIVE_SCOPE, DriveUserCredentials, getDriveAuth(), readJson(), readOAuthClient(), readUserCredentials(), root (+17 more)

### Community 7 - "index.ts"
Cohesion: 0.09
Nodes (29): normalizeBranch(), dateInputValue(), dateSerial(), ApiResponse, EnquiryMaterial, EnquiryRegister, EnquiryType, enquiryTypes (+21 more)

### Community 8 - "o2d/repository.ts"
Cohesion: 0.15
Nodes (17): O2DHeaderMap, formulaColumns(), isCellProtected(), mapO2DRows(), O2DProtectedRange, o2dRowId(), o2dRowVersion(), O2DSnapshot (+9 more)

### Community 9 - "po-upload.ts"
Cohesion: 0.12
Nodes (16): branchSchema, O2DController, transferSchema, O2DPOService, POFile, poFilename(), POInput, poInputSchema (+8 more)

### Community 10 - "workflow.ts"
Cohesion: 0.22
Nodes (10): editable, invoiceHeaders, isBusinessEditable(), normalizeO2DHeader(), gridSchema, resolveWorkflowFields(), stepStart(), ValidationRule (+2 more)

### Community 11 - "CRE Enquiry & Order Management â€” Phase 1"
Cohesion: 0.13
Nodes (15): Architecture and files, Commands and validation, CRE Enquiry & Order Management â€” Phase 1, CRM enquiry release, Current CRM routes and safe writes, Environment, Google Cloud service-account setup, Google Drive user sign-in (+7 more)

### Community 12 - "workflow.test.ts"
Cohesion: 0.16
Nodes (5): O2DUpdateService, O2DValidationReader, env, request, setup()

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

### Community 19 - "updates.ts"
Cohesion: 0.32
Nodes (4): O2DAuditEntry, o2dAuditRequests(), O2DUpdate, workflowAuditActions

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

## Knowledge Gaps
- **269 isolated node(s):** `singleQuote`, `trailingComma`, `name`, `version`, `private` (+264 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 302 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `transfer.ts` to `packages_shared_dist_index`, `BusinessError`, `app.ts`, `package.json`, `drive-auth.ts`, `index.ts`, `o2d/repository.ts`, `po-upload.ts`, `workflow.test.ts`?**
  _High betweenness centrality (0.141) - this node is a cross-community bridge._
- **What connects `singleQuote`, `trailingComma`, `name` to the rest of the system?**
  _269 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `packages_shared_dist_index` be split into smaller, more focused modules?**
  _Cohesion score 0.05157232704402516 - nodes in this community are weakly interconnected._
- **Why does `BusinessError` connect `BusinessError` to `transfer.ts`, `app.ts`, `drive-auth.ts`, `o2d/repository.ts`, `po-upload.ts`, `workflow.ts`, `workflow.test.ts`, `updates.ts`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **Should `BusinessError` be split into smaller, more focused modules?**
  _Cohesion score 0.0745274914089347 - nodes in this community are weakly interconnected._
- **Why does `normalizeBranch()` connect `index.ts` to `po-upload.ts`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Should `transfer.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.059027777777777776 - nodes in this community are weakly interconnected._