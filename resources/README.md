# NarraCat Runtime Resources

`resources/` is the Electron packaging resource area. NarraCat Agent Core source
now lives in `agent-core/narracat/`; do not edit or recreate
`resources/NarraCat` as a source directory.

## Runtime Paths

Development runs resolve NarraCat Agent Core from:

```text
<repo>/agent-core/narracat
```

Packaged builds do not copy that source directory directly. `scripts/stage-narracat-agent-core.mjs`
stages a **default-deny whitelist** copy into `build/NarraCatAgentCore` (runtime resources only —
research artifacts and dev metadata excluded, see ADR-0026), and `package.json`
`build.extraResources` ships that staged directory. In a packaged app the engine
resolves from Electron's resources directory (`electron/main/engine/engine.ts`):

```text
<app>/Contents/Resources/NarraCatAgentCore
```

The packaged directory ships the internal Agent Core's engine resources
(commands/agents/skills/schemas/MCP server), consumed by the app's pi-based
agent runtime. It is not a checkout of any upstream repository.

## Preparation

`bun --no-cache run dev` runs:

```bash
node scripts/prepare-narracat-agent-core.mjs --if-missing --optional
```

The script reads `narracat.manifest.json` (the engine's single contract manifest),
verifies or builds `mcp-server/dist/index.js`, and installs/prunes MCP runtime
dependencies when needed. Use Node `22` (`^22.12.0`, enforced by
`scripts/check-node-runtime.mjs`); native MCP dependencies are not compatible with
Node `26`.

To verify the internal Agent Core lock:

```bash
bun --no-cache run verify:narracat-agent-core
```

To audit raw prompt drift against the accepted upstream commit:

```bash
# <upstream-checkout> = a checkout of the accepted upstream commit recorded in
# agent-core/narracat-agent-core.lock.json (upstream.commit).
bun --no-cache run audit:narracat-prompts -- --source <upstream-checkout>
```

The audit compares raw prompt resources under `commands/`, `agents/`, `skills/`,
and `templates/`. App orchestration wrappers remain separate product code.

> Maintainer-only: the upstream this locks against is a private repository, so this
> audit is not runnable from a public clone. It is a one-off provenance check for the
> 2026-06-02 final import, not part of any routine workflow — the engine has been
> maintained in-tree since then (ADR-0007), so day-to-day work never needs it.

## Packaging Acceptance

Before packaging or handing off a release candidate, run:

```bash
bun --no-cache run verify:narracat-agent-core
node scripts/prepare-narracat-agent-core.mjs --if-missing --optional
bun --no-cache run ops:check
bun --no-cache run test
bun --no-cache run typecheck
bun --no-cache run check:design
bun --no-cache run build
bun --no-cache run package
```

The package command verifies and prepares the internal Agent Core, stages a
whitelisted runtime-only copy into `build/NarraCatAgentCore` (excluding research
artifacts and dev metadata, see ADR-0026), builds the Electron bundles, computes
the client build version, and lets electron-builder copy that staged directory
into the app resources directory.
