import { editorialRequirements } from './editorial-schema-requirements.mjs';

const metadataSql = `
  SELECT r.relname AS name, r.relkind, r.relpersistence, r.relrowsecurity,
    (SELECT jsonb_agg(jsonb_build_object(
      'name', a.attname, 'type', format_type(a.atttypid,a.atttypmod),
      'notNull', a.attnotnull, 'default', pg_get_expr(d.adbin,d.adrelid),
      'identity', a.attidentity, 'generated', a.attgenerated))
      FROM pg_attribute a LEFT JOIN pg_attrdef d
        ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
    (SELECT jsonb_agg(jsonb_build_object(
      'definition', pg_get_constraintdef(c.oid), 'valid', c.convalidated,
      'immediate', NOT c.condeferrable))
      FROM pg_constraint c WHERE c.conrelid=r.oid AND c.contype IN ('c','p','f')) AS constraints,
    (SELECT jsonb_agg(jsonb_build_object(
      'definition', pg_get_indexdef(i.indexrelid), 'unique', i.indisunique,
      'valid', i.indisvalid AND i.indisready AND i.indislive AND i.indimmediate))
      FROM pg_index i WHERE i.indrelid=r.oid) AS indexes
  FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace
  WHERE n.nspname='public' AND r.relname=ANY($1::text[])
`;

// Strip only the object/table names, not expressions, order, included columns,
// predicates, operator classes or NULLS NOT DISTINCT.
const indexShape = definition => definition.replace(
  /^CREATE (UNIQUE )?INDEX .*? ON .*? USING /,
  (_, unique) => `${unique || ''}USING `,
);

export async function checkEditorialSchema(client) {
  // Fixed, source-controlled identifiers only. LIMIT 0 reads no customer rows,
  // checks SELECT permissions, and pins all relations until the caller rolls back.
  await client.query(`SELECT 1 FROM ${editorialRequirements.map(r => `public.${r.table}`).join(', ')} LIMIT 0`);
  const { rows } = await client.query(metadataSql, [editorialRequirements.map(r => r.table)]);
  for (const expected of editorialRequirements) {
    const actual = rows.find(row => row.name === expected.table);
    if (!actual || actual.relkind !== 'r' || actual.relpersistence !== 'p' || actual.relrowsecurity) return false;
    const columns = actual.columns || [];
    // Deliberately conservative: unexpected fields/constraints require review,
    // as even an extra default or CHECK can break the application's INSERTs.
    if (columns.length !== expected.columns.length || !expected.columns.every(
      ([name, type, notNull, defaultValue = null]) => columns.some(column =>
        column.name === name && column.type === type && column.notNull === notNull
        && column.default === defaultValue && !column.identity && !column.generated),
    )) return false;
    const constraints = actual.constraints || [];
    if (constraints.length !== expected.constraints.length || !expected.constraints.every(
      definition => constraints.some(c => c.valid && c.immediate && c.definition === definition),
    )) return false;
    const indexes = actual.indexes || [];
    if (!expected.indexes.every(definition => indexes.some(i => i.valid && indexShape(i.definition) === definition))) return false;
    // Additional nonunique indexes are harmless; additional uniqueness rules
    // could reject writes that the application is entitled to make.
    if (indexes.some(i => i.unique && !expected.indexes.includes(indexShape(i.definition)))) return false;
  }
  return true;
}
