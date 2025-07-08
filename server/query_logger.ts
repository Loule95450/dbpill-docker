import { DatabaseHelper } from './database_helper';

export interface QueryInstance {
    instance_id: number;
    query_id: number;
    session_id: string;
    params: string;
    query_plan: string;
    plan_time: number;
    exec_time: number;
    timestamp: string;
}

export interface QueryGroup {
    query_id: number;
    host: string;
    database: string;
    port: number;
    query: string;
    num_instances: number;
    instances?: QueryInstance[];
    llm_response: string;
    suggested_indexes: string;
    applied_indexes: string;
    prev_exec_time: number;
    new_exec_time: number;
    min_exec_time: number;
    max_exec_time: number;
    avg_exec_time: number;
    total_time: number;
    last_exec_time: number;
    hidden?: boolean;
}

export class QueryLogger {
    private dbHelper: DatabaseHelper;

    constructor(private dbPath: string) {
        this.dbHelper = new DatabaseHelper(dbPath);
        this.initialize();
    }

    async initialize(): Promise<void> {
        await this.dbHelper.initialize();

        await this.dbHelper.exec(`
            CREATE TABLE IF NOT EXISTS queries (
                query_id INTEGER PRIMARY KEY AUTOINCREMENT,
                host TEXT,
                database TEXT,
                port INTEGER,
                query TEXT,
                llm_response TEXT,
                suggested_indexes TEXT,
                applied_indexes TEXT,
                prev_exec_time REAL,
                new_exec_time REAL,
                hidden BOOLEAN DEFAULT 0
            )
        `);

        // New table to store every suggestion separately so we can keep
        // a full history of prompts / responses and track whether a
        // suggestion has been applied or reverted as well as the before /
        // after performance numbers.
        await this.dbHelper.exec(`
            CREATE TABLE IF NOT EXISTS index_suggestions (
                suggestion_id INTEGER PRIMARY KEY AUTOINCREMENT,
                query_id INTEGER,
                prompt TEXT,
                llm_response TEXT,
                suggested_indexes TEXT,
                -- Whether the indexes generated in this suggestion are
                -- currently applied to the database.
                applied BOOLEAN DEFAULT 0,
                -- Whether an applied suggestion has subsequently been
                -- reverted.  Once reverted we keep the row for history
                -- purposes but mark reverted = 1 so we can distinguish the
                -- state.
                reverted BOOLEAN DEFAULT 0,
                prev_exec_time REAL,
                new_exec_time REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (query_id) REFERENCES queries(query_id)
            )
        `);

        await this.dbHelper.exec(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_queries_unique
            ON queries(host, database, port, query);
        `);

        await this.dbHelper.exec(`
            CREATE TABLE IF NOT EXISTS query_instances (
                instance_id INTEGER PRIMARY KEY AUTOINCREMENT,
                query_id INTEGER,
                session_id TEXT,
                params TEXT,
                query_plan TEXT,
                plan_time REAL,
                exec_time REAL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (query_id) REFERENCES queries(query_id)
            )
        `);

        const num_rows = await this.dbHelper.get('SELECT COUNT(*) as count FROM queries');
        // console.log('Database initialized with', num_rows.count, 'rows');
    }

    async addQueryStats({
        sessionId,
        query,
        params,
        queryPlan,
        planTime,
        execTime,
        host,
        database,
        port
    }: {
        sessionId: string,
        query: string,
        params: string,
        queryPlan: string,
        planTime: number,
        execTime: number,
        host: string,
        database: string,
        port: number
    }): Promise<void> {
        // Insert or ignore the query grouped by host/database/port
        await this.dbHelper.run(`
            INSERT OR IGNORE INTO queries (query, host, database, port)
            VALUES (?, ?, ?, ?)
        `, [query, host, database, port]);

        // Get the query_id for this connection-specific query
        const { query_id } = await this.dbHelper.get('SELECT query_id FROM queries WHERE query = ? AND host = ? AND database = ? AND port = ?', [query, host, database, port]);

        // Insert the query instance
        await this.dbHelper.run(`
            INSERT INTO query_instances (query_id, session_id, params, query_plan, plan_time, exec_time)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [query_id, sessionId, params, queryPlan, planTime, execTime]);
    }

