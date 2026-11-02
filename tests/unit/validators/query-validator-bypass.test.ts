import { describe, it, expect } from 'vitest';
import { validateQuery } from '../../../src/validators/query-validator.js';

function rejected(query: string): string {
  const result = validateQuery(query);
  expect(result.valid, `deveria rejeitar: ${query}`).toBe(false);
  return result.reason ?? '';
}

function accepted(query: string): void {
  const result = validateQuery(query);
  expect(result.valid, `deveria aceitar: ${query} (${result.reason})`).toBe(true);
}

describe('validateQuery - bypass attempts', () => {
  describe('multiple statements', () => {
    it.each([
      'SELECT 1; SET transaction_read_only = off',
      'SELECT 1; SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE',
      'SELECT 1; COMMIT',
      'SELECT 1; BEGIN',
      'SELECT 1; VACUUM',
      'SELECT 1; LOCK TABLE users',
      'SELECT 1; DO $$ BEGIN PERFORM 1; END $$',
      'SELECT 1;SELECT 2',
      "SELECT ';' AS a; RESET ALL",
    ])('rejeita %s', (query) => {
      expect(rejected(query)).toMatch(/multiple statements|not allowed/);
    });

    it('aceita um ponto e vírgula final', () => {
      accepted('SELECT 1;');
      accepted('SELECT 1 ;  \n ; ');
    });

    it('aceita ponto e vírgula dentro de literais e comentários', () => {
      accepted("SELECT 'a;b' AS x");
      accepted('SELECT $$a;b$$ AS x');
      accepted('SELECT $tag$a;b$tag$ AS x');
      accepted('SELECT 1 AS "semi;colon"');
      accepted('SELECT 1 -- ; comentário\n');
      accepted('SELECT 1 /* ; */');
    });
  });

  describe('comentários e literais que escondem statements', () => {
    it('não é enganado por -- dentro de string', () => {
      rejected("SELECT '--' AS x; DELETE FROM users");
      rejected("SELECT '--'; SET transaction_read_only = off");
    });

    it('não é enganado por /* dentro de string', () => {
      rejected("SELECT '/*' AS x; DROP TABLE users; SELECT '*/'");
    });

    it('trata comentários de bloco aninhados', () => {
      accepted('SELECT 1 /* externo /* interno */ ainda comentário ; */');
      rejected('SELECT 1 /* externo /* interno */ fim */; DELETE FROM users');
    });

    it('trata E-strings com barra invertida', () => {
      rejected("SELECT E'it\\'s' AS x; DELETE FROM users");
      accepted("SELECT E'a\\';b' AS x");
    });

    it('literal padrão não usa barra invertida como escape', () => {
      // em standard_conforming_strings=on, 'a\' termina na segunda aspa
      rejected("SELECT 'a\\'; DELETE FROM users; --'");
    });

    it('rejeita literal, identificador ou comentário não fechado', () => {
      expect(rejected("SELECT 'abc")).toMatch(/unterminated/);
      expect(rejected('SELECT "abc')).toMatch(/unterminated/);
      expect(rejected('SELECT 1 /* abc')).toMatch(/unterminated/);
      expect(rejected('SELECT $x$ abc')).toMatch(/unterminated/);
    });

    it('não confunde parâmetro posicional com dollar quote', () => {
      accepted('SELECT $1::int, $2::text');
    });
  });

  describe('funções perigosas', () => {
    it.each([
      "SELECT pg_read_file('/etc/passwd')",
      "SELECT pg_read_binary_file('/etc/passwd')",
      "SELECT pg_catalog.pg_read_file('postgresql.conf')",
      'SELECT "pg_read_file"(\'x\')',
      "SELECT PG_READ_FILE ('x')",
      "SELECT * FROM pg_ls_dir('.')",
      "SELECT pg_stat_file('x')",
      "SELECT lo_import('/etc/passwd')",
      "SELECT lo_export(16384, '/tmp/x')",
      'SELECT lo_unlink(16384)',
      "SELECT lo_from_bytea(0, 'x')",
      "SELECT dblink_exec('dbname=postgres', 'drop table users')",
      "SELECT * FROM dblink('dbname=postgres', 'select 1') AS t(a int)",
      "SELECT dblink_connect('c', 'dbname=postgres')",
      "SELECT set_config('default_transaction_read_only', 'off', false)",
      "SELECT set_config('transaction_read_only', 'off', true)",
      'SELECT pg_reload_conf()',
      'SELECT pg_terminate_backend(123)',
      'SELECT pg_cancel_backend(123)',
      'SELECT pg_advisory_lock(1)',
      'SELECT pg_try_advisory_lock(1)',
      "SELECT nextval('users_id_seq')",
      "SELECT setval('users_id_seq', 1)",
      "SELECT pg_notify('canal', 'x')",
      "SELECT pg_create_logical_replication_slot('s', 'pgoutput')",
      "SELECT pg_file_write('x', 'y', false)",
      "SELECT query_to_xml('select pg_read_file(''/etc/passwd'')', true, false, '')",
    ])('rejeita %s', (query) => {
      expect(rejected(query)).toMatch(/Function ".+" is not allowed/);
    });

    it('não bloqueia colunas com nomes parecidos', () => {
      accepted('SELECT set_config_value, nextval_cache FROM t');
      accepted('SELECT my_pg_read_file(1)');
      accepted("SELECT current_setting('default_transaction_read_only')");
    });
  });

  describe('palavras-chave e cláusulas', () => {
    it('rejeita COPY', () => {
      rejected("SELECT 1; COPY users TO PROGRAM 'cat /etc/passwd'");
      rejected("COPY (SELECT 1) TO PROGRAM 'id'");
    });

    it('rejeita CTE com DML', () => {
      rejected('WITH x AS (DELETE FROM users RETURNING *) SELECT * FROM x');
      rejected('WITH x AS (INSERT INTO users VALUES (1) RETURNING *) SELECT * FROM x');
    });

    it('rejeita EXPLAIN ANALYZE de DML', () => {
      rejected('EXPLAIN ANALYZE DELETE FROM users');
    });

    it('rejeita cláusulas de bloqueio de linha', () => {
      rejected('SELECT * FROM users FOR SHARE');
      rejected('SELECT * FROM users FOR KEY SHARE');
      rejected('SELECT * FROM users FOR NO KEY UPDATE');
    });

    it('rejeita SELECT INTO', () => {
      rejected('SELECT * INTO nova_tabela FROM users');
    });

    it('rejeita comandos que não começam com SELECT/WITH/EXPLAIN', () => {
      rejected('SET transaction_read_only = off');
      rejected('DO $$ BEGIN END $$');
      rejected('CALL proc()');
      rejected('SELECTX 1');
      rejected('/* */ SET x = 1');
    });

    it('não acusa palavras bloqueadas dentro de literais', () => {
      accepted("SELECT * FROM audit WHERE action = 'DELETE'");
      accepted("SELECT * FROM audit WHERE action IN ('INSERT', 'UPDATE')");
      accepted("SELECT 'x INTO y' AS frase");
    });

    it('aceita consultas legítimas', () => {
      accepted('EXPLAIN ANALYZE SELECT * FROM users');
      accepted('EXPLAIN (FORMAT JSON) SELECT 1');
      accepted('WITH a AS (SELECT 1 AS x) SELECT x FROM a');
      accepted("SELECT current_setting('statement_timeout')");
    });
  });
});
