# ADR 0011: Deterministic WritingContextPack Builder

## Status

Accepted

## Context

`/narracat:write` previously described WritingContextPack assembly as "main session pure code", but the command still relied on prompt-following to read Markdown, probe paths, normalize NovelMemory results, and shape the JSON passed to chapter-writer. Dogfood chapters showed this drift in practice: `active_characters` and `active_foreshadowing` leaked raw NovelMemory object shapes, while reviewer prompts still passed because the contract boundary was not enforced.

## Decision

NarraCat Agent Core owns a deterministic `novel_build_writing_context_pack` MCP read tool for chapter writing inputs. Write/rewrite/review flows must consume this builder output instead of asking the orchestration LLM to assemble the pack from raw `novel_writing_context`, ad hoc `Read` calls, and prompt-side Markdown parsing.

The old `novel_writing_context` tool remains available for compatibility and diagnostic reads, but it is not the canonical input boundary for chapter prose generation. Creative guidance can soft-degrade with warnings; contract shape errors fail before chapter-writer is dispatched.

## Consequences

WritingContextPack evolution now requires code, tests, and command prompt updates together. This reduces prompt drift and makes "raw memory result accidentally became writer input" a regression-testable failure instead of a writing-quality mystery.
