# Foreshadowing Lifecycle Audit

This audit checks NovelMemory for historical foreshadowing lifecycle pollution: the same foreshadowing id being planted or registered in more than one chapter.

Run it after changing write/rewrite/memory-keeper foreshadowing behavior, after dogfood rewrites that touched older chapters, or before accepting a writing-quality fix that depends on clean `active_foreshadowing`.

```bash
bun --no-cache run audit:foreshadowing -- /path/to/novel-project
```

Focused check for known ids:

```bash
bun --no-cache run audit:foreshadowing -- /path/to/novel-project --id F-CELLAR --id F-SCAR
```

`--id` accepts an exact id or a prefix, so `F-CELLAR` also matches ids such as `F-CELLAR-01`.

The command is read-only. It reports:

- `duplicate_planted_fact`: multiple `facts(predicate="伏笔状态")` plant records for one id.
- `duplicate_plant_action`: multiple `foreshadowing_actions_log(action="plant")` chapters for one id.
- `registry_planted_chapter_conflict`: `foreshadowing_registry.planted_chapter` no longer matches the earliest historical plant.

Manual repair policy:

- Keep the earliest real plant/register chapter as the source of truth.
- Later chapter touches should be rewritten as `develop` or `reveal` only after checking the manuscript and chapter metadata.
- If the later row cannot be interpreted safely, do not auto-convert it; ignore or remove the later plant row during a targeted manual DB repair and leave an issue comment with the affected id and chapters.
- Re-run the audit after repair. A clean report should show zero findings for the repaired ids.

Automatic repair is intentionally not enabled. The database can reveal duplicate lifecycle rows, but it cannot reliably infer whether a later mention was a weak develop, a real reveal, or a failed draft artifact without reading the manuscript.
