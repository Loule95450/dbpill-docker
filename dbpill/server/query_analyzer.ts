import { Pool, PoolClient } from 'pg';
import { QueryLogger } from './query_logger';
import { format as formatQuery } from 'sql-formatter';
import argv from './args';

function debug(message: string, ...args: any[]) {
  if (argv.verbose) {
    console.log(message, ...args);
  }
}

interface AnalyzeParams {
  query: string;
  params?: any[];
}

interface QueryPlan {
  Plan: {
    'Planning Time': number;
    'Execution Time': number;
  };
}

export class QueryAnalyzer {
  private pool: Pool;
  private sessionId: string;
  public logger: QueryLogger;
  public host: string;
  public database: string;
  public port: number;
  // Cache for table sizes to avoid repeated queries
  private tableSizeCache: Map<string, { table_size_bytes: number; estimated_rows: number }> = new Map();

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
    this.sessionId = Math.random().toString(36).substring(2, 8);

    // Parse connection details for later use (e.g. filtering logs by DB)
    try {
      const url = new URL(connectionString);
      this.host = url.hostname;
      // Remove leading slashes in pathname to obtain DB name
      this.database = url.pathname.replace(/^\/+/g, '');
      this.port = url.port ? parseInt(url.port, 10) : 5432;
    } catch (_) {
      // Fallbacks in case the connection string cannot be parsed
      this.host = 'localhost';
      this.database = '';
      this.port = 5432;
    }

