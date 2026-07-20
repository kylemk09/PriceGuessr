# Project instructions

## Git workflow (standing rule)

Any code change made in this project should be automatically committed and
pushed to GitHub (`origin main`) — no need to ask for confirmation first.
This overrides the default "ask before pushing" behavior for this project
only.

- Commit with a clear, concise message describing the change (as usual).
- Push to `origin main` right after committing.
- Still exercise normal git safety: never force-push, never skip hooks,
  never commit secrets/credentials, and use judgment about what's safe to
  commit (e.g. don't commit obviously broken/incomplete work if a smaller
  checkpoint would do).
- This rule covers regular commit + push only. Destructive or irreversible
  git operations (force-push, reset --hard, rewriting published history)
  still require explicit confirmation each time, standing rule or not.
