export class ChannelBindingNotFoundError extends Error {
  constructor(channelConfigId: string) {
    super(
      `[AgentResolver] No active ChannelBinding found for ` +
      `channelConfigId="${channelConfigId}". ` +
      `Create at least one ChannelBinding via POST /channels/:id/bindings.`
    )
    this.name = 'ChannelBindingNotFoundError'
  }
}

export class ChannelConfigInactiveError extends Error {
  constructor(channelConfigId: string) {
    super(
      `[AgentResolver] ChannelConfig "${channelConfigId}" is not active (isActive=false). ` +
      `Activate it first via PATCH /channels/:id.`
    )
    this.name = 'ChannelConfigInactiveError'
  }
}

export class AmbiguousBindingError extends Error {
  readonly candidates: string[]
  constructor(channelConfigId: string, agentIds: string[]) {
    super(
      `[AgentResolver] Multiple ChannelBindings found for ` +
      `channelConfigId="${channelConfigId}" with the same scope priority ` +
      `and none marked isDefault=true. ` +
      `Candidates: ${agentIds.join(', ')}. ` +
      `Set isDefault=true on one binding to resolve.`
    )
    this.name = 'AmbiguousBindingError'
    this.candidates = agentIds
  }
}
