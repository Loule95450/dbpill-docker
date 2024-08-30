import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

export class QueryLogger {
  private db: Database<sqlite3.Database> | null = null;

  constructor(private dbPath: string) {}

  async initialize(): Promise<void> {
    this.db = await open({
      filename: this.dbPath,
      driver: sqlite3.Database
    });
    await this.exec(`
      CREATE TABLE IF NOT EXISTS queries (
        query_id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        query TEXT,
        params TEXT,
        query_plan TEXT,
        plan_time REAL,
        exec_time REAL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
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
    await this.run(`
      INSERT INTO queries (session_id, query, params, query_plan, plan_time, exec_time)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [sessionId, query, params, queryPlan, planTime, execTime]);
  }

  async getQueryStats(queryId: number): Promise<any> {
    return this.get('SELECT * FROM queries WHERE query_id = ?', [queryId]);
  }

  async getQueryStatsOrderBy(orderBy: string, direction: string = 'DESC'): Promise<any[]> {
    if (direction.toUpperCase() !== 'ASC' && direction.toUpperCase() !== 'DESC') {
      throw new Error('Invalid direction. Must be either ASC or DESC.');
    }
    return this.all(`SELECT * FROM queries ORDER BY ${orderBy} ${direction}`);
  }

  async getAllQueryStats(): Promise<any[]> {
    return this.all('SELECT * FROM queries ORDER BY timestamp DESC');
  }

  async getSlowQueries(): Promise<any[]> {
    return this.all(`
      WITH query_stats AS (
        SELECT 
          query,
          MAX(exec_time) AS max_exec_time,
          MIN(exec_time) AS min_exec_time,
          AVG(exec_time) AS avg_exec_time
        FROM 
          queries
        GROUP BY 
          query
        HAVING 
          AVG(exec_time) > 2
      ),
      max_exec_query AS (
        SELECT 
          query,
          max_exec_time
        FROM 
          query_stats
        ORDER BY 
          max_exec_time DESC
        LIMIT 1
      )
      SELECT 
        qs.query,
        qs.max_exec_time,
        qs.min_exec_time,
        qs.avg_exec_time,
        q.query_id,
        q.query_plan,
        q.params
      FROM 
        query_stats qs
      LEFT JOIN 
        max_exec_query meq ON qs.query = meq.query
      LEFT JOIN 
        queries q ON qs.query = q.query AND qs.max_exec_time = q.exec_time
      ORDER BY 
        qs.avg_exec_time DESC;  
          
    `);
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }
}