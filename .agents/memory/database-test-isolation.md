---
name: Database test isolation
description: Avoid inherited hosted-database settings when running a disposable local PostgreSQL test cluster.
---

Set the temporary cluster's role explicitly at initialization and specify its socket,
port, database and role explicitly in every test connection.

**Why:** This workspace can supply PostgreSQL connection defaults through the
environment. Relying on the shell's user or node-postgres defaults caused a local
test connection to request a role that did not exist in the newly initialized cluster.
Connection defaults must not accidentally direct tests toward a configured database.

**How to apply:** Database concurrency tests should initialize their own disposable
cluster, connect only to that cluster and clean it up. Never reuse the app connection
string for synthetic customer writes.
