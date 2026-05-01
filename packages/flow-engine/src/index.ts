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
} from './llm-provider.js'
export { OpenAILLMProvider } from './llm-provider.js'

// Model policy resolver
export type {
  ResolveModelInput,
  ResolvedModel,
} from './model-policy-resolver.js'
export { ModelPolicyResolver } from './model-policy-resolver.js'

// Step executor
export type {
  LLMStepExecutorConfig,
  StepExecutionContext,
  StepExecutionResult,
} from './llm-step-executor.js'
export { LLMStepExecutor } from './llm-step-executor.js'

// Flow execution
export { FlowExecutor } from './flow-executor.js'

// Flow compiler — exports functions (not a class); FlowCompiler alias kept for
// backwards-compat with any code that imported it as a namespace.
export type { CompiledFlow } from './flow-compiler.js'
export { compileFlow, compileFlows } from './flow-compiler.js'

// Tool call loop
export { runToolCallLoop } from './tool-call-loop.js'

// Channel adapter
export { OpenClawChannelAdapter } from './openclaw-channel-adapter.js'
