interface VendorApiKeys {
  anthropic?: string;
  openai?: string;
  xai?: string;
  google?: string;
}

interface LLMConfig {
  id: number;
  llm_endpoint: string;
  llm_model: string;
  llm_api_key: string | null;
  created_at: string;
  updated_at: string;
  apiKeys?: VendorApiKeys;
}

interface QueryGroup {
  query_id: number;
  query: string;
  avg_exec_time: number;
  total_time: number;
  max_exec_time: number;
  min_exec_time: number;
  last_exec_time: number;
  num_instances: number;
  llm_response?: string;
  suggested_indexes?: string;
  applied_indexes?: string;
  prev_exec_time?: number;
  new_exec_time?: number;
  hidden?: boolean;
  instances?: any[];
  prompt_preview?: string;
  suggestions?: any[];
}

interface QueryStatsResponse {
  stats: QueryGroup[];
  orderBy: string;
  orderDirection: string;
}

// Base fetch wrapper with error handling
async function apiRequest<T>(
  endpoint: string, 
  options: RequestInit = {}
): Promise<T> {
  const defaultOptions: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  const response = await fetch(endpoint, defaultOptions);
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Network error' }));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// Configuration API
export const configApi = {
  async getConfig(): Promise<LLMConfig> {
    return apiRequest<LLMConfig>('/api/config');
  },

  async updateConfig(config: Partial<LLMConfig>): Promise<LLMConfig> {
    return apiRequest<LLMConfig>('/api/config', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  },
};

// Query API
export const queryApi = {
  async getAllQueries(orderBy: string = 'avg_exec_time', orderDirection: string = 'desc'): Promise<QueryStatsResponse> {
    return apiRequest<QueryStatsResponse>(`/api/all_queries?orderBy=${orderBy}&direction=${orderDirection}`);
  },

  async getQuery(queryId: string | number, instanceType?: 'slowest' | 'fastest' | 'latest'): Promise<QueryGroup> {
    const params = instanceType ? `?instance_type=${instanceType}` : '';
    return apiRequest<QueryGroup>(`/api/query/${queryId}${params}`);
  },

  async analyzeQuery(queryId: string | number): Promise<QueryGroup> {
    return apiRequest<QueryGroup>(`/api/analyze_query?query_id=${queryId}`);
  },

  async analyzeQueryWithParams(queryId: string | number, params: string): Promise<QueryGroup> {
    const encodedParams = encodeURIComponent(params);
    return apiRequest<QueryGroup>(`/api/analyze_query_with_params?query_id=${queryId}&params=${encodedParams}`);
  },

  async getSuggestions(queryId: string | number, prompt?: string): Promise<QueryGroup> {
    const body: Record<string, any> = { query_id: queryId };
    if (prompt !== undefined) {
      body.prompt = prompt;
    }

    return apiRequest<QueryGroup>('/api/suggest', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async saveEditedIndexes(queryId: string | number, editedIndexes: string, suggestionId?: string | number): Promise<QueryGroup> {
    const requestBody: any = { 
      query_id: queryId, 
      suggested_indexes: editedIndexes 
    };
    
    if (suggestionId) {
      requestBody.suggestion_id = suggestionId;
    }
    
    return apiRequest<QueryGroup>('/api/save_edited_indexes', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });
  },

  async createManualSuggestion(queryId: string | number): Promise<QueryGroup> {
    return apiRequest<QueryGroup>('/api/create_manual_suggestion', {
      method: 'POST',
      body: JSON.stringify({ query_id: queryId }),
    });
  },

  async deleteSuggestion(suggestionId: string | number): Promise<QueryGroup> {
    return apiRequest<QueryGroup>(`/api/suggestion/${suggestionId}`, {
      method: 'DELETE',
    });
  },

  async applySuggestions(queryId: string | number, suggestionId?: string | number): Promise<QueryGroup> {
    const url = suggestionId 
      ? `/api/apply_suggestions?query_id=${queryId}&suggestion_id=${suggestionId}`
      : `/api/apply_suggestions?query_id=${queryId}`;
    return apiRequest<QueryGroup>(url);
  },

  async revertSuggestions(queryId: string | number, suggestionId?: string | number): Promise<QueryGroup> {
    const url = suggestionId 
      ? `/api/revert_suggestions?query_id=${queryId}&suggestion_id=${suggestionId}`
      : `/api/revert_suggestions?query_id=${queryId}`;
    return apiRequest<QueryGroup>(url);
  },

  async getRelevantTables(queryId: string | number): Promise<Record<string, { table_size_bytes: number; estimated_rows: number; table_definition: string }>> {
    return apiRequest(`/api/relevant_tables?query_id=${queryId}`);
  },

  async ignoreQuery(queryId: string | number): Promise<QueryGroup> {
    return apiRequest<QueryGroup>(`/api/ignore_query?query_id=${queryId}`);
  },
};

// Admin/maintenance API
export const adminApi = {
  async resetQueryLogs(): Promise<{ success: boolean; message: string }> {
    return apiRequest<{ success: boolean; message: string }>('/api/reset_query_logs', {
      method: 'POST',
    });
  },

  async revertAllSuggestions(): Promise<any[]> {
    return apiRequest<any[]>('/api/revert_all_suggestions');
  },

  async getAllAppliedIndexes(): Promise<any[]> {
    return apiRequest<any[]>('/api/get_all_applied_indexes');
  },
};

// Export all APIs as a single object for convenience
export const httpApi = {
  config: configApi,
  query: queryApi,
  admin: adminApi,
}; 