    const logger = new QueryLogger('dbpill.sqlite.db');
    this.logger = logger;
  }

  private shouldSkipAnalysis(query: string): boolean {
    const trimmedQuery = query.trim().toUpperCase();
    
    // List of query types that can't be analyzed with EXPLAIN
    const skipPatterns = [
      'SHOW',
      'SET',
      'RESET',
      'START TRANSACTION',
      'SAVEPOINT',
      'RELEASE SAVEPOINT',
      'ROLLBACK TO SAVEPOINT',
      'PREPARE',
      'EXECUTE',
      'DEALLOCATE',
      'LISTEN',
      'NOTIFY',
      'UNLISTEN',
      'LOAD',
      'DISCARD',
      'CHECKPOINT',
      'VACUUM',
      'ANALYZE',
      'REINDEX',
      'CLUSTER',
      'LOCK',
      'GRANT',
      'REVOKE',
      'COPY',
      'CREATE',
      'DROP',
      'ALTER',
      'COMMENT',
      'SECURITY',
      '\\',  // psql meta-commands
    ];

    return skipPatterns.some(pattern => trimmedQuery.startsWith(pattern));
  }

  async getTableStructure(tableName: string, schemaName?: string): Promise<string> {
    let output = '';

    let client: PoolClient | null = null;
    try {
      client = await this.pool.connect();

      if(!schemaName) {
        const currentSchemaQuery = `
          SELECT current_schema();
        `;

        const currentSchemaResult = await client.query(currentSchemaQuery);
        schemaName = currentSchemaResult.rows[0].current_schema;
      }

      try {
        // Table info
        const tableInfoQuery = `
        SELECT table_type
        FROM information_schema.tables
        WHERE table_schema = $1 AND table_name = $2;
      `;
        const tableInfoResult = await client.query(tableInfoQuery, [schemaName, tableName]);
        if (tableInfoResult.rows.length === 0) {
          return `Table '${schemaName}.${tableName}' not found.`;
        }
        output += `${tableInfoResult.rows[0].table_type}: ${schemaName}.${tableName}\n\n`;

        // Columns
        const columnQuery = `
        SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position;
      `;
        const columnResult = await client.query(columnQuery, [schemaName, tableName]);
        output += 'Columns:\n';
        columnResult.rows.forEach(row => {
          let columnInfo = `- ${row.column_name}: ${row.data_type}`;
          if (row.character_maximum_length) columnInfo += `(${row.character_maximum_length})`;
          columnInfo += ` ${row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`;
          if (row.column_default) columnInfo += ` DEFAULT ${row.column_default}`;
          output += columnInfo + '\n';
        });
        output += '\n';

        // Constraints
        const constraintQuery = `
        SELECT con.conname, con.contype, pg_get_constraintdef(con.oid) as definition
        FROM pg_constraint con
        INNER JOIN pg_class rel ON rel.oid = con.conrelid
        INNER JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = $1 AND rel.relname = $2;
      `;
        const constraintResult = await client.query(constraintQuery, [schemaName, tableName]);
        if (constraintResult.rows.length > 0) {
          output += 'Constraints:\n';
          constraintResult.rows.forEach(row => {
            const constraintType = {
              'p': 'PRIMARY KEY',
              'f': 'FOREIGN KEY',
              'u': 'UNIQUE',
              'c': 'CHECK'
            }[row.contype] || 'OTHER';
            output += `- ${row.conname} (${constraintType}): ${row.definition}\n`;
          });
          output += '\n';
        }

        // Indexes
        const indexQuery = `
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = $1 AND tablename = $2;
      `;
        const indexResult = await client.query(indexQuery, [schemaName, tableName]);
        if (indexResult.rows.length > 0) {
          output += 'Indexes:\n';
          indexResult.rows.forEach(row => {
            output += `- ${row.indexname}: ${row.indexdef}\n`;
          });
          output += '\n';
        }

        // Table stats
        const statsQuery = `
        SELECT pg_total_relation_size($1::regclass)          AS total_size_bytes,
               pg_table_size($1::regclass)                  AS table_size_bytes,
               pg_indexes_size($1::regclass)                AS index_size_bytes,
               pg_size_pretty(pg_total_relation_size($1::regclass))  AS total_size_pretty,
               pg_size_pretty(pg_table_size($1::regclass))           AS table_size_pretty,
               pg_size_pretty(pg_indexes_size($1::regclass))         AS index_size_pretty,
               pg_stat_get_live_tuples($1::regclass)       AS live_tuples,
               pg_stat_get_dead_tuples($1::regclass)       AS dead_tuples,
               (SELECT reltuples FROM pg_class WHERE oid = $1::regclass) AS estimated_rows
        `;
        const statsResult = await client.query(statsQuery, [`${schemaName}.${tableName}`]);
        if (statsResult.rows.length > 0) {
          const stats = statsResult.rows[0];
          output += 'Table Statistics:\n';
          output += `- Total Size: ${stats.total_size_pretty}\n`;
          output += `- Table Size: ${stats.table_size_pretty}\n`;
          output += `- Index Size: ${stats.index_size_pretty}\n`;
          output += `- Live Tuples: ${stats.live_tuples}\n`;
          output += `- Dead Tuples: ${stats.dead_tuples}\n`;
          output += `- Estimated Rows: ${stats.estimated_rows}\n`;
          output += `- Table Size (bytes): ${stats.table_size_bytes}\n`;
        }

      } catch (error) {
        output += `Error: ${error}\n`;
      }

    } catch (error) {
      debug('Error connecting to the database:', error);
      throw error;
    } finally {
      if (client) {
        client.release();
      }
    }
    return output;
  }

  /**
   * Return raw size information for a table (bytes + estimated rows).
   * Results are cached in-memory for the lifetime of the QueryAnalyzer instance
   * to avoid repeated calls for the same table name.
   */
  async getTableSize(tableName: string): Promise<{ table_size_bytes: number; estimated_rows: number }> {
    if (this.tableSizeCache.has(tableName)) {
      // Return cached value if present
      return this.tableSizeCache.get(tableName)!;
    }

    let client: PoolClient | null = null;
    try {
      client = await this.pool.connect();

      const sizeQuery = `
        SELECT pg_table_size(c.oid) AS table_size_bytes, c.reltuples AS estimated_rows
        FROM pg_class c
        WHERE c.relname = $1 AND c.relkind = 'r'
        LIMIT 1;
      `;
      const { rows } = await client.query(sizeQuery, [tableName]);

      if (rows.length === 0) {
        // Fallback: unknown table – cache zeroes to avoid repeated look-ups
        const fallback = { table_size_bytes: 0, estimated_rows: 0 };
        this.tableSizeCache.set(tableName, fallback);
        return fallback;
      }

      const info = {
        table_size_bytes: Number(rows[0].table_size_bytes),
        estimated_rows: Number(rows[0].estimated_rows),
      };
      this.tableSizeCache.set(tableName, info);
      return info;
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  async analyze({ query, params = [] }: AnalyzeParams): Promise<any> {
    if (this.shouldSkipAnalysis(query)) {
      return {
        sessionId: this.sessionId,
        query,
        params,
        queryPlan: null,
        planTime: 0,
        execTime: 0,
        tableSizes: {},
      };
    }

    let client: PoolClient | null = null;

    try {
      client = await this.pool.connect();

      const explainQuery = `EXPLAIN (ANALYZE, FORMAT JSON) ${query}`;
      const result = await client.query(explainQuery, params);

      const rows = (result as any)?.rows;
      if (Array.isArray(rows) && rows.length > 0) {
        const firstRow = rows[0];
        const planArray = firstRow?.["QUERY PLAN"];

        if (Array.isArray(planArray) && planArray.length > 0) {
          const queryPlan: QueryPlan = planArray[0];
          const planTime = queryPlan['Planning Time'];
          const execTime = queryPlan['Execution Time'];

          // Extract table names from the plan to collect size statistics
          function extractRelationNames(plan: any): string[] {
            const relationNames: string[] = [];
            function traverse(obj: any) {
              if (obj && typeof obj === 'object') {
                if ('Relation Name' in obj) {
                  relationNames.push(obj['Relation Name']);
                }
                for (const key in obj) {
                  if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    traverse(obj[key]);
                  }
                }
              } else if (Array.isArray(obj)) {
                obj.forEach(traverse);
              }
            }
            traverse(plan);
            return [...new Set(relationNames)];
          }

          let tableSizes: Record<string, { table_size_bytes: number; estimated_rows: number }> = {};
          try {
            const tables = extractRelationNames(queryPlan);
            const sizePromises = tables.map(async (t) => ({ name: t, info: await this.getTableSize(t) }));
            const sizes = await Promise.all(sizePromises);
            sizes.forEach(({ name, info }) => {
              tableSizes[name] = info;
            });
          } catch (_) {
            // Ignore errors in table size retrieval – analysis should still succeed
          }

          const sessionId = this.sessionId;
          debug(query);
          return { sessionId, query, params, queryPlan, planTime, execTime, tableSizes };
        }
      }

      // Fallback – return a minimal object so callers don't crash
      return {
        sessionId: this.sessionId,
        query,
        params,
        queryPlan: null,
        planTime: 0,
        execTime: 0,
        tableSizes: {},
      };
    } catch (error) {
      console.error(query);
      console.error(params);
      console.error('Error analyzing query:', error);
      // Still return a minimal object so downstream logic can continue
      return {
        sessionId: this.sessionId,
        query,
        params,
        queryPlan: null,
        planTime: 0,
        execTime: 0,
        tableSizes: {},
      };
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  async saveAnalysis({ sessionId, query, params, queryPlan, planTime, execTime }: any) {
    query = formatQuery(query, { language: 'postgresql', denseOperators: true });
    await this.logger.addQueryStats({
      sessionId,
      query,
      params: JSON.stringify(params, null, 2),
      queryPlan: JSON.stringify(queryPlan, null, 2),
      planTime,
      execTime,
      host: this.host,
      database: this.database,
      port: this.port,
    });
  }

  async applyIndexes(indexes: string) {
    const client = await this.pool.connect();
    try {
      await client.query(`
        BEGIN;
        ${indexes}
        COMMIT;
      `);
    } catch (error) {
      console.error(indexes);
      console.error('Error applying indexes:', error);
      await client.query(`
        ROLLBACK;
      `);
      throw error;
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  async getAllAppliedIndexes(): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      const indexes = await client.query(`
        SELECT
            i.relname AS index_name,
            t.relname AS table_name,
            a.attname AS column_name,
            ix.indisunique AS is_unique,
            ix.indisprimary AS is_primary,
            pg_catalog.pg_get_indexdef(ix.indexrelid) AS index_definition
        FROM
            pg_catalog.pg_class t
            JOIN pg_catalog.pg_index ix ON t.oid = ix.indrelid
            JOIN pg_catalog.pg_class i ON ix.indexrelid = i.oid
            JOIN pg_catalog.pg_attribute a ON a.attnum = ANY(ix.indkey) AND a.attrelid = t.oid
        WHERE
            t.relkind = 'r'  -- only tables
            AND i.relname LIKE 'dbpill_%'
        ORDER BY
            t.relname, i.relname;
        `);
      return indexes.rows;
    } catch (error) {
      console.error('Error getting all applied indexes:', error);
      throw error;
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export default QueryAnalyzer;