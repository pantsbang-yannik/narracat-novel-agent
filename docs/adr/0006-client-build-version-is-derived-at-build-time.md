# ADR 0006: Client Build Version Is Derived At Build Time

## Status

Accepted

## Context

The previous OPS rule required `package.json.version` to equal `0.1.<git commit count>`. That is self-referential because changing `package.json` creates a new commit, which changes the commit count and immediately makes the committed version stale.

## Decision

The user-facing client build version remains `0.1.<release commit count>`, but it is derived by the build / release path from the current release commit instead of being hand-maintained in `package.json.version`. `package.json.version` is treated as the package manifest or product-line base version, while About, RC artifact naming, and release verification use the derived client build version.

## Consequences

OPS checks should verify that the version resolver exists and produces the current commit-derived client build version, not that `package.json.version` equals the current commit count. This avoids version drift across normal commits, merge commits, rebases, and release-prep fixes.
