# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

Repo: 本仓库（Agent Core cutover 后 agent-core 随本仓库验收，issue 也开在本仓库；`gh` 在仓库内自动识别）。历史写作重构系列（#182–#188、#225–#227 等）留在上游私有仓，只读引用，不再新增。

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`。多行 body 用 heredoc。
- **Read an issue**: `gh issue view <number> --comments`，用 `jq` 过滤评论并抓取 label。
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`，按需加 `--label` / `--state` 过滤。
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
