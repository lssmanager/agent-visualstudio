// core-types/src/index.ts — barrel
// fix(tsc): agregar RunStepSpec a las exportaciones públicas

export * from './agent-spec';
export * from './flow-spec';
export * from './run-spec';  // exporta RunStep, RunStepSpec, RunSpec, RunStatus, StepStatus, RunTrigger
export * from './skill-spec';
export * from './tool-spec';
export * from './hook-spec';
export * from './policy-spec';
export * from './policy-scope';
export * from './profile-spec';
export * from './workspace-config';
export * from './workspace-spec';
export * from './routine-spec';
export * from './command-spec';
export * from './deployable-artifact';
export * from './effective-config';
export * from './version-snapshot';
export * from './studio-canonical';
export * from './canonical-studio-state';
export * from './model-catalog.types';
export * from './cost-table';
