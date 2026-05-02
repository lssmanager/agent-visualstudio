/**
 * teams.fixtures.ts — [F3a-39]
 *
 * Fixtures para Microsoft Teams Bot Framework Activity payloads.
 * El gateway Teams recibe Activity objects según Bot Framework v3/v4.
 *
 * Referencia: https://learn.microsoft.com/en-us/azure/bot-service/rest-api/bot-framework-rest-connector-api-reference
 */

export const TEAMS_CHANNEL_ID      = 'channel-teams-test-001'
export const TEAMS_BOT_ID          = 'bot-teams-test-001'
export const TEAMS_TENANT_ID       = 'tenant-test-001'
export const TEAMS_USER_ID         = 'user-teams-001'
export const TEAMS_CONVERSATION_ID = 'conv-teams-001'
export const TEAMS_SERVICE_URL     = 'https://smba.trafficmanager.net/teams/'
export const TEAMS_BEARER_TOKEN    = 'Bearer test-jwt-token-teams'
export const TEAMS_AGENT_ID        = 'agent-test-teams-001'

/** Activity de tipo message (texto entrante) */
export function makeTeamsMessageActivity(text: string): object {
  return {
    type:       'message',
    id:         `teams-activity-${Date.now()}`,
    timestamp:  new Date().toISOString(),
    serviceUrl: TEAMS_SERVICE_URL,
    channelId:  'msteams',
    from: {
      id:   TEAMS_USER_ID,
      name: 'Test User Teams',
    },
    conversation: {
      id:       TEAMS_CONVERSATION_ID,
      isGroup:  false,
      tenantId: TEAMS_TENANT_ID,
      name:     'Test Conversation',
    },
    recipient: {
      id:   TEAMS_BOT_ID,
      name: 'TestBot',
    },
    text,
    textFormat: 'plain',
    locale:     'es-ES',
    entities:   [],
    channelData: {
      tenant: { id: TEAMS_TENANT_ID },
    },
  }
}

/** Activity de tipo conversationUpdate (alta de usuario al canal) */
export function makeTeamsConversationUpdate(): object {
  return {
    type:       'conversationUpdate',
    id:         `conv-update-${Date.now()}`,
    timestamp:  new Date().toISOString(),
    serviceUrl: TEAMS_SERVICE_URL,
    channelId:  'msteams',
    from:       { id: 'Microsoft Teams', name: 'Microsoft Teams' },
    conversation: {
      id:       TEAMS_CONVERSATION_ID,
      tenantId: TEAMS_TENANT_ID,
    },
    recipient:    { id: TEAMS_BOT_ID, name: 'TestBot' },
    membersAdded: [{ id: TEAMS_USER_ID, name: 'Test User Teams' }],
  }
}

/** Activity de tipo typing — debe ignorarse */
export function makeTeamsTypingActivity(): object {
  return {
    type:       'typing',
    id:         `typing-${Date.now()}`,
    timestamp:  new Date().toISOString(),
    serviceUrl: TEAMS_SERVICE_URL,
    channelId:  'msteams',
    from:       { id: TEAMS_USER_ID, name: 'Test User Teams' },
    conversation: { id: TEAMS_CONVERSATION_ID, tenantId: TEAMS_TENANT_ID },
    recipient:  { id: TEAMS_BOT_ID, name: 'TestBot' },
  }
}
