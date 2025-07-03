import { createRequire } from 'node:module';

// Load better-sqlite3 at runtime following the same pattern as QueryLogger
const localRequire = createRequire(__filename);
const BetterSqlite: typeof import('better-sqlite3') = localRequire('better-sqlite3');

type BetterSqliteDatabase = import('better-sqlite3').Database;
type Statement = import('better-sqlite3').Statement;

export interface LLMConfig {
    id: number;
    llm_endpoint: string;
    llm_model: string;
    llm_api_key: string | null;
    created_at: string;
    updated_at: string;
}

export interface ApiKey {
    id: number;
    vendor: string;
    api_key: string;
    created_at: string;
    updated_at: string;
}

export interface VendorApiKeys {
    anthropic?: string;
    openai?: string;
    xai?: string;
    google?: string;
}

export class ConfigManager {
    private db: BetterSqliteDatabase | null = null;

    constructor(private dbPath: string) {
        this.initialize();
    }

    async initialize(): Promise<void> {
        this.db = new BetterSqlite(this.dbPath, { verbose: undefined });

        await this.exec(`
            CREATE TABLE IF NOT EXISTS configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                llm_endpoint TEXT NOT NULL DEFAULT 'anthropic',
                llm_model TEXT NOT NULL DEFAULT 'claude-sonnet-4',
                llm_api_key TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create API keys table for vendor-specific keys
        await this.exec(`
            CREATE TABLE IF NOT EXISTS api_keys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                vendor TEXT NOT NULL UNIQUE,
                api_key TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Ensure we have at least one config row
        const existingConfig = await this.get('SELECT COUNT(*) as count FROM configs');
        if (existingConfig.count === 0) {
            await this.run(`
                INSERT INTO configs (llm_endpoint, llm_model, llm_api_key)
                VALUES ('anthropic', 'claude-sonnet-4', NULL)
            `);
        }
    }

    private checkDb(): void {
        if (!this.db) {
            throw new Error('ConfigManager database not initialized. Call initialize() first.');
        }
    }

    async exec(sql: string): Promise<void> {
        this.checkDb();
        this.db!.exec(sql);
    }

    async run(sql: string, params?: any[]): Promise<any> {
        this.checkDb();
        const stmt: Statement = this.db!.prepare(sql);
        const result = params ? stmt.run(params) : stmt.run();
        return result;
    }

    async get(sql: string, params?: any[]): Promise<any> {
        this.checkDb();
        const stmt: Statement = this.db!.prepare(sql);
        const row = params ? stmt.get(params) : stmt.get();
        return row;
    }

    async all(sql: string, params?: any[]): Promise<any[]> {
        this.checkDb();
        const stmt: Statement = this.db!.prepare(sql);
        const rows = params ? stmt.all(params) : stmt.all();
        return rows;
    }

    async getConfig(): Promise<LLMConfig> {
        const config = await this.get('SELECT * FROM configs ORDER BY updated_at DESC LIMIT 1');
        return config;
    }

    async updateConfig({
        llm_endpoint,
        llm_model,
        llm_api_key
    }: {
        llm_endpoint: string;
        llm_model: string;
        llm_api_key: string | null;
    }): Promise<void> {
        await this.run(`
            UPDATE configs 
            SET llm_endpoint = ?, llm_model = ?, llm_api_key = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = (SELECT id FROM configs ORDER BY updated_at DESC LIMIT 1)
        `, [llm_endpoint, llm_model, llm_api_key]);
    }

    async getApiKeys(): Promise<VendorApiKeys> {
        const keys = await this.all('SELECT vendor, api_key FROM api_keys');
        const result: VendorApiKeys = {};
        
        keys.forEach((key: any) => {
            result[key.vendor as keyof VendorApiKeys] = key.api_key;
        });
        
        return result;
    }

    async updateApiKey(vendor: string, apiKey: string | null): Promise<void> {
        if (apiKey === null || apiKey === '') {
            // Delete the key if null or empty
            await this.run('DELETE FROM api_keys WHERE vendor = ?', [vendor]);
        } else {
            // Upsert the key
            await this.run(`
                INSERT INTO api_keys (vendor, api_key, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(vendor) DO UPDATE SET
                    api_key = excluded.api_key,
                    updated_at = excluded.updated_at
            `, [vendor, apiKey]);
        }
    }

    async updateApiKeys(apiKeys: VendorApiKeys): Promise<void> {
        for (const [vendor, apiKey] of Object.entries(apiKeys)) {
            await this.updateApiKey(vendor, apiKey || null);
        }
    }

    async getApiKeyForVendor(vendor: string): Promise<string | null> {
        const result = await this.get('SELECT api_key FROM api_keys WHERE vendor = ?', [vendor]);
        return result?.api_key || null;
    }

    async close(): Promise<void> {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
} 