    async getQueryGroups({orderBy, orderDirection, queryId, host, database, port}: { orderBy: string, orderDirection: string, queryId?: number, host?: string, database?: string, port?: number}): Promise<any> {
        // Handle total_time sorting by calculating it in SQL
        const actualOrderBy = orderBy === 'total_time' ? '(avg_exec_time * num_instances)' : `qs.${orderBy}`;
        
        const filters: string[] = [];
        const params: any[] = [];

        if(host !== undefined) {
            filters.push('q.host = ?');
            params.push(host);
        }
        if(database !== undefined) {
            filters.push('q.database = ?');
            params.push(database);
        }
        if(port !== undefined) {
            filters.push('q.port = ?');
            params.push(port);
        }

        let filterSql = '';
        if(filters.length > 0) {
            filterSql = 'WHERE ' + filters.join(' AND ');
        }

        // Handle improvement ratio ordering by calculating it in SQL
        const improvementOrderBy = orderBy === 'prev_exec_time/new_exec_time' 
            ? 'CASE WHEN qs.prev_exec_time IS NOT NULL AND qs.new_exec_time IS NOT NULL THEN (qs.prev_exec_time / qs.new_exec_time) ELSE NULL END'
            : actualOrderBy;

        let results: QueryGroup[] = await this.dbHelper.all(`
WITH latest_suggestion AS (
  SELECT s1.* FROM index_suggestions s1
  INNER JOIN (
    SELECT query_id, MAX(suggestion_id) AS max_id
    FROM index_suggestions
    GROUP BY query_id
  ) s2 ON s1.query_id = s2.query_id AND s1.suggestion_id = s2.max_id
),
query_stats AS (
  SELECT
    q.query_id,
    q.query,
    q.host,
    q.database,
    q.port,
    ls.llm_response,
    ls.suggested_indexes,
    ls.applied as applied_indexes,
    ls.prev_exec_time,
    ls.new_exec_time,
    COUNT(q.query_id) AS num_instances,
    MAX(qi.exec_time) AS max_exec_time,
    MIN(qi.exec_time) AS min_exec_time,
    AVG(qi.exec_time) AS avg_exec_time
  FROM
    queries q
  JOIN
    query_instances qi ON q.query_id = qi.query_id
  LEFT JOIN latest_suggestion ls ON q.query_id = ls.query_id
  ${filters.length > 0 ? filterSql : ''}
  GROUP BY
    q.query_id, q.query, q.host, q.database, q.port, ls.llm_response, ls.suggested_indexes, ls.applied, ls.prev_exec_time, ls.new_exec_time
)
SELECT
  qs.*,
  (qs.avg_exec_time * qs.num_instances) AS total_time,
  CASE WHEN qs.prev_exec_time IS NOT NULL AND qs.new_exec_time IS NOT NULL THEN (qs.prev_exec_time / qs.new_exec_time) ELSE NULL END AS improvement_ratio
FROM query_stats qs
${queryId ? 'WHERE qs.query_id = ?' : ''}
ORDER BY
  ${improvementOrderBy} ${orderDirection === 'desc' ? 'DESC NULLS LAST' : 'ASC NULLS LAST'}${orderBy === 'prev_exec_time/new_exec_time' ? ', (qs.avg_exec_time * qs.num_instances) DESC' : ''};
        `, [...params, ...(queryId ? [queryId] : [])]);

        const query_ids = results.map(result => result.query_id);

        // Attach full suggestion history for each query so the frontend can
        // show a list if it wants to.  We also concatenate all AI responses
        // so the existing UI that displays a single text blob continues to
        // work unchanged.
        for (const res of results) {
            const suggestions = await this.getSuggestionsForQuery(res.query_id);
            // @ts-ignore – dynamic property so we don't have to change the
            // QueryGroup interface everywhere right now.
            res.suggestions = suggestions;

            if (suggestions.length > 0) {
                // Keep legacy llm_response and suggested_indexes for backward compatibility
                // but let the client format them however it wants using the suggestions array
                res.llm_response = suggestions.map((s: any) => s.llm_response || '').join('\n\n');
                res.suggested_indexes = suggestions.map((s: any) => s.suggested_indexes || '').join('\n\n');
                const latest = suggestions[0]; // because ORDER BY DESC now, latest is at the beginning
                res.applied_indexes = latest.applied ? latest.suggested_indexes : null;
                res.prev_exec_time = latest.prev_exec_time;
                res.new_exec_time = latest.new_exec_time;
            } else {
                // ensure properties exist for consistency
                res.llm_response = null;
                res.suggested_indexes = null;
                res.applied_indexes = null;
            }
        }
        const query = `
            SELECT qi.*
            FROM query_instances qi
            JOIN (
                SELECT query_id, MAX(timestamp) as max_timestamp
                FROM query_instances
                WHERE query_id IN (${query_ids.map(id => `?`).join(',')})
                GROUP BY query_id
            ) latest ON qi.query_id = latest.query_id AND qi.timestamp = latest.max_timestamp
            ORDER BY qi.query_id;

        `;

        const last_instances = await this.dbHelper.all(query, query_ids);

        for(let i = 0; i < results.length; i++) {
            const result = results[i];
            const last_instance = last_instances.find(row => row.query_id == result.query_id);
            if(last_instance) {
                results[i].last_exec_time = last_instance.exec_time;
            }
        }

        return results;
    }

