# Agent Instructions

This file provides instructions for AI agents working on this TypeScript/JavaScript monorepo.

## Project Overview

- **Language**: TypeScript
- **Runtime**: Node.js (v16.16+ required, see `.nvmrc`)
- **Package Manager**: npm with workspaces
- **Monorepo Orchestration**: Turborepo
- **Testing**: Jest
- **Linting**: ESLint + Prettier
- **Build**: TypeScript compiler (tsc) + Webpack (for UMD bundles)

### Project Structure

```
packages/
  core/                           # @ht-sdks/events-sdk-js-core (published)
  browser/                        # @ht-sdks/events-sdk-js-browser (published)
  node/                           # @ht-sdks/events-sdk-js-node (published)
  consent/
    consent-tools/                # @ht-sdks/events-sdk-js-consent-tools (published)
    consent-wrapper-onetrust/     # @ht-sdks/events-sdk-js-consent-wrapper-onetrust (published)
  config/                         # @internal/config (private, internal tooling)
  config-webpack/                 # @internal/config-webpack (private, internal tooling)
  test-helpers/                   # @internal/test-helpers (private, internal tooling)
```

### Package Dependencies

```
browser ──► core
node ──► core
consent-tools ──► browser (peer)
consent-wrapper-onetrust ──► consent-tools
```

---

## Updating Dependencies

### 1. Pre-flight Checks

```bash
# Check Node.js version matches .nvmrc (currently 16.16)
node --version

# If using nvm:
nvm use

# Ensure you're at the repository root
pwd  # Should be: /path/to/events-sdk-js-mono
```

### 2. Establish Test Baseline

```bash
# Install dependencies first
npm ci

# Build all packages (required before tests)
npm run build

# Run all tests
npm run test
```

Record the number of passing tests before making any changes. This ensures you can verify nothing broke after upgrading.

### 3. Check for Security Advisories

```bash
npm audit
```

Review any vulnerabilities. Use `npm audit fix` for automatic patches, or `npm audit fix --force` for breaking changes (use with caution).

### 4. Check Outdated Packages

```bash
# Check root-level dependencies
npm outdated

# Check all workspace packages
npm outdated --workspaces
```

This shows:
- **Current**: Installed version
- **Wanted**: Latest within current semver range
- **Latest**: Newest available version

### 5. Upgrade Dependencies

#### Option A: Safe Updates (within semver range)

```bash
# Update all packages to latest within their semver constraints
npm update

# Update specific package
npm update <package-name>
```

#### Option B: Major Version Updates

For major version bumps, edit `package.json` files directly:

```bash
# Root package.json for shared dev dependencies
# packages/*/package.json for package-specific dependencies
```

Then reinstall:

```bash
rm -rf node_modules package-lock.json
npm install
```

#### Option C: Interactive Updates (recommended)

Use `npm-check-updates` for a better upgrade experience:

```bash
# Install globally (one-time)
npm install -g npm-check-updates

# Check what can be updated (root)
ncu

# Check what can be updated (all workspaces)
ncu --deep

# Apply updates to package.json files
ncu -u --deep

# Reinstall
rm -rf node_modules package-lock.json
npm install
```

### 6. Rebuild and Test

```bash
# Rebuild all packages
npm run build

# Run linting
npm run lint

# Run all tests
npm run test

# Check bundle size (browser package)
cd packages/browser && npm run size-limit
```

Compare test results to baseline. Fix any failures before proceeding.

### 7. Verify CI Would Pass

The CI runs on Node 16, 18, and 20. If you have nvm, test on multiple versions:

```bash
nvm use 18 && npm run build && npm run test
nvm use 20 && npm run build && npm run test
nvm use 16 && npm run build && npm run test  # Return to default
```

---

## Package-Specific Notes

### Core Package (`packages/core`)

Foundation package with no external Hightouch dependencies. Update this first when doing cross-package upgrades.

```bash
cd packages/core
npm run build
npm run test
npm run lint
```

### Browser Package (`packages/browser`)

Has the most dependencies and includes UMD bundle. After updating:

```bash
cd packages/browser
npm run build          # Builds ESM, CJS, and UMD
npm run size-limit     # Verify bundle size stays under 37KB
npm run test
```

