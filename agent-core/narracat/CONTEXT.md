# NarraCat

NarraCat is a long-form fiction writing context for AI-assisted Chinese novel creation. This glossary names project-specific concepts used when discussing prompt, agent, memory, and review behavior.

## Language

**有效写作优化**:
An optimization that improves chapter draft reading desire and long-form continuity: clear emotional stakes, concrete scene pressure, consequential character action, stable narrator voice, and momentum into the next chapter.
_Avoid_: prompt shorter, less AI-like, cleaner wording

**生成能力**:
The chapter-writer's ability to produce a strong first draft from the current chapter context, before review or rewrite loops intervene.
_Avoid_: review accuracy, post-hoc cleanup, polish pass

**创作优先级栈**:
The ordered set of concerns the chapter-writer should privilege while drafting: chapter anchor, scene pressure and outcome, character desire and risk, then narrator voice. The writer produces prose only — no metadata duty competes for its attention.
_Avoid_: rule list, quality checklist, metadata completeness

**编辑动作库**:
Reusable revision moves for already-written prose, such as removing redundancy, varying rhythm, making abstractions concrete, and tightening transitions. It is review-side or rewrite-side guidance, not generation-side fuel.
_Avoid_: anti-AI prompt, generation rules, slop blacklist

**核心创作原则**:
The small set of generation-side fiction principles that steer first-draft prose before detailed techniques are consulted. These principles act as the direction controls for chapter drafting, while long craft material remains reference material.
_Avoid_: writing encyclopedia, full craft manual, exhaustive technique list

**可写场景材料**:
Concrete dramatic material sufficient for chapter drafting: a specific pressure moment, a character choice, an action, and a consequence or cost. This is the real target of the chapter-writer's "unwritable outline" stop condition.
_Avoid_: field compliance, outline completeness, abstract stakes

**任务 Envelope**:
The short command-to-agent dispatch payload for a specific run: target chapter, output path, context pack, and parameters. It should not restate the agent's internal workflow or craft rules.
_Avoid_: second system prompt, duplicated agent prompt, rule replay

**字段消费方式**:
How an agent uses existing schema fields to make creative or review decisions. It is prompt behavior over stable data contracts, not a change to the schema itself.
_Avoid_: schema redesign, field reduction, data contract change

**第一稿阅读吸引力**:
The chapter-writer's highest drafting goal: prose that is immediately readable, scene-driven, emotionally charged, and pulls the reader into the next chapter before review or rewrite loops intervene.
_Avoid_: rule compliance, field execution, technically correct draft

**找戏并放大**:
The chapter-writer's drafting start: identify the most dramatically alive moment in the chapter context and make it the writing anchor, expanding its pressure, action, cost, and emotional consequence.
_Avoid_: field rejection, anchor form filling, outline audit

**事件骨架**:
The planned sequence of story facts, pressure points, and outcomes that must remain true across the chapter. It constrains what happens, not the prose's opening move, pacing, or emphasis.
_Avoid_: scene-by-scene transcript, shot list, fixed prose order

**本章叙述姿态**:
The chapter-specific narrator stance that the context builder renders into one natural-language style instruction inside the WritingContextPack, derived from the bible's narrator voice and the project's style profile. The writer consumes it without branching; it tells how the prose should move and perceive.
_Avoid_: style checklist, dimension compliance, writer-side style lookup

**可继续写的戏**:
Memory content that preserves concrete actions, costs, unresolved pressure, and relationship tension so the next chapter can pick up dramatic momentum instead of only facts.
_Avoid_: fact compression, template summary, label-only memory

**受大纲约束的小说写手**:
The intended chapter-writer posture: a fiction writer who preserves the outline's core facts and continuity while making independent prose, pacing, scene-emphasis, and voice decisions for readability.
_Avoid_: field executor, outline auditor, compliance writer

**引用迁移**:
Updating every prompt, doc, and contract reference when a Skill section structure changes, instead of preserving old section numbers only for compatibility.
_Avoid_: compatibility skeleton, stale section number, dead reference

**生成动作**:
The drafting moves that directly create first-draft reading attraction, such as finding drama, opening with pressure, advancing scenes, giving characters active speech, shaping narrator stance, loading details with story work, and ending with pull.
_Avoid_: craft taxonomy, technique category, writing lecture

**权威记忆**:
Content stored in NovelMemory, which every downstream agent treats as established truth about the story. It should therefore carry only user-confirmed settings and observed chapter facts — never an agent's gap-filling inference of a field the user left blank, since a fabricated value silently becomes canon and can steer later character or plot decisions.
_Avoid_: best-guess fill, inferred-as-fact, coverage padding

**引导式采集**:
An interactive intake mode where the user first dumps their idea freely, then is asked one question at a time — each question driven by the previous answer and accompanied by the asker's own recommendation — converging on cards confirmed one by one. Only the main session can run it; setup uses it for project founding. World creation instead synthesizes in batch, with completeness checked at synthesis time.
_Avoid_: fixed question count, dimension-by-dimension script, subagent-driven dialogue

**立项卡**:
The structured cards produced when the setup conversation converges: genre reader contract, core hook, golden-finger engine, protagonist desire-cost card, antagonistic force, central dramatic question, world-rule conflict potential, narrator voice, and a canon/tentative/blank declaration. Each card is confirmed with the user and written into bible/premise.md, becoming the source the outline planner consumes.
_Avoid_: free-form premise essay, questionnaire transcript, outline draft

