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
