import { Pool, PoolClient } from 'pg';
import { QueryLogger } from './query_logger';
import { format as formatQuery } from 'sql-formatter';

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

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
    this.sessionId = Math.random().toString(36).substring(2, 8);

    const logger = new QueryLogger('dbpill.sqlite.db');
    this.logger = logger;
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
        SELECT pg_size_pretty(pg_total_relation_size($1)) as total_size,
               pg_size_pretty(pg_table_size($1)) as table_size,
               pg_size_pretty(pg_indexes_size($1)) as index_size,
               pg_stat_get_live_tuples($1::regclass) as live_tuples,
               pg_stat_get_dead_tuples($1::regclass) as dead_tuples
        FROM pg_class
        WHERE oid = $1::regclass;
      `;
        const statsResult = await client.query(statsQuery, [`${schemaName}.${tableName}`]);
        if (statsResult.rows.length > 0) {
          const stats = statsResult.rows[0];
          output += 'Table Statistics:\n';
          output += `- Total Size: ${stats.total_size}\n`;
          output += `- Table Size: ${stats.table_size}\n`;
          output += `- Index Size: ${stats.index_size}\n`;
          output += `- Live Tuples: ${stats.live_tuples}\n`;
          output += `- Dead Tuples: ${stats.dead_tuples}\n`;
        }

      } catch (error) {
        output += `Error: ${error}\n`;
      }

    } catch (error) {
      console.error('Error connecting to the database:', error);
      throw error;
    } finally {
      if (client) {
        client.release();
      }
    }
    return output;
  }


  async analyze({ query, params = [] }: AnalyzeParams): Promise<any> {
    let client: PoolClient | null = null;

    try {
      client = await this.pool.connect();

      const explainQuery = `EXPLAIN (ANALYZE, FORMAT JSON) ${query}`;
      const result = await client.query(explainQuery, params);

      if (result.rows.length > 0) {
        const queryPlan: QueryPlan = result.rows[0]["QUERY PLAN"][0];
        const planTime = queryPlan['Planning Time'];
        const execTime = queryPlan['Execution Time'];

        const sessionId = this.sessionId;
        return { sessionId, query, params, queryPlan, planTime, execTime };
      }
    } catch (error) {
      console.error(query);
      console.error(params);
      console.error('Error analyzing query:', error);
      throw error;
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