    async getQueryGroup(queryId: number): Promise<any> {
        const results = await this.getQueryGroups({orderBy: 'max_exec_time', orderDirection: 'desc', queryId});

        if(results.length == 0) {
            return null;
        }
        
        const result = results[0];

        const instances = await this.dbHelper.all(`
            SELECT * FROM query_instances WHERE query_id = ? ORDER BY timestamp DESC 
        `, [queryId]);

        result.instances = instances;
        return result;
    }

    async getQueryInstances(queryId: number): Promise<any[]> {
        return this.dbHelper.all(`
            SELECT * FROM query_instances WHERE query_id = ? ORDER BY exec_time DESC
        `, [queryId]);
    }

    async getSlowestQueryInstance(queryId: number): Promise<any | null> {
        return this.dbHelper.get(`
            SELECT * FROM query_instances WHERE query_id = ? ORDER BY exec_time DESC LIMIT 1
        `, [queryId]);
    }

    async getFastestQueryInstance(queryId: number): Promise<any | null> {
        return this.dbHelper.get(`
            SELECT * FROM query_instances WHERE query_id = ? ORDER BY exec_time ASC LIMIT 1
        `, [queryId]);
    }

    async getLatestQueryInstance(queryId: number): Promise<any | null> {
        return this.dbHelper.get(`
            SELECT * FROM query_instances WHERE query_id = ? ORDER BY timestamp DESC LIMIT 1
        `, [queryId]);
    }

    async getQueryStats(queryId: number): Promise<any> {
        return this.dbHelper.get(`
            SELECT q.query_id, q.query, qi.*, q.llm_response, q.suggested_indexes, q.applied_indexes
            FROM queries q
            JOIN query_instances qi ON q.query_id = qi.query_id
            WHERE q.query_id = ?
            ORDER BY qi.timestamp DESC
            LIMIT 1
        `, [queryId]);
    }

    async getQueryStatsOrderBy(orderBy: string, direction: string = 'DESC'): Promise<any[]> {
        if (direction.toUpperCase() !== 'ASC' && direction.toUpperCase() !== 'DESC') {
            throw new Error('Invalid direction. Must be either ASC or DESC.');
        }
        return this.dbHelper.all(`
            SELECT q.query_id, q.query, qi.*, q.llm_response, q.suggested_indexes, q.applied_indexes
            FROM queries q
            JOIN query_instances qi ON q.query_id = qi.query_id
            ORDER BY qi.${orderBy} ${direction}
        `);
    }

    async getAllQueryStats(): Promise<any[]> {
        return this.dbHelper.all(`
            SELECT q.query_id, q.query, qi.*, q.llm_response, q.suggested_indexes, q.applied_indexes
            FROM queries q
            JOIN query_instances qi ON q.query_id = qi.query_id
            ORDER BY qi.timestamp DESC
        `);
    }


