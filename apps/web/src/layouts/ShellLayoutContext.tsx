import { createContext, useContext, type ReactNode } from 'react';

interface ShellLayoutContextValue {
  hierarchyCollapsed: boolean;
  setHierarchyCollapsed: (value: boolean) => void;
  inspectorCollapsed: boolean;
  setInspectorCollapsed: (value: boolean) => void;
  inspectorWidth: number;
  setInspectorWidth: (value: number) => void;
  focusMode: boolean;
  setFocusMode: (value: boolean) => void;
}

const ShellLayoutContext = createContext<ShellLayoutContextValue | null>(null);

export function ShellLayoutProvider({
  value,
  children,
}: {
  value: ShellLayoutContextValue;
  children: ReactNode;
}) {
  return <ShellLayoutContext.Provider value={value}>{children}</ShellLayoutContext.Provider>;
}

export function useShellLayout() {
  const context = useContext(ShellLayoutContext);
  if (!context) {
    throw new Error('useShellLayout must be used within ShellLayoutProvider');
  }
  return context;
}
