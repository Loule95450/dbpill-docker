import { DatabaseHelper } from './database_helper';

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
    private dbHelper: DatabaseHelper;

    constructor(private dbPath: string) {
        this.dbHelper = new DatabaseHelper(dbPath);
        this.initialize();
    }

    async initialize(): Promise<void> {
        await this.dbHelper.initialize();

        await this.dbHelper.exec(`
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
        await this.dbHelper.exec(`
            CREATE TABLE IF NOT EXISTS api_keys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                vendor TEXT NOT NULL UNIQUE,
                api_key TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Ensure we have at least one config row
        const existingConfig = await this.dbHelper.get('SELECT COUNT(*) as count FROM configs');
        if (existingConfig.count === 0) {
            await this.dbHelper.run(`
                INSERT INTO configs (llm_endpoint, llm_model, llm_api_key)
                VALUES ('anthropic', 'claude-sonnet-4', NULL)
            `);
        }
    }

    async getConfig(): Promise<LLMConfig> {
        const config = await this.dbHelper.get('SELECT * FROM configs ORDER BY updated_at DESC LIMIT 1');
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
        await this.dbHelper.run(`
            UPDATE configs 
            SET llm_endpoint = ?, llm_model = ?, llm_api_key = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = (SELECT id FROM configs ORDER BY updated_at DESC LIMIT 1)
        `, [llm_endpoint, llm_model, llm_api_key]);
    }

    async getApiKeys(): Promise<VendorApiKeys> {
        const keys = await this.dbHelper.all('SELECT vendor, api_key FROM api_keys');
        const result: VendorApiKeys = {};
        
        keys.forEach((key: any) => {
            result[key.vendor as keyof VendorApiKeys] = key.api_key;
        });
        
        return result;
    }

    async updateApiKey(vendor: string, apiKey: string | null): Promise<void> {
        if (apiKey === null || apiKey === '') {
            // Delete the key if null or empty
            await this.dbHelper.run('DELETE FROM api_keys WHERE vendor = ?', [vendor]);
        } else {
            // Upsert the key
            await this.dbHelper.run(`
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
        const result = await this.dbHelper.get('SELECT api_key FROM api_keys WHERE vendor = ?', [vendor]);
        return result?.api_key || null;
    }

    async close(): Promise<void> {
        await this.dbHelper.close();
    }
} 