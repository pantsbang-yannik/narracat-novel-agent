# ADR 0013: Writing Agent Memory Retention Policy

## Status

Accepted

## Context

NarraCat writing agents can use Claude Code project agent memory such as `.claude/agent-memory/<agent>/MEMORY.md`. During the June 2026 dogfood run, `chapter-writer` read existing project memory. The run did not show direct misuse, but older chapter-specific notes can leak into new chapters and make writing-quality regressions hard to diagnose.

NarraCat already has canonical story memory surfaces:

- WritingContextPack for the current chapter handoff.
- ChapterMetadata and ReviewReport for chapter outputs and quality routing.
- NovelMemory for persisted plot, character, world, relationship, foreshadowing, and chapter summary facts.
- Project files under `outline/`, `bible/`, `manuscript/`, and `reviews/`.

Agent memory must not become another hidden story-memory source.

## Decision

Claude Code project agent memory for NarraCat writing agents is an operating preference layer, not a story continuity layer.

`chapter-writer` may retain and read only these long-lived memory categories:

- Stable user writing preferences explicitly stated by the user.
- Stable project voice or style anchors that are abstracted away from a single chapter and do not contradict WritingContextPack or project files.
- Recurring accepted review feedback, phrased as a general craft tendency rather than a chapter-specific instruction.
- Stable process guardrails about how to use NarraCat contracts and tools.

`continuity-editor` may retain and read only these long-lived memory categories:

- Stable user review preferences and threshold preferences.
- Recurring accepted issue patterns, phrased as general review attention points.
- Stable process guardrails about ReviewReport, WCP, and NovelMemory boundaries.

`memory-keeper` must not use `.claude/agent-memory` as an input source. It has no `memory: project` setting, and its canonical persisted surface is NovelMemory through MCP tools. Its long-lived rules belong in source-controlled prompts, contracts, schemas, and tests.

The following memory categories are not allowed as long-lived project agent memory for writing agents:

- Chapter-specific plot facts, old chapter plans, future outline facts, or continuity facts.
- One-off instructions tied to a chapter number, scene number, dogfood run, failed draft, or temporary experiment.
- Raw prose excerpts, review passages, WCP JSON, or other large artifacts.
- Technique recipes that only made sense for a specific chapter unless they were promoted into a stable style anchor.

Chapter-level learning is transient by default. It should live in WCP, ChapterMetadata, ReviewReport, NovelMemory, logs, or explicit dogfood reports. It may be promoted into project agent memory only when it is accepted as a stable user/project preference and rewritten without chapter-specific identifiers.

## Promotion And Cleanup Rules

New or existing writing-agent memory entries should be classified before use:

- `stable-style`: durable project voice, style, or craft tendency.
- `user-preference`: user-stated preference that should apply across future chapters.
- `review-pattern`: recurring accepted review signal, written as a general attention point.
- `process-guard`: durable process/tooling rule.
- `chapter-transient`: chapter-specific or run-specific note; not loaded for future chapters.
- `stale`: obsolete, contradicted, or unclassified old memory; not loaded until manually promoted.

If an entry cannot be confidently classified as one of the allowed long-lived categories, treat it as `stale` or `chapter-transient`.

Existing `.claude/agent-memory` files created before this policy are legacy input. Implementation work must either quarantine unclassified entries or surface an audit report before letting them influence new writing runs.

## Diagnostics

Before using an existing Novel project for writing-quality dogfood, run:

```bash
bun --no-cache run audit:agent-memory -- <novel-project-root>
```

The report lists allowed memory sources and blocked/quarantined sources. Allowed entries may influence future writing only as stable preference, style, review-pattern, or process guidance. Blocked entries must not influence a writing run until manually promoted, rewritten without chapter-specific scope, or removed. For CI-style checks, append `--fail-on-blocked`.

## Consequences

Writing agents lose some opportunistic reuse of old chapter lessons, but writing runs become easier to reason about. The current chapter should be driven by WCP and project files, not hidden notes from an earlier run.

Future implementation work can enforce this policy by adding prompt rules, a memory audit/cleanup tool, or a scoped loading convention. It must not ask `memory-keeper` to manage `.claude/agent-memory`; that remains outside NovelMemory.

This decision does not change NovelMemory. Story facts, character state, relationship changes, foreshadowing lifecycle, chapter summaries, and style-reference data remain in NovelMemory or source-controlled project files.
