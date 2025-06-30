import { createContext, useState, useEffect, ReactNode } from 'react';

interface LLMConfig {
  id: number;
  llm_endpoint: string;
  llm_model: string;
  llm_api_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppContextShape {
  args: any;
  config: LLMConfig | null;
  updateConfig: (newConfig: Partial<LLMConfig>) => Promise<void>;
}

export const AppContext = createContext<AppContextShape>({ 
  args: {}, 
  config: null,
  updateConfig: async () => {}
});

export function AppProvider({ children, args }: { children: ReactNode; args: any }) {
  const [config, setConfig] = useState<LLMConfig | null>(null);

  const loadConfig = async () => {
    try {
      const response = await fetch('/api/config');
      const data = await response.json();
      setConfig(data);
    } catch (error) {
      console.error('Error loading config:', error);
    }
  };

  const updateConfig = async (newConfig: Partial<LLMConfig>) => {
    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newConfig),
      });

      if (!response.ok) {
        throw new Error('Failed to update configuration');
      }

      const updatedConfig = await response.json();
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