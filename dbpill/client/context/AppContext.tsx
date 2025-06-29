import { createContext } from 'react';

export interface AppContextShape {
  args: any;
}

export const AppContext = createContext<AppContextShape>({ args: {} }); 