**世界观策展人**:
The component that synthesizes confirmed creative intent into an internally consistent bible (character / world / relationship) and detects conflicts against established canon. It does not talk to the user directly — collection is the main session's job; the curator is invoked once, after collection, to synthesize and conflict-check, possibly for several objects in one call. It is the bearer of NovelMemory-facing conflict detection.
_Avoid_: interactive questioner, one-shot creator from raw args, user-facing dialogue

**设定冲突**:
A world-curator judgment that a new or modified setting contradicts established canon. It carries a severity: blocking conflicts must return to the user confirmation gate; non-blocking ones may be surfaced and then auto-merged or ignored.
_Avoid_: free-text warning, unstructured diff note, severity-less flag

**arc**:
The mid-scale narrative unit between volume and chapter: a 10-to-40-chapter web-novel arc, sized by book tier. Each arc carries a core question, an irreversible change, a seed for the next arc, and a payoff-beat plan. Arcs are the planning granularity, the memory-consolidation boundary, and the batch unit for detailed chapter outlines.
_Avoid_: fixed-length unit, three-act act, chapter cluster without a question

**记忆分层**:
The tiered memory backbone behind chapter context. L0 is the full corpus and structured facts, queried on demand and never injected wholesale; L1 is the hot layer of recent chapter briefs and anchors; L2 is the warm layer of arc and volume summaries produced at boundaries. The context builder draws from all three under a hard token budget.
_Avoid_: full-history injection, single flat summary, retrieval-only memory

**双层审校**:
The minimal review chain on the main writing loop: an L0 mechanical code layer (artifact existence, word count, format anchors) plus an L1 minimal agent reporting only objective errors — continuity contradiction, setting violation, unfulfilled anchor, foreshadowing contract, physical impossibility. The verdict is computed by code from blockers. Style, pacing, and voice are structurally outside review and never flow back into the draft loop.
_Avoid_: style rubric, quality scoring, revise-until-polished loop

**提交工具**:
The single MCP write entry an agent holds for its own product — review submission for the editor, outline submission for the architect, chapter commit and fact extraction for the memory keeper. The tool validates with ajv, writes atomically, renders any user-visible markdown mechanically, and returns field-level errors with hints for self-correction.
_Avoid_: shared write permission, direct edit of derived artifacts, free-form database write

**受控谓词**:
The closed predicate vocabulary for fact storage (identity, location, possession, goal, injury, ability, status, secret, reputation, oath, debt, relationship), validated at the tool entrance, with character aliases normalized to canonical names. An x- prefix admits free extension at the cost of a warning.
_Avoid_: free-text predicate, ontology engine, full knowledge-graph engine

**多采样并集抽取**:
A recall mechanism for the write loop's per-chapter fact extraction. The weak extraction model's single pass is variance-dominated — it randomly misses different facts each run — so the same chapter is extracted several times independently and the results are unioned, letting facts any single pass would have dropped still reach memory. Coverage is the goal; near-duplicate facts from overlapping passes are kept and absorbed by downstream card-folding and retrieval ranking rather than risk-merged, since wrongly merging two distinct facts about one character silently loses one.
_Avoid_: better single prompt, majority voting that drops rare facts, embedding-threshold dedup, retrieval-time patch

**情绪承载温度**:
Within the show-not-tell rule, the temperature axis along which emotion is carried into prose. Cold carry conveys feeling through restraint — slowing time, micro-gestures, withheld or deflected speech, silence. Hot carry conveys it through eruption — an outburst, a loss of control, a reckless act. Both obey the same rule: intensity is measured by the action, cost, or irreversible choice the emotion forces, not by naming it. They differ only in temperature, not in whether emotion is shown.
_Avoid_: telling emotion, naming the feeling, louder adjectives, restraint as the only carry mode

**单一温度坍缩**:
The failure mode where restraint is treated as a cross-archetype default and the highest emotional aesthetic, collapsing every narrator archetype into one cold temperature and removing its ability to erupt when a scene peaks. The intended state keeps the full cold-hot range available within each archetype, with temperature chosen by scene tension and climax position rather than fixed by archetype or by a global restraint aesthetic.
_Avoid_: restraint as default, single-temperature voice, one-directional heat gate, genre as a temperature excuse

**运行时 prompt**:
The prompt bodies injected into a writing agent's context at execution time — agents, skills (SKILL.md and consulted references/), and commands. They should read as present-tense execution instructions for the current task. They are distinct from the maintainer layer (CLAUDE.md, docs/adr, docs/contracts, CHANGELOG, schemas), which records architecture and decision history and is not consumed by the writing agents.
_Avoid_: decision log, architecture map, changelog, second copy of the maintainer docs

**开发出处标记**:
A token in a runtime prompt that records the project's own development trail rather than instructing the writing agent — an issue number, an ADR id, a prompt or schema version stamp, or an internal milestone label. It documents when and why a rule was added during development. Such markers belong in the maintainer layer, not in runtime prompts, which should state only the current rule. Removing them includes rewriting the historical narration they anchor ("this used to be X, after ADR-N it became Y") into the present-tense rule, without changing any decision, threshold, or routing.
_Avoid_: functional cross-reference code (§ section pointer, MCP tool name, enum value), user-project degradation handling, maintainer-doc rationale citation
