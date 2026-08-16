# Epic #21（ADR-0004）端到端验证指南

> 适用范围：Epic #21（S1-S7 已合并）完成后，在真实小说项目中跑通完整 /plan + /write + /review 闭环，确认所有新结构生效。
>
> 来源：Epic #21 S8 阶段产出。本会话已完成 schema 校验 + CLAUDE.md 同步 + legacy-migration.md；本指南把 E2E 实跑步骤交付用户。

## 0. 准备

```bash
# 一次性
cd ~/some-test-novel-project   # 任何新目录或专用测试目录
git init && nvm use 18

# Claude Code 内确保启用 narracat plugin
# /plugin install narracat（如未安装）
```

---

## 1. 新项目从零跑（PoC）

目标：验证 S1-S7 全部新结构在真实 LLM 调用中生效。

### 1.1 init → setup → world

```
/narracat:init
```

填写预估章数（建议 20 章 / 2 卷，便于快速验证）。

```
/narracat:setup
```

回答 premise 引导问题。

```
/narracat:world 主角A是XX背景；主角B是XX背景
```

**检查 1**：`bible/characters/*.md` 是否生成 + `bible/world/*.md` 是否生成。

### 1.2 plan 阶段一

```
/narracat:plan 复仇与救赎的故事，主角A追查父亲被陷害的真相
```

**检查 2（acceptance #29 § 关键验证）**：

```bash
# A. master-outline.md 含全书引擎节
grep -A 5 "全书引擎" outline/master-outline.md
# 期望: 看到中心戏剧问题 / 主角核心欲望 / 对抗力量 3 行

# B. master-outline.md 含全书伏笔系统节，≥5 条
grep -A 10 "全书伏笔系统" outline/master-outline.md
# 期望: 表格至少 5 行，含 major + medium + small 三种级别

# C. vol-outline.md 含单元列表节，每卷 ≥2 单元
for f in outline/vol-*/vol-outline.md; do
  echo "==== $f ===="
  grep -A 5 "单元列表" "$f"
done
# 期望: 每卷至少 2 个 V01-U01 / V01-U02 行

# D. memory-keeper 入库后查 DB
cd mcp-server
node -e "
const Database = require('better-sqlite3');
const db = new Database('../.narracat/memory.db');
console.log('foreshadowing_registry:', db.prepare('SELECT COUNT(*) c FROM foreshadowing_registry').get());
console.log('全书 facts:', db.prepare(\"SELECT predicate, object FROM facts WHERE subject='全书'\").all());
console.log('unit_meta facts:', db.prepare(\"SELECT subject FROM facts WHERE predicate='unit_meta'\").all());
"
# 期望:
# - foreshadowing_registry 至少 5 行
# - facts WHERE subject='全书' 至少 3 行（中心戏剧问题 / 主角核心欲望 / 对抗力量）
# - facts WHERE predicate='unit_meta' 数量 = 全书单元数（每卷 ≥2，全书至少 ≥4）
```

### 1.3 plan 阶段二

```
/narracat:plan
```

**检查 3**：

- AskUserQuestion 应该提示**单元选项**：「下 2 单元 / 下 4 单元 / 当前卷剩余 / 取消」（**不是**章号选项）
- 选「下 2 单元」（或类似）
- 派发应展示**本单元元信息**（unit_id / core_question 等）

派发完成后：

```bash
# A. ch-NNN.md 按 v4 模板生成
cat outline/vol-01/ch-001.md
# 期望节：视角角色 / 价值转换 / 情感赌注 / 戏剧焦点 / 张力走向 / 核心角色动线 / 场景列表（每章 2-5 个）

# B. foreshadowing_actions_log 有数据
node -e "
const Database = require('better-sqlite3');
const db = new Database('../.narracat/memory.db');
console.log('actions_log:', db.prepare('SELECT COUNT(*) c, COUNT(DISTINCT chapter) chapters FROM foreshadowing_actions_log').get());
"
# 期望: c > 0，chapters > 0
```

### 1.4 write 章节

```
/narracat:write 1
```

**检查 4（关键）**：

- chapter-writer 响应顶部应该有 `# 本章锚点` 段
- 锚点 3 字段：
  - `core_experience`: 应该体现 `emotional_stakes + current_unit.core_question + dramatic_tempo` 三者综合
  - `heartbeat_moment`: **必须含 scene_number 引用**（如「场景 2 中的 XX 瞬间」）
  - `rhythm_curve`: 应该按 scenes 顺序描述
- 如 outline 的 dramatic_focus 或 scene.pressure_point 抽象 → chapter-writer 触发拒写报告

### 1.5 review 章节

```
/narracat:review 1
```

**检查 5**：

- 审修报告应有 **9 维度**（2 主 + 7 辅助）
- 辅助检查含 3 项新维度：
  - 场景兑现度（✅/⚠️/❌，**不应该是 N/A**——因为是新项目）
  - 人物动线兑现度
  - 伏笔密度（显示「计划 N 条·兑现 M 条（来自 MCP）」，ADR-0010 计划兑现度语义）

---

## 2. 老项目（v3）降级验证

目标：验证 Epic #21 不破坏 ADR-0003 时代项目。

### 2.1 准备 v3 项目

找一个 NarraCat ≤ 2.4.1 时代创建的项目（或参照 docs/legacy-migration.md §5 跑审核 grep 检查项目）。

### 2.2 跑 review

```
/narracat:review {章号}
```

**检查 6（降级路径）**：

- 审修报告应正常产出
- 3 项新辅助检查应输出 `N/A（v3 数据）`，不报错
- 整体判定不会因新规则莫名 FAIL

### 2.3 跑 write

```
/narracat:write {章号}
```

**检查 7（降级路径）**：

- chapter-writer 阶段零标记『脱离单元上下文』警告
- 锚点合成走简化路径（详见 docs/legacy-migration.md §4.1）
- 不应该崩

---

## 3. 速度回归

对比 ADR-0003 阶段 1 落地版（如有保留分支）与 2.5.0：跑 `/narracat:write` 同一章，记录总时长。±10% 内可接受。

---

## 4. 反馈渠道

发现问题：

- 在对应 issue 评论（#22 #23 #24 #25 #26 #27 #28 任一）
- 或开新 issue 引用 Epic #21
- 或直接在 #29（本 issue）评论

---

## 5. 结果汇报模板（粘贴到 #29 评论）

```markdown
## E2E 验证结果

**新项目从零跑**:
- 阶段一全书引擎节: ✅/❌
- 阶段一 foreshadowing_system ≥5 条按级别分布: ✅/❌
- 阶段一 units[] ≥2 单元/卷: ✅/❌
- DB 入库（foreshadowing_registry / 全书 facts / unit_meta）: ✅/❌
- 阶段二 batch 询问展示单元选项: ✅/❌
- 阶段二 ch-NNN.md v4 模板: ✅/❌
- 阶段二 actions_log 有数据: ✅/❌
- chapter-writer 阶段零 3+2 锚点 + scene_number 引用: ✅/❌
- continuity-editor 7 辅助维度: ✅/❌
- 伏笔密度来自 MCP: ✅/❌

**老项目（v3）降级**:
- review 输出 N/A 不报错: ✅/❌
- write 降级路径不崩: ✅/❌

**速度回归**:
- /write 总时长对比 ADR-0003 版: 持平 / +X% / -X%

**发现的问题**:
- （如有）
```
