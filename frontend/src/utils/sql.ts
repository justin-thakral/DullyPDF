/**
 * SQL DDL parser for extracting schema fields from CREATE TABLE statements.
 *
 * Parses SQL files containing CREATE TABLE definitions and maps SQL column
 * types to the internal SchemaFieldType union. Does NOT connect to any
 * database — only reads static .sql text.
 */
import type { SchemaFieldType, SchemaMetadata } from './schema';
import { ALLOWED_SCHEMA_TYPES } from './schema';

/** SQL type keywords mapped to internal schema types. */
const SQL_TYPE_MAP: Record<string, SchemaFieldType> = {
  // string
  varchar: 'string',
  char: 'string',
  text: 'string',
  tinytext: 'string',
  mediumtext: 'string',
  longtext: 'string',
  nchar: 'string',
  nvarchar: 'string',
  clob: 'string',
  enum: 'string',
  set: 'string',
  uuid: 'string',
  json: 'string',
  jsonb: 'string',
  xml: 'string',
  // int
  int: 'int',
  integer: 'int',
  smallint: 'int',
  tinyint: 'int',
  mediumint: 'int',
  bigint: 'int',
  serial: 'int',
  bigserial: 'int',
  smallserial: 'int',
  // date
  date: 'date',
  datetime: 'date',
  timestamp: 'date',
  timestamptz: 'date',
  time: 'date',
  timetz: 'date',
  year: 'date',
  // bool
  boolean: 'bool',
  bool: 'bool',
  bit: 'bool',
};

/** Strip SQL comments (single-line `--` and block `/* … *​/`). */
function stripComments(sql: string): string {
  // Block comments (non-greedy).
  let result = sql.replace(/\/\*[\s\S]*?\*\//g, '');
  // Single-line comments.
  result = result.replace(/--[^\n]*/g, '');
  return result;
}

/**
 * Resolve a raw SQL type token (e.g. "VARCHAR(255)", "BIGINT UNSIGNED") to a
 * SchemaFieldType. Falls back to 'string' for unrecognised types.
 */
function resolveType(rawType: string): SchemaFieldType {
  const base = rawType
    .replace(/\(.*\)/, '')    // drop precision / length
    .replace(/\s+unsigned/i, '')
    .replace(/\s+signed/i, '')
    .replace(/\s+varying/i, '')  // CHARACTER VARYING → character
    .trim()
    .toLowerCase();
  const mapped = SQL_TYPE_MAP[base];
  if (mapped && ALLOWED_SCHEMA_TYPES.has(mapped)) return mapped;
  // Handle "double precision", "numeric", "decimal", "float", "real" → int
  // (closest integer bucket, consistent with the rest of the schema system)
  if (/^(numeric|decimal|float|double|real|money|smallmoney)$/.test(base)) return 'int';
  return 'string';
}

/** Regex to locate the start of a CREATE TABLE statement. */
const CREATE_TABLE_START_RE =
  /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`([^`]+)`|"([^"]+)"|(\S+))\s*\(/gi;

/**
 * Extract the body between balanced parentheses starting at `openPos`
 * (the index of the opening `(`). Returns the inner text and the index
 * just past the closing `)`.
 */
function extractBalancedBody(sql: string, openPos: number): { body: string; endPos: number } | null {
  let depth = 0;
  for (let i = openPos; i < sql.length; i++) {
    if (sql[i] === '(') depth++;
    else if (sql[i] === ')') {
      depth--;
      if (depth === 0) {
        return { body: sql.slice(openPos + 1, i), endPos: i + 1 };
      }
    }
  }
  return null;
}

/**
 * Parse a single column definition line and return { name, type } or null
 * if the line is a constraint rather than a column.
 */
function parseColumnLine(line: string): { name: string; type: SchemaFieldType } | null {
  const trimmed = line.trim().replace(/,$/, '').trim();
  if (!trimmed) return null;

  // Skip lines that are constraints, indexes, keys, or checks.
  if (
    /^(PRIMARY\s+KEY|UNIQUE|INDEX|KEY\s|CHECK|CONSTRAINT|FOREIGN\s+KEY|EXCLUDE)/i.test(trimmed)
  ) {
    return null;
  }

  // Column name may be back-tick quoted, double-quote quoted, or bare.
  const match = trimmed.match(
    /^(?:`([^`]+)`|"([^"]+)"|(\w+))\s+(.+)/,
  );
  if (!match) return null;

  const name = (match[1] ?? match[2] ?? match[3]).trim();
  const rest = match[4];

  // The type token is the first word(s) before constraints start.
  // Grab everything up to the first known constraint keyword.
  const typeChunk = rest
    .replace(
      /\b(NOT\s+NULL|NULL|DEFAULT|PRIMARY|UNIQUE|REFERENCES|CHECK|AUTO_INCREMENT|AUTOINCREMENT|GENERATED|IDENTITY|ON\s+UPDATE|ON\s+DELETE|COLLATE|COMMENT)\b[\s\S]*/i,
      '',
    )
    .trim();

  return { name, type: resolveType(typeChunk || 'string') };
}

export type ParsedSqlTable = {
  tableName: string;
  fields: Array<{ name: string; type: SchemaFieldType }>;
};

/**
 * Parse all CREATE TABLE statements from a SQL string.
 * Returns one entry per table found.
 */
