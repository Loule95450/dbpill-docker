import { Client } from 'pg';

export interface QueryAnalysis {
  query: string;
  parameters: any[];
  explainAnalyze: any;
  lastExecutionTime: Date;
}

export class StatsManager {
  private analysisStore: Map<string, QueryAnalysis> = new Map();
  private client: Client;

  constructor(connectionString: string) {
    this.client = new Client(connectionString);
    this.client.connect();
  }

  async analyzeQuery(query: string, parameters: any[]): Promise<void> {
    // Replace $1, $2, etc. with actual parameter values
    let parameterizedQuery = query;
    parameters.forEach((param, index) => {
      parameterizedQuery = parameterizedQuery.replace(`$${index + 1}`, typeof param === 'string' ? `'${param}'` : param);
    });

    const explainQuery = `EXPLAIN (ANALYZE, VERBOSE, FORMAT JSON) ${parameterizedQuery}`;
    try {
      const result = await this.client.query(explainQuery);
      const analysis: QueryAnalysis = {
        query,
        parameters,
        explainAnalyze: result.rows[0]['QUERY PLAN'][0],
        lastExecutionTime: new Date(),
      };
      this.analysisStore.set(query, analysis);
      console.log('Query analysis stored:', query);
    } catch (error) {
      console.error('Error analyzing query:', error);
    }
  }

  getAnalysis(query: string): QueryAnalysis | undefined {
    return this.analysisStore.get(query);
  }

  getAllAnalyses(): Map<string, QueryAnalysis> {
    return this.analysisStore;
  }
}