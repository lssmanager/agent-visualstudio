export { N8nService }  from './n8n.service';
export { N8nClient }   from './n8n-client';

export type {
  N8nServiceConfig,
  TriggerWorkflowOptions,
  TriggerWorkflowResult,
  CreateWorkflowOptions,
  CreateWorkflowResult,
  N8nWorkflowNodeDefinition,
  N8nWorkflowConnection,
} from './n8n.service';

export type {
  N8nClientConfig,
  N8nExecutionResult,
  N8nWorkflowExecuteResponse,
} from './n8n-client';

export type {
  SyncResult,
  N8nPrismaClient,
  N8nWorkflowDto,
  N8nApiListResponse,
} from './n8n.types';
