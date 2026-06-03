# RockAuto Catalog Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first MCP server folder in the `MCPs` repo for catalog/search-only RockAuto research.

**Architecture:** The repo is a parent collection with a TypeScript MCP server under `servers/rockauto-catalog-search`. The server separates MCP tool wiring, normalized domain models, safety controls, and RockAuto provider access so future providers or HTTP transport can be added without rewriting tools.

**Tech Stack:** Node.js, TypeScript, official `@modelcontextprotocol/sdk`, Zod, Vitest.

---

### Task 1: Repository And Package Skeleton

**Files:**
- Create: `README.md`
- Create: `.gitignore`
- Create: `docs/superpowers/specs/2026-06-03-rockauto-catalog-search-design.md`
- Create: `docs/superpowers/plans/2026-06-03-rockauto-catalog-search.md`
- Create: `servers/rockauto-catalog-search/package.json`
- Create: `servers/rockauto-catalog-search/tsconfig.json`
- Create: `servers/rockauto-catalog-search/vitest.config.ts`
- Create: `servers/rockauto-catalog-search/README.md`

- [x] **Step 1: Create repo docs and package configuration**

Write the files listed above with a catalog/search-only scope, stdio-first MCP
entrypoint, and npm scripts for `build`, `test`, `typecheck`, and `dev`.

- [x] **Step 2: Install dependencies**

Run:

```bash
cd /Users/carterbarker/MCPs/servers/rockauto-catalog-search
npm install
```

Expected: `package-lock.json` and `node_modules/` are created.

### Task 2: Domain Logic With TDD

**Files:**
- Create: `servers/rockauto-catalog-search/src/domain/types.ts`
- Create: `servers/rockauto-catalog-search/src/domain/compare.ts`
- Create: `servers/rockauto-catalog-search/src/domain/fitment.ts`
- Create: `servers/rockauto-catalog-search/src/domain/compare.test.ts`
- Create: `servers/rockauto-catalog-search/src/domain/fitment.test.ts`

- [x] **Step 1: Write failing tests for comparison and fitment**

Run:

```bash
npm test -- src/domain/compare.test.ts src/domain/fitment.test.ts
```

Expected: tests fail because the implementation files do not exist.

- [x] **Step 2: Implement domain models and pure functions**

Create normalized part types, `compareParts`, and `explainFitment`.

- [x] **Step 3: Verify tests pass**

Run:

```bash
npm test -- src/domain/compare.test.ts src/domain/fitment.test.ts
```

Expected: all tests pass.

### Task 3: Safety Utilities With TDD

**Files:**
- Create: `servers/rockauto-catalog-search/src/safety/cache.ts`
- Create: `servers/rockauto-catalog-search/src/safety/rate-limit.ts`
- Create: `servers/rockauto-catalog-search/src/safety/url.ts`
- Create: `servers/rockauto-catalog-search/src/safety/cache.test.ts`
- Create: `servers/rockauto-catalog-search/src/safety/rate-limit.test.ts`
- Create: `servers/rockauto-catalog-search/src/safety/url.test.ts`

- [x] **Step 1: Write failing tests for TTL cache, rate limiter, and URL validation**

Run:

```bash
npm test -- src/safety/cache.test.ts src/safety/rate-limit.test.ts src/safety/url.test.ts
```

Expected: tests fail because the implementation files do not exist.

- [x] **Step 2: Implement safety utilities**

Create a short-lived in-memory cache, sequential rate limiter, and RockAuto URL
validator that rejects non-RockAuto URLs and unsupported account/cart paths.

- [x] **Step 3: Verify tests pass**

Run:

```bash
npm test -- src/safety/cache.test.ts src/safety/rate-limit.test.ts src/safety/url.test.ts
```

Expected: all tests pass.

### Task 4: MCP Tool Registry And Stdio Entrypoint

**Files:**
- Create: `servers/rockauto-catalog-search/src/catalog/provider.ts`
- Create: `servers/rockauto-catalog-search/src/catalog/mock-provider.ts`
- Create: `servers/rockauto-catalog-search/src/tools/register.ts`
- Create: `servers/rockauto-catalog-search/src/server.ts`
- Create: `servers/rockauto-catalog-search/src/index.ts`
- Create: `servers/rockauto-catalog-search/src/tools/register.test.ts`

- [x] **Step 1: Write failing tests for tool registry behavior**

Run:

```bash
npm test -- src/tools/register.test.ts
```

Expected: tests fail because the registry implementation does not exist.

- [x] **Step 2: Implement provider interface, mock provider, tool registry, and stdio entrypoint**

Register the eight v1 tools and route them through a provider interface. Keep
the default implementation mockable so tests do not hit RockAuto.

- [x] **Step 3: Verify tool registry tests pass**

Run:

```bash
npm test -- src/tools/register.test.ts
```

Expected: all tests pass.

### Task 5: Build, Docs, Git, And Remote Setup

**Files:**
- Modify: `servers/rockauto-catalog-search/README.md`

- [x] **Step 1: Run full local verification**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected: tests, typecheck, and build pass.

- [x] **Step 2: Initialize git and commit**

Run:

```bash
cd /Users/carterbarker/MCPs
git init
git add .
git commit -m "feat: add RockAuto catalog search MCP"
```

Expected: initial commit is created on `main`.

- [ ] **Step 3: Create or connect GitHub repo**

Status: `CBaileyDev/MCPs` exists on GitHub with `main` as the default branch.
Push the local `main` commit to `origin/main`.

If `gh` is authenticated, run:

```bash
gh repo create CBaileyDev/MCPs --public --source=/Users/carterbarker/MCPs --remote=origin --push
```

If `gh` is unavailable or unauthenticated, create `CBaileyDev/MCPs` on GitHub,
then run:

```bash
git remote add origin https://github.com/CBaileyDev/MCPs.git
git push -u origin main
```
