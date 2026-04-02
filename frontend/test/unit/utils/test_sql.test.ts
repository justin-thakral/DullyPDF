import { describe, expect, it } from 'vitest';
import { parseSql, parseSqlTables } from '../../../src/utils/sql';

describe('parseSql', () => {
  it('extracts columns and maps common SQL types', () => {
    const sql = `
      CREATE TABLE patients (
        id INTEGER PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        dob DATE,
        active BOOLEAN DEFAULT true
      );
    `;
    const result = parseSql(sql);
    expect(result.schema.fields).toEqual([
      { name: 'id', type: 'int' },
      { name: 'name', type: 'string' },
      { name: 'dob', type: 'date' },
      { name: 'active', type: 'bool' },
    ]);
    expect(result.columns).toEqual(['id', 'name', 'dob', 'active']);
    expect(result.rows).toEqual([]);
    expect(result.schema.sampleCount).toBe(0);
  });

  it('handles back-tick quoted identifiers (MySQL style)', () => {
    const sql = 'CREATE TABLE `my_table` (`full name` TEXT, `age` INT);';
    const result = parseSql(sql);
    expect(result.schema.fields).toEqual([
      { name: 'full name', type: 'string' },
      { name: 'age', type: 'int' },
    ]);
  });

  it('handles double-quote quoted identifiers (Postgres style)', () => {
    const sql = 'CREATE TABLE "public"."users" ("first_name" VARCHAR(100), "created_at" TIMESTAMP);';
    const result = parseSql(sql);
    expect(result.schema.fields).toEqual([
      { name: 'first_name', type: 'string' },
      { name: 'created_at', type: 'date' },
    ]);
  });

  it('strips SQL comments', () => {
    const sql = `
      -- This is a comment
      CREATE TABLE test (
        /* block comment */
        col1 INT, -- inline comment
        col2 TEXT
      );
    `;
    const result = parseSql(sql);
    expect(result.schema.fields).toEqual([
      { name: 'col1', type: 'int' },
      { name: 'col2', type: 'string' },
    ]);
  });

  it('skips constraint lines (PRIMARY KEY, UNIQUE, FOREIGN KEY, CHECK)', () => {
    const sql = `
      CREATE TABLE orders (
        id BIGINT,
        total DECIMAL(10,2),
        status VARCHAR(50),
        PRIMARY KEY (id),
        UNIQUE (status),
        CONSTRAINT fk_customer FOREIGN KEY (id) REFERENCES customers(id),
        CHECK (total >= 0)
      );
    `;
    const result = parseSql(sql);
    expect(result.schema.fields.map((f) => f.name)).toEqual(['id', 'total', 'status']);
  });

  it('handles DECIMAL / NUMERIC precision without splitting on commas', () => {
    const sql = 'CREATE TABLE t (amount DECIMAL(10,2), rate NUMERIC(5,4));';
    const result = parseSql(sql);
    expect(result.schema.fields).toEqual([
      { name: 'amount', type: 'int' },
      { name: 'rate', type: 'int' },
    ]);
  });

  it('handles IF NOT EXISTS', () => {
    const sql = 'CREATE TABLE IF NOT EXISTS t (a INT, b TEXT);';
    const result = parseSql(sql);
    expect(result.schema.fields).toEqual([
      { name: 'a', type: 'int' },
      { name: 'b', type: 'string' },
    ]);
  });

  it('merges fields from multiple tables and deduplicates', () => {
    const sql = `
      CREATE TABLE a (id INT, name TEXT);
      CREATE TABLE b (id INT, email VARCHAR(200));
    `;
    const result = parseSql(sql);
    expect(result.schema.fields.map((f) => f.name)).toEqual(['id', 'name', 'email']);
  });

  it('returns empty fields for SQL with no CREATE TABLE', () => {
    const sql = 'SELECT * FROM users; INSERT INTO users VALUES (1);';
    const result = parseSql(sql);
    expect(result.schema.fields).toEqual([]);
  });

  it('maps all supported SQL type families', () => {
    const sql = `
      CREATE TABLE type_test (
        a CHAR(10),
        b TINYTEXT,
        c MEDIUMTEXT,
        d LONGTEXT,
        e NVARCHAR(50),
        f SMALLINT,
        g TINYINT,
        h MEDIUMINT,
        i BIGINT,
        j SERIAL,
        k BIGSERIAL,
        l DATETIME,
        m TIMESTAMPTZ,
        n TIME,
        o YEAR,
        p BIT,
        q FLOAT,
        r REAL,
        s ENUM('a','b'),
        t JSON,
        u JSONB,
        v UUID
      );
    `;
    const result = parseSql(sql);
    const types = Object.fromEntries(result.schema.fields.map((f) => [f.name, f.type]));
    expect(types.a).toBe('string');
    expect(types.b).toBe('string');
    expect(types.c).toBe('string');
    expect(types.d).toBe('string');
    expect(types.e).toBe('string');
    expect(types.f).toBe('int');
    expect(types.g).toBe('int');
    expect(types.h).toBe('int');
    expect(types.i).toBe('int');
    expect(types.j).toBe('int');
    expect(types.k).toBe('int');
    expect(types.l).toBe('date');
    expect(types.m).toBe('date');
    expect(types.n).toBe('date');
    expect(types.o).toBe('date');
    expect(types.p).toBe('bool');
    expect(types.q).toBe('int');
    expect(types.r).toBe('int');
    expect(types.s).toBe('string');
    expect(types.t).toBe('string');
    expect(types.u).toBe('string');
    expect(types.v).toBe('string');
  });

  it('parses INSERT INTO VALUES rows', () => {
    const sql = `
      CREATE TABLE users (id INT, name TEXT, active BOOLEAN);
      INSERT INTO users VALUES (1, 'Alice', true);
      INSERT INTO users VALUES (2, 'Bob', false);
    `;
    const result = parseSql(sql);
    expect(result.rows).toEqual([
      { id: '1', name: 'Alice', active: 'true' },
      { id: '2', name: 'Bob', active: 'false' },
    ]);
    expect(result.schema.sampleCount).toBe(2);
  });

  it('parses multi-row INSERT with explicit columns', () => {
    const sql = `
      CREATE TABLE t (a INT, b TEXT, c TEXT);
      INSERT INTO t (b, a) VALUES ('hello', 42), ('world', 99);
    `;
    const result = parseSql(sql);
    expect(result.rows).toEqual([
      { b: 'hello', a: '42' },
      { b: 'world', a: '99' },
    ]);
  });

  it('handles NULL values in INSERT', () => {
    const sql = `
      CREATE TABLE t (name TEXT, age INT);
      INSERT INTO t VALUES ('Alice', NULL);
    `;
    const result = parseSql(sql);
    expect(result.rows).toEqual([{ name: 'Alice', age: '' }]);
  });

  it('handles quoted strings with escaped quotes', () => {
    const sql = `
      CREATE TABLE t (note TEXT);
      INSERT INTO t VALUES ('it''s fine');
    `;
    const result = parseSql(sql);
    expect(result.rows[0].note).toBe("it's fine");
  });
});

describe('parseSqlTables', () => {
  it('returns individual tables with names', () => {
    const sql = `
      CREATE TABLE patients (id INT, name TEXT);
      CREATE TABLE visits (visit_id INT, patient_id INT, visit_date DATE);
    `;
    const tables = parseSqlTables(sql);
    expect(tables).toHaveLength(2);
    expect(tables[0].tableName).toBe('patients');
    expect(tables[0].fields).toHaveLength(2);
    expect(tables[1].tableName).toBe('visits');
    expect(tables[1].fields).toHaveLength(3);
  });

  it('strips schema prefix from table name', () => {
    const sql = 'CREATE TABLE public.users (id INT);';
    const tables = parseSqlTables(sql);
    expect(tables[0].tableName).toBe('users');
  });
});
