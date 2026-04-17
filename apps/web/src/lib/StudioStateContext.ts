import { createContext, useContext } from 'react';
import { StudioStateResponse } from './types';

interface StudioStateContextValue {
  state: StudioStateResponse;
  refresh: () => Promise<void>;
}

export const StudioStateContext = createContext<StudioStateContextValue | null>(null);

export function useStudioState(): StudioStateContextValue {
  const ctx = useContext(StudioStateContext);
  if (!ctx) throw new Error('useStudioState must be used inside StudioStateContext.Provider');
  return ctx;
}
