import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';


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
    last_exec_time: number;
    hidden?: boolean;
}

export class QueryLogger {
    private db: Database<sqlite3.Database> | null = null;

    constructor(private dbPath: string) {
        this.initialize();
    }

    async initialize(): Promise<void> {
        this.db = await open({
            filename: this.dbPath,
            driver: sqlite3.Database
        });

        await this.exec(`
            CREATE TABLE IF NOT EXISTS queries (
                query_id INTEGER PRIMARY KEY AUTOINCREMENT,
                query TEXT UNIQUE,
                llm_response TEXT,
                suggested_indexes TEXT,
                applied_indexes TEXT,
                prev_exec_time REAL,
                new_exec_time REAL,
                hidden BOOLEAN DEFAULT 0
            )
        `);

        await this.exec(`
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

        const num_rows = await this.get('SELECT COUNT(*) as count FROM queries');
        console.log('Database initialized with', num_rows.count, 'rows');
    }

    private checkDb(): void {
        if (!this.db) {
            throw new Error('Database not initialized. Call initialize() first.');
        }
    }

    async exec(sql: string): Promise<void> {
        this.checkDb();
        return this.db!.exec(sql);
    }

    async run(sql: string, params?: any[]): Promise<any> {
        this.checkDb();
        return this.db!.run(sql, params);
    }

    async get(sql: string, params?: any[]): Promise<any> {
        this.checkDb();
        return this.db!.get(sql, params);
    }

    async all(sql: string, params?: any[]): Promise<any[]> {
        this.checkDb();
        return this.db!.all(sql, params);
    }

    async addQueryStats({
        sessionId,
        query,
        params,
        queryPlan,
        planTime,
        execTime
    }: {
        sessionId: string,
        query: string,
        params: string,
        queryPlan: string,
        planTime: number,
        execTime: number
    }): Promise<void> {
          // Insert or ignore the query
          await this.run(`
              INSERT OR IGNORE INTO queries (query)
              VALUES (?)
          `, [query]);

          // Get the query_id
          const { query_id } = await this.get('SELECT query_id FROM queries WHERE query = ?', [query]);

          // Insert the query instance
          await this.run(`
              INSERT INTO query_instances (query_id, session_id, params, query_plan, plan_time, exec_time)
              VALUES (?, ?, ?, ?, ?, ?)
          `, [query_id, sessionId, params, queryPlan, planTime, execTime]);

    }

    async getQueryGroups({orderBy, orderDirection}: { orderBy: string, orderDirection: string}): Promise<any> {
        const results: QueryGroup[] = await this.all(`
            WITH query_stats AS (
                SELECT
                    q.query_id,
                    q.query,
                    q.llm_response,
                    q.suggested_indexes,
                    q.applied_indexes,
                    q.prev_exec_time,
                    q.new_exec_time,
                    COUNT(qi.instance_id) AS num_instances,
                    MAX(qi.exec_time) AS max_exec_time,
                    MIN(qi.exec_time) AS min_exec_time,
                    AVG(qi.exec_time) AS avg_exec_time,
                    FIRST_VALUE(qi.exec_time) OVER (PARTITION BY q.query_id ORDER BY qi.instance_id DESC) AS last_exec_time

                FROM
                    queries q
                JOIN
                    query_instances qi ON q.query_id = qi.query_id
                WHERE NOT q.hidden
                GROUP BY
                    q.query_id, q.query
            ),
            max_exec_query AS (
                SELECT
                    query_id,
                    query,
                    max_exec_time
                FROM
                    query_stats
                ORDER BY
                    max_exec_time DESC
                LIMIT 1
            )
            SELECT
                qs.query_id,
                qs.query,
                qs.max_exec_time,
                qs.min_exec_time,
                qs.avg_exec_time,
                qs.prev_exec_time,
                qs.new_exec_time,
                qs.last_exec_time,
                qs.llm_response,
                qs.suggested_indexes,
                qs.applied_indexes,
                qs.num_instances
            FROM
                query_stats qs
            LEFT JOIN
                max_exec_query meq ON qs.query_id = meq.query_id
            LEFT JOIN
                query_instances qi ON qs.query_id = qi.query_id AND qs.max_exec_time = qi.exec_time
            ORDER BY
                qs.${orderBy} ${orderDirection};
        `);
        return results;
    }

    async getQueryGroup(queryId: number): Promise<any> {
        const results = await this.get(`
            WITH query_stats AS (
                SELECT
                    q.query_id,
                    q.query,
                    q.llm_response,
                    q.suggested_indexes,
                    q.applied_indexes,
                    q.prev_exec_time,
                    q.new_exec_time,
                    COUNT(qi.instance_id) AS num_instances,
                    MAX(qi.exec_time) AS max_exec_time,
                    MIN(qi.exec_time) AS min_exec_time,
                    AVG(qi.exec_time) AS avg_exec_time,
                    FIRST_VALUE(qi.exec_time) OVER (PARTITION BY q.query_id ORDER BY qi.instance_id DESC) AS last_exec_time
                FROM
                    queries q
                JOIN
                    query_instances qi ON q.query_id = qi.query_id
                GROUP BY
                    q.query_id, q.query
            )
            SELECT
                qs.query_id,
                qs.query,
                qs.max_exec_time,
                qs.min_exec_time,
                qs.avg_exec_time,
                qs.prev_exec_time,
                qs.new_exec_time,
                qs.last_exec_time,
                qs.llm_response,
                qs.suggested_indexes,
                qs.applied_indexes,
                qs.num_instances
            FROM
                query_stats qs
            LEFT JOIN
                query_instances qi ON qs.query_id = qi.query_id AND qs.max_exec_time = qi.exec_time
            WHERE
                qs.query_id = ?
            ORDER BY
                qs.max_exec_time DESC
        `, [queryId]);

        const instances = await this.all(`
            SELECT * FROM query_instances WHERE query_id = ? ORDER BY timestamp DESC LIMIT 20 
        `, [queryId]);

        results.instances = instances;
        return results;
    }

    async getQueryInstances(queryId: number): Promise<any[]> {
        return this.all(`
            SELECT * FROM query_instances WHERE query_id = ? ORDER BY exec_time DESC
        `, [queryId]);
    }

    async getQueryStats(queryId: number): Promise<any> {
        return this.get(`
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
        return this.all(`
            SELECT q.query_id, q.query, qi.*, q.llm_response, q.suggested_indexes, q.applied_indexes
            FROM queries q
            JOIN query_instances qi ON q.query_id = qi.query_id
            ORDER BY qi.${orderBy} ${direction}
        `);
    }

    async getAllQueryStats(): Promise<any[]> {
        return this.all(`
            SELECT q.query_id, q.query, qi.*, q.llm_response, q.suggested_indexes, q.applied_indexes
            FROM queries q
            JOIN query_instances qi ON q.query_id = qi.query_id
            ORDER BY qi.timestamp DESC
        `);
    }


    async updateQueryStats(queryId: number, updates: Partial<QueryGroup>): Promise<void> {
      await this.run(`
        UPDATE queries SET ${Object.keys(updates).map(key => `${key} = ?`).join(', ')} WHERE query_id = ?
      `, [...Object.values(updates), queryId]);
    }

  async addSuggestion({ query_id, llm_response, suggested_indexes }: { query_id: number, llm_response: string, suggested_indexes: string }) {
    await this.run(`
      UPDATE queries SET llm_response = ?, suggested_indexes = ? WHERE query_id = ?
    `, [llm_response, suggested_indexes, query_id]);
  }
  

    async close(): Promise<void> {
        if (this.db) {
            await this.db.close();
            this.db = null;
        }
    }
}