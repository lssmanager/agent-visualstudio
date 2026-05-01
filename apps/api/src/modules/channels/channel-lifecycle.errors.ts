export class ChannelNotFoundError extends Error {
  constructor(channelConfigId: string) {
    super(`[ChannelLifecycle] ChannelConfig "${channelConfigId}" not found.`)
    this.name = 'ChannelNotFoundError'
  }
}

export class InvalidTransitionError extends Error {
  constructor(
    channelConfigId: string,
    from: string,
    to: string,
  ) {
    super(
      `[ChannelLifecycle] Cannot transition channel "${channelConfigId}" ` +
      `from status="${from}" to "${to}". ` +
      `Check allowed transitions in ChannelLifecycleService.TRANSITIONS.`
    )
    this.name = 'InvalidTransitionError'
  }
}

export class ChannelAlreadyInStateError extends Error {
  constructor(channelConfigId: string, status: string) {
    super(
      `[ChannelLifecycle] Channel "${channelConfigId}" is already in status="${status}".`
    )
    this.name = 'ChannelAlreadyInStateError'
  }
}

export class WebhookRegistrationError extends Error {
  constructor(channelConfigId: string, cause: string) {
    super(
      `[ChannelLifecycle] Failed to register webhook for channel ` +
      `"${channelConfigId}": ${cause}`
    )
    this.name = 'WebhookRegistrationError'
  }
}