export function parseSqlTables(sql: string): ParsedSqlTable[] {
  const cleaned = stripComments(sql);
  const tables: ParsedSqlTable[] = [];

  let m: RegExpExecArray | null;
  CREATE_TABLE_START_RE.lastIndex = 0;
  while ((m = CREATE_TABLE_START_RE.exec(cleaned)) !== null) {
    const tableName = (m[1] ?? m[2] ?? m[3] ?? 'unknown')
      .replace(/^[^.]*\./, ''); // strip schema prefix like "public."

    // The regex matched up to and including `(`. Find the opening paren position.
    const openParenPos = m.index + m[0].length - 1;
    const extracted = extractBalancedBody(cleaned, openParenPos);
    if (!extracted) continue;

    // Advance the regex past the body so we don't re-match inside it.
    CREATE_TABLE_START_RE.lastIndex = extracted.endPos;

    const lines = splitColumnsBody(extracted.body);

    const seen = new Set<string>();
    const fields: Array<{ name: string; type: SchemaFieldType }> = [];
    for (const line of lines) {
      const col = parseColumnLine(line);
      if (!col || seen.has(col.name)) continue;
      seen.add(col.name);
      fields.push(col);
    }

    if (fields.length > 0) {
      tables.push({ tableName, fields });
    }
  }

  return tables;
}

/**
 * Split the column-definition body on commas, but ignore commas inside
 * parentheses (e.g. `DECIMAL(10,2)` or `CHECK(x IN (1,2))`).
 */
function splitColumnsBody(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of body) {
    if (ch === '(') { depth++; current += ch; continue; }
    if (ch === ')') { depth = Math.max(0, depth - 1); current += ch; continue; }
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/** Regex to locate INSERT INTO … VALUES statements. */
const INSERT_INTO_RE =
  /INSERT\s+INTO\s+(?:`[^`]+`|"[^"]+"|[\w.]+)\s*(?:\(([^)]*)\)\s*)?VALUES\s*/gi;

/**
 * Parse a single SQL value literal and return the unquoted string.
 * Handles 'string', "string", numeric, NULL, and boolean tokens.
 */
function parseSqlValue(raw: string): string {
  const trimmed = raw.trim();
  if (/^null$/i.test(trimmed)) return '';
  if (/^true$/i.test(trimmed)) return 'true';
  if (/^false$/i.test(trimmed)) return 'false';
  // Strip surrounding quotes (single or double).
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1).replace(/''/g, "'").replace(/\\'/g, "'");
  }
  return trimmed;
}

/**
 * Parse INSERT INTO statements and return row records.
 * Uses `columns` from CREATE TABLE when the INSERT omits a column list.
 */
function parseInsertRows(
  sql: string,
  schemaColumns: string[],
): Array<Record<string, string>> {
  const cleaned = stripComments(sql);
  const rows: Array<Record<string, string>> = [];

  let m: RegExpExecArray | null;
  INSERT_INTO_RE.lastIndex = 0;
  while ((m = INSERT_INTO_RE.exec(cleaned)) !== null) {
    // Determine column order: explicit column list or fall back to schema.
    const explicitCols = m[1]
      ? m[1].split(',').map((c) =>
          c.trim().replace(/^[`"]|[`"]$/g, ''),
        )
      : schemaColumns;

    // Parse each VALUES tuple: (...), (...), ...
    let pos = INSERT_INTO_RE.lastIndex;
    while (pos < cleaned.length) {
      // Skip whitespace.
      while (pos < cleaned.length && /\s/.test(cleaned[pos])) pos++;
      if (cleaned[pos] !== '(') break;

      const extracted = extractBalancedBody(cleaned, pos);
      if (!extracted) break;

      const values = splitColumnsBody(extracted.body).map(parseSqlValue);
      const record: Record<string, string> = {};
      for (let i = 0; i < explicitCols.length; i++) {
        record[explicitCols[i]] = values[i] ?? '';
      }
      rows.push(record);

      pos = extracted.endPos;
      // Skip optional comma between tuples.
      while (pos < cleaned.length && /[\s,]/.test(cleaned[pos])) pos++;
      // Stop at semicolon.
      if (cleaned[pos] === ';') { pos++; break; }
    }
    INSERT_INTO_RE.lastIndex = pos;

    if (rows.length >= 5000) break;
  }

  return rows;
}

export type ParsedSql = {
  columns: string[];
  rows: Array<Record<string, string>>;
  schema: SchemaMetadata;
};

/**
 * Parse a SQL file and return schema metadata plus any row data from
 * INSERT INTO statements.
 *
 * If the file contains multiple tables, fields from all tables are merged
 * (duplicates dropped by name).
 */
export function parseSql(sql: string): ParsedSql {
  const tables = parseSqlTables(sql);
  const seen = new Set<string>();
  const fields: Array<{ name: string; type: SchemaFieldType }> = [];
  for (const table of tables) {
    for (const field of table.fields) {
      if (seen.has(field.name)) continue;
      seen.add(field.name);
      fields.push(field);
    }
  }
  const columns = fields.map((f) => f.name);
  const rows = parseInsertRows(sql, columns);
  return {
    columns,
    rows,
    schema: { fields, sampleCount: rows.length },
  };
}
