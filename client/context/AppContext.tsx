import { createContext, useState, useEffect, ReactNode } from 'react';
import { configApi } from '../utils/HttpApi';

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

export interface AppContextShape {
  args: any;
  config: LLMConfig | null;
  updateConfig: (newConfig: Partial<LLMConfig>) => Promise<LLMConfig>;
}

export const AppContext = createContext<AppContextShape>({ 
  args: {}, 
  config: null,
  updateConfig: async () => ({} as LLMConfig)
});

export function AppProvider({ children, args }: { children: ReactNode; args: any }) {
  const [config, setConfig] = useState<LLMConfig | null>(null);

  const loadConfig = async () => {
    try {
      const data = await configApi.getConfig();
      setConfig(data);
    } catch (error) {
      console.error('Error loading config:', error);
    }
  };

  const updateConfig = async (newConfig: Partial<LLMConfig>) => {
    try {
      const updatedConfig = await configApi.updateConfig(newConfig);
      setConfig(updatedConfig);
      return updatedConfig;
    } catch (error) {
      console.error('Error updating config:', error);
      throw error;
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  return (
    <AppContext.Provider value={{ args, config, updateConfig }}>
      {children}
    </AppContext.Provider>
  );
} 