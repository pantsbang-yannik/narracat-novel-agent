# ADR 0008: Model Service Verification Uses Non-Sensitive Key Metadata

## Status

Accepted

## Context

Model service verification needs to persist across app restarts, but the app must also invalidate a verified state when the current Provider API Key changes. The API Key itself is stored in the system keychain and must not be copied into app config; storing a hash or other derived value of the Key would still move secret-derived material into a less protected config file.

## Decision

NarraCat-app will bind persisted Model service verification to non-sensitive API Key metadata, such as a per-Provider key version or updated-at timestamp. Saving or deleting a Provider API Key updates that metadata, and any mismatch between the verification record and the current metadata invalidates the verified state.

## Consequences

The app can show a durable "已验证可用" state and the last verification time without persisting the API Key or a hash of it. Verification invalidation becomes conservative: any API Key save or delete requires a new connection test, even if the user saved the same value again.
