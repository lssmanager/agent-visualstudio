import path from 'node:path';

import { DualFormatStore, type StoreFormat } from '../../../packages/workspace-store/src';

export const studioConfig = {
  port: Number(process.env.STUDIO_API_PORT ?? process.env.PORT ?? 3400),
  apiPrefix: process.env.STUDIO_API_PREFIX ?? '/api/studio/v1',
  gatewayBaseUrl: process.env.GATEWAY_ADAPTER_URL ?? 'http://localhost:3000/api',
  workspaceRoot: process.env.OPENCLAW_WORKSPACE_ROOT ?? path.resolve(process.cwd()),
  storeFormat: (process.env.WORKSPACE_STORE_FORMAT ?? 'json') as StoreFormat,
};

/**
 * Shared store instance — all repositories should use this instead of
 * constructing their own JsonFileStore. The format is controlled by
 * the WORKSPACE_STORE_FORMAT env variable (default: 'json').
 */
export const workspaceStore = new DualFormatStore(
  studioConfig.workspaceRoot,
  studioConfig.storeFormat,
);