**Version file**: `src/generated/version.ts` is auto-generated from `package.json` version during build.

### Node Package (`packages/node`)

```bash
cd packages/node
npm run build
npm run test
```

**Version file**: `src/generated/version.ts` is auto-generated from `package.json` version.

### Consent Packages (`packages/consent/*`)

These depend on browser package. Update browser first, then consent packages.

---

## Version Bumping

### Semantic Versioning

- **PATCH** (1.0.1 → 1.0.2): Bug fixes, dependency updates, no new features
- **MINOR** (1.0.1 → 1.1.0): New backwards-compatible features
- **MAJOR** (1.0.1 → 2.0.0): Breaking API changes

Dependency updates are typically **PATCH** bumps.

### Files to Update

Each published package has:
1. `package.json` → `"version": "X.Y.Z"` (recommended for major versions)
2. `src/generated/version.ts` → Auto-generated during build (browser/node packages)

**Note**: The actual published version comes from the git tag, not `package.json`. But keeping `package.json` updated for major versions helps document the current state.

---

## Publishing to NPM

Publishing is automated via GitHub Actions. See individual `RELEASE.md` files in each package.

### Release Process

1. Create a git tag matching the format: `<package>@x.x.x`

2. Create a GitHub Release for the tag

3. GitHub Actions will automatically:
   - Build the package
   - Publish to NPM
   - (Browser only) Deploy to CDN

### Candidate Testing (Browser)

For pre-release testing:

```bash
# Create an RC tag
git tag browser@1.2.1-rc
git push --tags
```

This triggers a candidate build to CDN without publishing to NPM.

---

## CI/CD

- CI config: `.github/workflows/ci.yml`
- Runs on Node 16, 18, and 20
- Steps: `npm ci`, `npm run build`, `npm run lint`, `npm run size-limit`, `npm run test`

### CI Failures After Dependency Updates

1. **TypeScript errors**: Check type definitions changed in updated packages
2. **Test failures**: Review changelog of updated packages for breaking changes
3. **Bundle size exceeded**: The browser package has a 37KB limit. May need to:
   - Find smaller alternative dependencies
   - Tree-shake unused code
   - Update the limit if size increase is justified

---

## Common Issues

### Breaking API Changes

When upgrading major versions, APIs may change. Common patterns:

```bash
# Find all usages of a changed API
grep -r "oldApiName" packages/*/src --include="*.ts"

# Update imports if package restructured
grep -r "from 'package/old-path'" packages/*/src --include="*.ts"
```

### Peer Dependency Conflicts

The consent packages have peer dependencies on browser. If you update browser's major version:

1. Update `peerDependencies` in `packages/consent/consent-tools/package.json`
2. Ensure version ranges are compatible

### TypeScript Version Updates

If updating TypeScript:

1. Check `tsconfig.json` options are still valid
2. Run `npm run lint` which includes `tsc --noEmit`
3. Fix any new type errors (TypeScript gets stricter over time)

### ⚠️ Known Issue: `keyofStringsOnly` (Technical Debt)

The browser package uses the deprecated `keyofStringsOnly: true` option in `packages/browser/tsconfig.json`. This option will be **removed in TypeScript 5.5**.

**Why it exists:** The storage layer (`cookieStorage.ts`, `localStorage.ts`, `memoryStorage.ts`, `universalStorage.ts`) assumes `keyof` always returns `string`. Without this option, TypeScript correctly infers `keyof` as `string | number | symbol`, causing ~18 type errors.

**Before upgrading to TypeScript 5.5+**, you must fix the storage types:

```typescript
// Current (relies on keyofStringsOnly):
get<K extends keyof Data>(key: K): Data[K] | null

// Fixed (explicit string constraint):
get<K extends Extract<keyof Data, string>>(key: K): Data[K] | null
```

Files to update:
- `packages/browser/src/core/storage/types.ts`
- `packages/browser/src/core/storage/cookieStorage.ts`
- `packages/browser/src/core/storage/localStorage.ts`
- `packages/browser/src/core/storage/memoryStorage.ts`
- `packages/browser/src/core/storage/universalStorage.ts`

