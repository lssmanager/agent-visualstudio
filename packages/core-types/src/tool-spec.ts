export interface ToolFunctionSpec {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface ToolPluginMetadata {
  provider: string;
  pluginId: string;
  displayName?: string;
  version?: string;
}

export interface ToolSpec {
  id: string;
  name: string;
  description: string;
  version: string;
  category: string;
  permissions: string[];
  functions: ToolFunctionSpec[];
  plugin?: ToolPluginMetadata;
  files?: string[];
  dependencies?: string[];
  createdAt?: string;
  updatedAt?: string;
}
