# 老项目（v3 → v4）兼容指南

> 适用范围：ADR-0003 时代（NarraCat ≤ 2.4.x）创建的小说项目，迁移到 ADR-0004（NarraCat ≥ 2.5.0）后的行为说明。
>
> 来源：Epic #21 S8 阶段产出。

---

## 1. v3 项目能否直接跑 2.5.0？

**简短答：** 可以读 + 部分跑，但有降级路径。**强烈推荐**手工补全新字段后再继续写新章。

| 操作 | v3 项目在 2.5.0 下的行为 |
|---|---|
| `/narracat:write` 老章节（已存在 ch-NNN.md） | ✅ 可读，chapter-writer 阶段零走降级路径（无 scenes 时用章对象内信息合成锚点） |
| `/narracat:review` 老章节 | ✅ 可跑，3 项新辅助检查（场景兑现/人物动线/伏笔密度）输出 N/A |
| `/narracat:plan` 阶段二（补新章节大纲） | ❌ 会失败——chapter required 9 字段，v3 章对象缺 dramatic_focus / dramatic_tempo / characters_in_chapter / scenes |
| `/narracat:plan` 阶段一（重新规划全书） | ⚠️ 会触发：master 缺 5 字段引擎 / 卷缺 units[]，需要补全 |

---

## 2. v3 → v4 schema 兼容性矩阵

`schemas/outline-structure.json` 的 oneOf 兼容设计：

| 字段 | v3 形式 | v4 形式 | 2.5.0 行为 |
|---|---|---|---|
| `chapters[].foreshadowing_actions.items` | `{subject, action}` | `{foreshadowing_id, action}` | **oneOf 接受两种**——v3 数据不报错 |
| `volumes[].payoff_milestones.items` | `integer`（章号） | `{chapter, foreshadowing_id, type, description}` | **oneOf 接受两种**——v3 数据不报错 |
| `chapters[].summary` | 必填 | 弃用但 properties 保留 | v3 字段照常存在，schema 不再 required |
| `chapters[].key_events` | optional | 弃用 | 同上 |
| `chapters[].characters_involved` | optional | 弃用 | 同上 |
| `chapters[].tension_level` | optional | 弃用 | 同上 |
| `master_outline.required` | 6 字段 | 9 字段（+ 3 引擎必填） | **v3 数据会 fail**，需补全 |
| `chapters[].required` | 5 字段 | 9 字段（+ 4 新必填） | **v3 数据会 fail**，需补全 |
| `volumes[].units[]` | 不存在 | phase=1 时必填，每卷 ≥2 单元 | **v3 phase=1 会 fail**，需补全 |

---

## 3. 推荐迁移路径

### 路径 A：保留老章节，新增章节按 v4 规范

1. 跑 `/narracat:write` 完成老章节剩余写作（走降级路径）—— 完成全部历史章节后再迁移
2. 手工补全 `outline/master-outline.md`：
   - 加「全书引擎」节：补 `central_dramatic_question` / `protagonist_core_desire` / `antagonistic_force` 3 个必填字段
   - 加「全书伏笔系统」节：注册 ≥5 条伏笔（major≥1 + medium≥2 + small≥2）
3. 手工补全 `outline/vol-VV/vol-outline.md`：每卷加「单元列表」节（≥2 单元）
4. 跑 `/narracat:plan {修改指令}` 强制 outline-architect 按新 schema 重新产出阶段一
5. 之后 `/narracat:plan` 阶段二派发会按单元执行，新章节符合 v4 格式

### 路径 B：从头重新规划（推荐用于早期项目）

1. 备份 `manuscript/` 与 `outline/`
2. 跑 `/narracat:plan {完整创意}` 重新规划全书（直接产出 v4 格式）
3. 用旧 manuscript 作为参考材料喂给 chapter-writer

### 路径 C：编写 migration 脚本（HITL 决策）

`scripts/migrate-outline-v3-to-v4.ts`（暂未实现，issue #29 留作 HITL 决策项）。如果有需要可单独提 issue 实现。

---

## 4. 已知降级路径行为

### 4.1 chapter-writer 阶段零（write 章节时）

ADR-0004 S6 设计的"3+2 锚点"在 v3 项目下行为：

- WritingContextPack 的 `current_unit` 为 `null`（v3 项目无 unit_meta 入库）→ chapter-writer 标记『脱离单元上下文』
- WritingContextPack 的 `chapter_scenes` / `chapter_characters` 为 `null`（v3 项目无 scenes 字段）→ chapter-writer 阶段一自行从老 chapter_outline 解析（按 v3 字段 summary/key_events 合成场景）
- 锚点合成走简化路径：core_experience 仅基于 emotional_stakes + dramatic_tempo（如 v3 章对象 dramatic_tempo 也缺，则只用 emotional_stakes）；heartbeat_moment 退化为段落级描述（不映射 scene_number）；rhythm_curve 用泛化曲线（如 "缓-缓-急-释放"）

### 4.2 continuity-editor 模式二（review 章节时）

ADR-0004 S7 设计的"3 项新辅助检查"在 v3 项目下行为：

- **场景兑现度**：chapter_outline 无 scenes 字段 → 跳过，输出 `N/A（v3 数据）`
- **人物动线兑现度**：chapter_outline 无 characters_in_chapter → 跳过，输出 `N/A`
- **伏笔密度**：novel_foreshadowing_density 返回 expected=0（v3 项目无 actions_log 数据）→ 跳过，输出 `N/A`
- N/A 不参与最终判定聚合，老章节审修不会因新规则莫名 FAIL

### 4.3 memory-keeper（入库时）

模式一新增的第 9 项「伏笔动作日志」在 v3 数据下：

- chapter.foreshadowing_actions 为 `{subject, action}` 形式（v3）→ **跳过 novel_log_foreshadowing_action 调用**（避免脏数据污染 density 量化）
- 仅 `{foreshadowing_id, action}` 形式触发 log 入库

---

## 5. 老项目审核清单

跑下面的 grep 检查项目是否需要迁移：

```bash
# 检查 master-outline.md 是否有全书引擎节
grep -L "央戏剧问题\|central_dramatic_question" outline/master-outline.md

# 检查 vol-outline.md 是否有单元列表节
for f in outline/vol-*/vol-outline.md; do
  if ! grep -q "单元列表\|^| 单元 ID" "$f"; then
    echo "缺单元列表：$f"
  fi
done

# 检查 ch-NNN.md 是否有戏剧焦点 / 张力走向 / 核心角色动线 / 场景列表节
for f in outline/vol-*/ch-*.md; do
  for section in "戏剧焦点" "张力走向" "核心角色动线" "场景列表"; do
    if ! grep -q "$section" "$f"; then
      echo "缺『$section』：$f"
    fi
  done
done
```

输出非空 → 需要手工迁移。