After fixing, remove `keyofStringsOnly` from `packages/browser/tsconfig.json`.

### ⚠️ CRITICAL: Prettier Formatting

**Before upgrading any dependencies that touch Prettier or ESLint:**

1. **Lock Prettier settings first** - The `.prettierrc` must have `"trailingComma": "es5"` explicitly set. Prettier 3.x changed the default from `"es5"` to `"all"`, which will add trailing commas everywhere and create massive diffs.

2. **Never run Prettier on the entire codebase** - Only format files you actually changed:
   ```bash
   # WRONG - formats everything including previously unformatted files
   npx prettier --write "**/*.ts"
   
   # RIGHT - only format specific changed files
   npx prettier --write packages/browser/src/path/to/changed-file.ts
   ```

3. **The `qa/` directory is intentionally unformatted** - Files in `packages/browser/qa/` have lines > 80 chars and were never run through Prettier. Do not format them.

### ESLint/Prettier Updates

New versions may introduce new rules. After updating:

```bash
npm run lint

# Auto-fix what's possible
npx eslint . --fix
npx prettier --write "**/*.{ts,js,json}"
```

---

## Workspace Commands

### Running Commands in All Packages

```bash
# Via turbo (recommended - handles dependencies)
npm run build   # Build all
npm run test    # Test all  
npm run lint    # Lint all

# Via npm workspaces (direct)
npm run build --workspaces
npm run test --workspaces
```

### Running Commands in Specific Package

```bash
# Option 1: Use workspace flag
npm run test --workspace=@ht-sdks/events-sdk-js-browser

# Option 2: Change directory
cd packages/browser && npm run test
```

### Installing Dependencies

```bash
# Add to root (shared dev dependency)
npm install -D <package>

# Add to specific workspace
npm install <package> --workspace=@ht-sdks/events-sdk-js-browser

# Add to specific workspace as dev dependency
npm install -D <package> --workspace=@ht-sdks/events-sdk-js-browser
```

---

## Quick Reference

| Task | Command |
|------|---------|
| Install dependencies | `npm ci` |
| Install (fresh) | `rm -rf node_modules && npm install` |
| Build all | `npm run build` |
| Test all | `npm run test` |
| Lint all | `npm run lint` |
| Check outdated | `npm outdated --workspaces` |
| Security audit | `npm audit` |
| Update within semver | `npm update` |
| Check bundle size | `cd packages/browser && npm run size-limit` |
| Watch mode | `npm run watch` |
| Build for local testing | `cd packages/browser && npm run build:dev` |
| Test in browser | `cd packages/browser && npm run serve` |

---

## Development Tips

### Watch Mode

For active development:

```bash
# Watch all packages
npm run watch

# Watch specific package
cd packages/browser && npm run watch
```

### Testing Browser SDK Locally

To manually test the browser SDK in an actual browser:

```bash
# First, build the browser package for LOCAL testing (important!)
cd packages/browser && npm run build:dev

# Start the local dev server
npm run serve
```

**⚠️ Important:** Use `build:dev`, not `build`. The production build (`build`) hardcodes the CDN URL for loading chunks, which won't work locally.

Then open http://localhost:9900 in your browser. The page includes:
- Buttons to trigger identify/track/page/group/reset events
- The SDK loaded from your local `dist/umd/index.js`
- A configurable write key and API host

**Options:**
```bash
# Use a real write key
npm run serve -- --writeKey=your_actual_write_key

# Change API host
npm run serve -- --apiHost=us-east-1.hightouch-events.com

# Change port
npm run serve -- --port=8080
```

**Tips:**
- Open DevTools → Network tab to see requests to the Events API
- Open DevTools → Console for SDK debug logs
- Use `window.htevents` in console for direct SDK access

### Testing Single File

```bash
# Run specific test file
npx jest packages/browser/src/core/__tests__/analytics.test.ts

# Run tests matching pattern
npx jest --testNamePattern="should track events"
```

### Debugging

```bash
# Run tests with Node debugger
node --inspect-brk node_modules/.bin/jest --runInBand
```

Then attach VS Code or Chrome DevTools.

