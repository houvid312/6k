import React, { createContext, useContext } from 'react';
import { container } from './container';

type Container = typeof container;

const DIContext = createContext<Container>(container);

export function DIProvider({ children }: { children: React.ReactNode }) {
  return <DIContext.Provider value={container}>{children}</DIContext.Provider>;
}

export function useDI(): Container {
  return useContext(DIContext);
}
