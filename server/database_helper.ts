import { Client } from 'pg';
import args from 'server/args';

// We import `node:sqlite` lazily inside `initialize()` so that the module can
// set up any warning-suppression logic **before** Node executes the
// experimental SQLite code path.
// eslint-disable-next-line @typescript-eslint/ban-types
type NodeSqliteDatabase = any;
type Statement = any;

// Test initial database connectivity and log the outcome
export async function testDbConnection(connectionString: string): Promise<void> {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    await client.query('SELECT 1');
    console.log(`Database connection successful. Starting proxy on port ${args.proxyPort}\n`);
  } catch (error) {
    console.error(`❌ Failed to connect to database: ${connectionString}`);
    console.error(error);
  } finally {
    try { await client.end(); } catch (_) { /* ignore */ }
  }
}

export class DatabaseHelper {
    private db: NodeSqliteDatabase | null = null;

    constructor(private dbPath: string) {
        this.initialize();
    }

    async initialize(): Promise<void> {
        // Lazily require the experimental built-in so callers can install any
        // warning filters (e.g. process.emitWarning override) beforehand.
        if (!this.db) {
            const { DatabaseSync } = await import('node:sqlite');
            this.db = new DatabaseSync(this.dbPath);
        }
    }

    private checkDb(): void {
        if (!this.db) {
            throw new Error('Database not initialized. Call initialize() first.');
        }
    }

    async exec(sql: string): Promise<void> {
        this.checkDb();
        this.db!.exec(sql);
    }

    async run(sql: string, params?: any[]): Promise<any> {
        this.checkDb();
        const stmt: Statement = this.db!.prepare(sql);
        const result = params ? stmt.run(...params) : stmt.run();
        return result;
    }

    async get(sql: string, params?: any[]): Promise<any> {
        this.checkDb();
        const stmt: Statement = this.db!.prepare(sql);
        const row = params ? stmt.get(...params) : stmt.get();
        return row;
    }

    async all(sql: string, params?: any[]): Promise<any[]> {
        this.checkDb();
        const stmt: Statement = this.db!.prepare(sql);
        const rows = params ? stmt.all(...params) : stmt.all();
        return rows;
    }

    async close(): Promise<void> {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
} 