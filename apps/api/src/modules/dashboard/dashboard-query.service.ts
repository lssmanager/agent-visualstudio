/**
 * @deprecated F0-07
 * DashboardQueryService fue reemplazado por DashboardService.
 * Este archivo solo re-exporta para no romper imports existentes.
 */
export { DashboardService as DashboardQueryService } from './dashboard.service'
export type {
  KpiResult,
  TimelineBucket,
  TokenBucket,
  ModelMixRow,
  LatencyResult,
  RuntimeState,
  RecentRunRow,
  AlertItem,
  BudgetRow,
  PatchPolicyInput,
  TimelineQuery,
} from './dashboard.service'
