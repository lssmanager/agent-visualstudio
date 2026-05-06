/**
 * flow-engine — public exports
 */

// Provider interface + implementations
export type {
  ILLMProvider,
  LLMMessage,
  LLMMessageRole,
  LLMToolCall,
  LLMCallOptions,
  LLMCallResult,
  LLMTokenUsage,
  OpenAILLMProviderConfig,
} from './llm-provider'
export { OpenAILLMProvider } from './llm-provider'

// Model policy resolver
export type {
  ResolveModelInput,
  ResolvedModel,
} from './model-policy-resolver'
export { ModelPolicyResolver } from './model-policy-resolver'

// Step executor
export type {
  LLMStepExecutorConfig,
  StepExecutionContext,
  StepExecutionResult,
} from './llm-step-executor'
export { LLMStepExecutor } from './llm-step-executor'

// Flow execution
export { FlowExecutor } from './flow-executor'

// Flow compiler — exports functions (not a class); FlowCompiler alias kept for
// backwards-compat with any code that imported it as a namespace.
export type { CompiledFlow } from './flow-compiler'
export { compileFlow, compileFlows } from './flow-compiler'

// Tool call loop
export { runToolCallLoop } from './tool-call-loop'

// Channel adapter
export { OpenClawChannelAdapter } from './openclaw-channel-adapter'
