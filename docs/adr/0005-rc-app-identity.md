# ADR 0005: RC App Identity

## Status

Accepted

## Context

The repository and historical docs use NarraCat-app and NarraCast Desktop, but the first macOS arm64 RC needs a stable installable application identity before packaging because later changes can affect user data paths, Keychain expectations, artifact names, and upgrade behavior.

## Decision

The RC app identity is `NarraCat`: `productName` is `NarraCat`, `appId` is `app.narracat.desktop`, and macOS arm64 artifacts use `NarraCat-${version}-mac-arm64` naming.

## Consequences

NarraCat-app remains the repository/project name, NarraCast Desktop remains a historical alias, and packaged app work should use NarraCat as the user-facing identity.
