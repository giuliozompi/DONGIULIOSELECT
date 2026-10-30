---
name: Timeweb release safety
description: Keep release compatibility checks distinct from development migrations.
---

Keep Timeweb release checks fail-closed and read-only, separate from the
development duplicate preflight that allows a fresh database.

**Why:** A zero-duplicate result or a same-named index does not establish that a
schema-dependent server can run safely. The user explicitly requires checking the
confirmed Timeweb connection without automatic migration, cleanup or deploy DDL.

**How to apply:** Maintain explicit prerequisites with each schema-dependent
release. Check index validity and actual columns, not just index names. Stop when
connection or compatibility cannot be established; request separate approval for
database changes. Helper-script guards cannot protect direct GitHub edits or
arbitrary Git pushes, so do not describe them as repository-wide enforcement.

## Separate releases from unfinished editorial development

When a release must not change the production database, inspect all changes
between GitHub's current deployment branch and local development, not only the
requested feature or the existing wishlist preflight.

**Why:** A Telegram-only release shared local history with editorial features
whose required tables were absent from Timeweb. Passing the wishlist check did
not establish compatibility of the full development branch.

**How to apply:** With approval for a limited release, base an isolated release
on the actual GitHub deployment branch and include only approved changes.
Validate that version, push without force, verify the remote commit, and
reconcile its history into local development without publishing the remaining
development changes. Preserve unfinished editorial work.
