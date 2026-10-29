# Editorial AI workspace — development only

## Operator workflow

Open **Admin → Сыры** (`/web/admin/cheeses`).

### Candidate catalogue

1. Open **Каталог сыров по странам**.
2. Choose up to three countries and 1–30 suggested cheeses (default 12).
3. Explicitly generate a list, or reopen a previous list from history.
4. Search and filter by country; Italy and France also have multi-select region filters.
   Countries are grouped and items sorted by descending editorial importance.
   Multi-region origins remain arrays. Unknown regions stay unknown.
5. Adjust the importance score and save it. The original model score remains visible.
6. Select up to ten items and create separate drafts.

Importance is a subjective, editable editorial priority, not a quality or sales ranking.
All suggestions, names and origins require human verification. Import does not copy the
suggested summary as verified article text. It creates draft identity/origin records only.

Imports are serialized with editorial writes. Known duplicate names in the same origin
country and previous imports are skipped, including concurrent/repeated requests.
Original/Russian names and import provenance help match subsequent lists. This is not
universal semantic/synonym matching: operators still check aliases and identity.
Duplicate links open the existing article editor.

### Source-based article proposal

1. Save the cheese article first. Use **Подготовить с ИИ** on that saved article.
2. Supply 1–3 public HTTPS source pages. Prefer consortia, official specifications
   available as HTML, and producers.
3. Generate explicitly. This does not run a general internet search.
4. Review warnings, proposed fields, the original fields and cited passages.
5. Edit proposed text if needed, select fields and confirm **Применить выбранные поля**.

The model receives only the cheese name, traditional country/region and retrieved source
passages. It does not receive customers, orders, catalogue records or private draft prose.
The existing shop chat is unchanged. The provider is the existing OpenRouter connection;
the default model is `openai/gpt-4o-mini` (`EDITORIAL_AI_MODEL` can override it).

Sources are read with DNS/IP validation, pinned DNS answers, HTTPS-only redirects,
15-second retrieval deadlines, a 1 MiB HTML/text limit and 20,000 extracted characters
per source. No cookies or customer authorization headers are forwarded.
PDFs, login pages, blocked sites, oversized pages and client-only content are not
supported in this first version; choose a readable public HTML/text page instead.

The provider references server-numbered passages; the server extracts actual quoted
text. This verifies provenance, **not factual entailment or scientific/legal accuracy**.
Unsupported/empty/uncited fields are explicitly omitted with warnings. Invalid passage
references, malformed output and provider/source failures do not overwrite articles or
produce generic fallback copy. An empty supported proposal cannot be applied.

Application:
- updates only selected, supported fields plus their source references;
- records explicit operator edits and keeps the AI proposal separately;
- rejects stale article revisions and applies a proposal at most once;
- keeps photos, coordinates, catalogue links, videos and manufacturing country untouched;
- returns the edited record to draft;
- never changes a published snapshot or publishes automatically.

Traditional origin never establishes an actual catalogue product's manufacturing
country, certification, DOP/IGP status, marking, ingredients, allergens or health claims.
Operators must verify these separately.

## Operational safety

- One active generation across operators, enforced in PostgreSQL.
- Durable request IDs deduplicate replays, including after lost responses.
- Provider SDK retries are disabled; generation must be explicitly requested again.
- A two-minute lease releases interrupted workers; polling exposes interruption.
- Source retrieval/model work never holds the editorial database transaction lock.
- Generation, errors, ranking, imports and application are audited.
- Audit failures roll back content changes.
- History is admin-only and draft history is filtered by article before pagination.
- The admin UI guards rapid repeated clicks and preserves edited proposals on conflict.

## Database and release

`migrations/editorial-ai.sql` adds `editorial_ai_runs` and `editorial_ai_imports`.
It was applied only to development after verifying it was distinct from Timeweb.
There is no build/startup/post-merge execution of this migration.

No GitHub push, Timeweb migration, production content or production deployment is
authorized by this implementation. Each requires separate approval.

## Verification

- `npm run test:editorial`: existing 20 editorial tests plus 12 AI tests.
- AI tests use isolated temporary PostgreSQL and injected deterministic model/source
  dependencies, not the real provider.
- The actual admin flow was separately tested in Chromium using a disposable
  development operator and real OpenRouter catalogue/source generations. This covered
  imports, ranking, repeated imports, deep links, editable source proposals, selective
  application, mobile fit and absence of browser runtime exceptions.
- Live source: the official consortium's publicly readable history page.
- Temporary accounts, entries, import provenance, runs and audit rows were removed.
- `npm run build` passes. Global TypeScript checking still reports existing unrelated
  project errors; no diagnostics were found in the new/changed editorial modules.

Live UI test is opt-in and must never target production:

```sh
EDITORIAL_AI_UI_FIXTURE=/tmp/disposable-development-admin.json \
ALLOW_EDITORIAL_LIVE_AI=1 node tests/editorial-ai-ui.test.mjs
```

The fixture contains a temporary development account, and a readable source URL must
be prepared in `/tmp/editorial-ai-source-url.txt`. This test makes real provider
requests; it is not enabled in regular CI. Generated proposal/list history can be
reused during UI debugging instead of generating again.