    async updateQueryStats(queryId: number, updates: Partial<QueryGroup>): Promise<void> {
      await this.dbHelper.run(`
        UPDATE queries SET ${Object.keys(updates).map(key => `${key} = ?`).join(', ')} WHERE query_id = ?
      `, [...Object.values(updates), queryId]);
    }

  async addSuggestion({ query_id, prompt, llm_response, suggested_indexes }: { query_id: number; prompt?: string; llm_response: string; suggested_indexes: string }) {
    // Store the suggestion in the dedicated table so we have a full history.
    await this.dbHelper.run(
      `INSERT INTO index_suggestions (query_id, prompt, llm_response, suggested_indexes)
       VALUES (?, ?, ?, ?)`,
      [query_id, prompt ?? null, llm_response, suggested_indexes]
    );

    // For backwards-compatibility with older parts of the code base (and to
    // avoid a huge refactor touching many files at once) we still update the
    // latest information on the parent row in the `queries` table.  This lets
    // existing UI that expects these columns to continue working while we
    // migrate progressively to the new data model.
    await this.dbHelper.run(
      `UPDATE queries SET llm_response = ?, suggested_indexes = ? WHERE query_id = ?`,
      [llm_response, suggested_indexes, query_id]
    );
  }
  
    async resetQueryData(): Promise<void> {
        // Delete child tables first to satisfy foreign key constraints
        await this.dbHelper.exec('DELETE FROM query_instances');
        // Also delete all saved suggestions that reference queries
        await this.dbHelper.exec('DELETE FROM index_suggestions');
        // Finally, delete queries
        await this.dbHelper.exec('DELETE FROM queries');
    }

  /* ------------------------------------------------------------------ */
  /*                       Suggestion-level helpers                     */
  /* ------------------------------------------------------------------ */

  async getSuggestionsForQuery(queryId: number): Promise<any[]> {
    return this.dbHelper.all(
      `SELECT * FROM index_suggestions WHERE query_id = ? ORDER BY created_at DESC`,
      [queryId]
    );
  }

  async getLatestSuggestion(queryId: number): Promise<any | undefined> {
    return this.dbHelper.get(
      `SELECT * FROM index_suggestions WHERE query_id = ? ORDER BY suggestion_id DESC LIMIT 1`,
      [queryId]
    );
  }

  async getLatestUnappliedSuggestion(queryId: number): Promise<any | undefined> {
    return this.dbHelper.get(
      `SELECT * FROM index_suggestions WHERE query_id = ? AND applied = 0 ORDER BY suggestion_id DESC LIMIT 1`,
      [queryId]
    );
  }

  async getLatestAppliedSuggestion(queryId: number): Promise<any | undefined> {
    return this.dbHelper.get(
      `SELECT * FROM index_suggestions WHERE query_id = ? AND applied = 1 ORDER BY suggestion_id DESC LIMIT 1`,
      [queryId]
    );
  }

  async updateSuggestion(suggestionId: number, updates: Record<string, any>): Promise<void> {
    const keys = Object.keys(updates);
    if (keys.length === 0) return;

    const sql = `UPDATE index_suggestions SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE suggestion_id = ?`;
    await this.dbHelper.run(sql, [...Object.values(updates), suggestionId]);
  }

  async markSuggestionApplied(suggestionId: number, { prev_exec_time, new_exec_time }: { prev_exec_time: number, new_exec_time: number }): Promise<void> {
    await this.updateSuggestion(suggestionId, {
      applied: 1,
      reverted: 0,
      prev_exec_time,
      new_exec_time
    });
  }

  async markSuggestionReverted(suggestionId: number): Promise<void> {
    await this.updateSuggestion(suggestionId, {
      applied: 0,
      reverted: 1
    });
  }

    async close(): Promise<void> {
        await this.dbHelper.close();
    }

    // Backward compatibility methods - delegate to dbHelper
    async get(sql: string, params?: any[]): Promise<any> {
        return this.dbHelper.get(sql, params);
    }

    async run(sql: string, params?: any[]): Promise<any> {
        return this.dbHelper.run(sql, params);
    }

    async all(sql: string, params?: any[]): Promise<any[]> {
        return this.dbHelper.all(sql, params);
    }

    async exec(sql: string): Promise<void> {
        return this.dbHelper.exec(sql);
    }
}