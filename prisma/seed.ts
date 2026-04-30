/**
 * prisma/seed.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * F0-09 — Seed COMPLETO: Agency → Department → Workspace → Agent orchestrator
 *
 * Hierarchy seeded:
 *   Agency        : Learn Social Studies (slug: lss)
 *   Department    : Core AI              (isLevelOrchestrator = true)
 *   Workspace     : Primary              (isLevelOrchestrator = true)
 *   Agents        : orchestrator (isLevelOrchestrator = true)
 *                   backend-agent, frontend-agent, middleware-agent,
 *                   ui-fixer, api-coder
 *   Subagents     : code-reviewer, test-runner  (under backend-agent)
 *   Skills        : web_search, code_exec, n8n_webhook, openapi_call
 *   ProviderCred  : OpenRouter (placeholder — replace PROVIDER_SECRET in .env)
 *   ModelCatalog  : gpt-4o, gpt-4o-mini, deepseek/deepseek-chat, qwen/qwen-max
 *   BudgetPolicy  : agency / department / workspace / orchestrator levels
 *   ModelPolicy   : agency / department / workspace / orchestrator levels
 *   AuditEvent    : seed.completed marker
 *
 * Safe to re-run — all operations use upsert / createOrConnect patterns.
 *
 * Run:
 *   npx ts-node prisma/seed.ts
 *   -- or via package.json prisma.seed --
 *   npx prisma db seed
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Fake-encrypts a placeholder value so the seed doesn't need the real
 * PROVIDER_SECRET at seed time.  Replace with the output of your encryption
 * util before deploying to production.
 */
const placeholder = (label: string) =>
  `PLACEHOLDER:${label}:REPLACE_WITH_REAL_ENCRYPTED_VALUE`;

// ─── IDs (stable / deterministic) ────────────────────────────────────────────
// Using well-known UUIDs so the seed is idempotent across environments.

const IDS = {
  // Agency
  agency: 'a0000000-0000-0000-0000-000000000001',

  // Department
  deptCoreAi: 'd0000000-0000-0000-0000-000000000001',

  // Workspace
  wsPrimary: 'w0000000-0000-0000-0000-000000000001',

  // Agents
  agOrchestrator: 'ag000000-0000-0000-0000-000000000001',
  agBackend:      'ag000000-0000-0000-0000-000000000002',
  agFrontend:     'ag000000-0000-0000-0000-000000000003',
  agMiddleware:   'ag000000-0000-0000-0000-000000000004',
  agUiFixer:      'ag000000-0000-0000-0000-000000000005',
  agApiCoder:     'ag000000-0000-0000-0000-000000000006',

  // Subagents
  subCodeReviewer: 'sa000000-0000-0000-0000-000000000001',
  subTestRunner:   'sa000000-0000-0000-0000-000000000002',

  // Skills
  skillWebSearch:  'sk000000-0000-0000-0000-000000000001',
  skillCodeExec:   'sk000000-0000-0000-0000-000000000002',
  skillN8nWebhook: 'sk000000-0000-0000-0000-000000000003',
  skillOpenapi:    'sk000000-0000-0000-0000-000000000004',

  // Provider credential
  providerOpenRouter: 'pc000000-0000-0000-0000-000000000001',

  // Model catalog entries
  catGpt4o:        'mc000000-0000-0000-0000-000000000001',
  catGpt4oMini:    'mc000000-0000-0000-0000-000000000002',
  catDeepSeek:     'mc000000-0000-0000-0000-000000000003',
  catQwenMax:      'mc000000-0000-0000-0000-000000000004',

  // Policies
  budgetAgency:     'bp000000-0000-0000-0000-000000000001',
  budgetDept:       'bp000000-0000-0000-0000-000000000002',
  budgetWs:         'bp000000-0000-0000-0000-000000000003',
  budgetAgent:      'bp000000-0000-0000-0000-000000000004',

  modelPolicyAgency: 'mp000000-0000-0000-0000-000000000001',
  modelPolicyDept:   'mp000000-0000-0000-0000-000000000002',
  modelPolicyWs:     'mp000000-0000-0000-0000-000000000003',
  modelPolicyAgent:  'mp000000-0000-0000-0000-000000000004',
} as const;

// ─── System prompts ──────────────────────────────────────────────────────────

const AGENCY_SYSTEM_PROMPT = `
You are the master orchestrator of Learn Social Studies (LSS) Agent Visual Studio.
Your mission is to coordinate all departments, workspaces, and agents to produce
high-quality educational content and software features for the LSS platform.
Always respect budget and model policies. Delegate to the appropriate department
orchestrator and escalate anomalies via AuditEvent.
`.trim();

const DEPT_SYSTEM_PROMPT = `
You are the Core AI Department orchestrator.
You coordinate backend, frontend, middleware, and UI workstreams.
Route tasks to the correct workspace and monitor cross-workspace dependencies.
`.trim();

const WS_SYSTEM_PROMPT = `
You are the Primary Workspace orchestrator.
You own the full-stack delivery pipeline for the LSS platform:
backed by Prisma/PostgreSQL, Next.js frontend, and n8n automation.
Assign tasks to specialist agents and aggregate their outputs.
`.trim();

const ORCHESTRATOR_SYSTEM_PROMPT = `
You are the Agent Orchestrator — the highest-authority agent inside the Primary Workspace.
You receive the user's intent, decompose it into subtasks, and delegate each subtask
to the appropriate specialist agent (backend, frontend, middleware, ui-fixer, api-coder).
Aggregate the results and present a coherent final response.
Never perform implementation work yourself — always delegate.
`.trim();

// ─── Main seed function ──────────────────────────────────────────────────────

async function main() {
  console.log('🌱  Starting F0-09 seed…');

  // ── 1. Agency ───────────────────────────────────────────────────────────────
  console.log('  → Agency');
  const agency = await prisma.agency.upsert({
    where: { id: IDS.agency },
    update: {},
    create: {
      id:           IDS.agency,
      name:         'Learn Social Studies',
      slug:         'lss',
      systemPrompt: AGENCY_SYSTEM_PROMPT,
      model:        'openai/gpt-4o',
      profileJson:  {
        platform:  'Agent Visual Studio',
        version:   'F0',
        domains:   ['education', 'saas', 'ai-orchestration'],
        createdBy: 'seed:F0-09',
      },
    },
  });

  // ── 2. Department — Core AI ─────────────────────────────────────────────────
  console.log('  → Department: Core AI');
  const dept = await prisma.department.upsert({
    where: { id: IDS.deptCoreAi },
    update: {},
    create: {
      id:                 IDS.deptCoreAi,
      agencyId:           agency.id,
      name:               'Core AI',
      slug:               'core-ai',
      systemPrompt:       DEPT_SYSTEM_PROMPT,
      model:              'openai/gpt-4o',
      isLevelOrchestrator: true,    // C-20: only one per agency — enforced by partial unique index
      profileJson: { role: 'orchestrator-l2', seeded: true },
    },
  });

  // ── 3. Workspace — Primary ──────────────────────────────────────────────────
  console.log('  → Workspace: Primary');
  const workspace = await prisma.workspace.upsert({
    where: { id: IDS.wsPrimary },
    update: {},
    create: {
      id:                 IDS.wsPrimary,
      departmentId:       dept.id,
      name:               'Primary',
      slug:               'primary',
      systemPrompt:       WS_SYSTEM_PROMPT,
      model:              'openai/gpt-4o',
      isLevelOrchestrator: true,    // C-20: only one per department
      profileJson: { role: 'orchestrator-l3', seeded: true },
    },
  });

  // ── 4. Agents ────────────────────────────────────────────────────────────────
  console.log('  → Agents (6)');

  const orchestrator = await prisma.agent.upsert({
    where: { id: IDS.agOrchestrator },
    update: {},
    create: {
      id:                 IDS.agOrchestrator,
      workspaceId:        workspace.id,
      name:               'Orchestrator',
      slug:               'orchestrator',
      role:               'orchestrator',
      isLevelOrchestrator: true,    // C-20: only one per workspace
      systemPrompt:       ORCHESTRATOR_SYSTEM_PROMPT,
      model:              'openai/gpt-4o',
      profileJson: {
        capabilities: ['orchestration', 'task-decomposition', 'delegation'],
        seeded: true,
      },
    },
  });

  const agentDefs = [
    {
      id:          IDS.agBackend,
      slug:        'backend-agent',
      name:        'Backend Agent',
      role:        'specialist',
      model:       'openai/gpt-4o',
      systemPrompt: 'You are a backend engineering specialist. You write Node.js/TypeScript code, Prisma migrations, REST APIs, and NestJS modules. Always produce tested, production-quality code.',
      profileJson: { capabilities: ['prisma', 'nestjs', 'postgres', 'rest-api'], seeded: true },
    },
    {
      id:          IDS.agFrontend,
      slug:        'frontend-agent',
      name:        'Frontend Agent',
      role:        'specialist',
      model:       'openai/gpt-4o',
      systemPrompt: 'You are a frontend engineering specialist. You build Next.js/React components, Tailwind CSS layouts, and integrate with REST APIs. Produce accessible, responsive UI.',
      profileJson: { capabilities: ['nextjs', 'react', 'tailwindcss', 'accessibility'], seeded: true },
    },
    {
      id:          IDS.agMiddleware,
      slug:        'middleware-agent',
      name:        'Middleware Agent',
      role:        'specialist',
      model:       'openai/gpt-4o',
      systemPrompt: 'You are a middleware and integration specialist. You handle Logto OIDC, FluentCRM webhooks, n8n automation flows, and Coolify deployments.',
      profileJson: { capabilities: ['logto', 'fluentcrm', 'n8n', 'coolify'], seeded: true },
    },
    {
      id:          IDS.agUiFixer,
      slug:        'ui-fixer',
      name:        'UI Fixer',
      role:        'specialist',
      model:       'openai/gpt-4o-mini',
      systemPrompt: 'You are a UI bug-fix specialist. You diagnose visual regressions, fix CSS issues, correct accessibility violations, and improve component responsiveness. Prefer targeted, minimal diffs.',
      profileJson: { capabilities: ['css-debug', 'a11y', 'responsive-fix'], seeded: true },
    },
    {
      id:          IDS.agApiCoder,
      slug:        'api-coder',
      name:        'API Coder',
      role:        'specialist',
      model:       'openai/gpt-4o',
      systemPrompt: 'You are an API design and implementation specialist. You design OpenAPI specs, implement NestJS controllers/services, write integration tests, and document endpoints.',
      profileJson: { capabilities: ['openapi', 'nestjs-controller', 'swagger', 'integration-tests'], seeded: true },
    },
  ];

  for (const def of agentDefs) {
    await prisma.agent.upsert({
      where:  { id: def.id },
      update: {},
      create: { ...def, workspaceId: workspace.id, isLevelOrchestrator: false },
    });
  }

  // ── 5. Subagents (under backend-agent) ──────────────────────────────────────
  console.log('  → Subagents (2)');

  await prisma.subagent.upsert({
    where: { id: IDS.subCodeReviewer },
    update: {},
    create: {
      id:          IDS.subCodeReviewer,
      agentId:     IDS.agBackend,
      name:        'Code Reviewer',
      slug:        'code-reviewer',
      model:       'openai/gpt-4o',
      systemPrompt: 'You are a code reviewer subagent. You inspect diffs for correctness, security vulnerabilities, performance issues, and adherence to project conventions.',
      profileJson: { capabilities: ['code-review', 'security-audit', 'best-practices'], seeded: true },
    },
  });

  await prisma.subagent.upsert({
    where: { id: IDS.subTestRunner },
    update: {},
    create: {
      id:          IDS.subTestRunner,
      agentId:     IDS.agBackend,
      name:        'Test Runner',
      slug:        'test-runner',
      model:       'openai/gpt-4o-mini',
      systemPrompt: 'You are a test generation and execution subagent. You write Jest unit tests, Supertest integration tests, and interpret test output to report failures.',
      profileJson: { capabilities: ['jest', 'supertest', 'test-generation'], seeded: true },
    },
  });

  // ── 6. Skills ────────────────────────────────────────────────────────────────
  console.log('  → Skills (4)');

  const skills = [
    {
      id:          IDS.skillWebSearch,
      name:        'web_search',
      description: 'Search the web and return structured results (title, url, snippet).',
      type:        'builtin',
      config:      { handler: 'builtins/web-search', maxResults: 5 },
      schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          maxResults: { type: 'number', default: 5 },
        },
        required: ['query'],
      },
    },
    {
      id:          IDS.skillCodeExec,
      name:        'code_execution',
      description: 'Execute TypeScript/JavaScript code in a sandboxed Node.js environment.',
      type:        'builtin',
      config:      { handler: 'builtins/code-exec', timeout: 30000, sandbox: true },
      schema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'TypeScript/JavaScript code to execute' },
          timeout: { type: 'number', default: 30000, description: 'Timeout in ms' },
        },
        required: ['code'],
      },
    },
    {
      id:          IDS.skillN8nWebhook,
      name:        'n8n_trigger',
      description: 'Trigger an n8n workflow via webhook and return the response.',
      type:        'n8n_webhook',
      config: {
        webhookUrl: process.env.N8N_WEBHOOK_BASE_URL ?? 'https://n8n.example.com/webhook',
        method:     'POST',
      },
      schema: {
        type: 'object',
        properties: {
          workflowId: { type: 'string' },
          payload:    { type: 'object' },
        },
        required: ['workflowId'],
      },
    },
    {
      id:          IDS.skillOpenapi,
      name:        'openapi_call',
      description: 'Invoke any OpenAPI operation via spec URL + operationId.',
      type:        'openapi',
      config: {
        specUrl:     process.env.INTERNAL_API_SPEC_URL ?? 'http://localhost:3000/api-json',
        operationId: '*',
      },
      schema: {
        type: 'object',
        properties: {
          operationId: { type: 'string' },
          parameters:  { type: 'object' },
          body:        { type: 'object' },
        },
        required: ['operationId'],
      },
    },
  ];

  for (const skill of skills) {
    await prisma.skill.upsert({
      where:  { id: skill.id },
      update: {},
      create: skill,
    });
  }

  // ── 7. Assign skills to orchestrator and specialist agents ──────────────────
  console.log('  → AgentSkill assignments');

  const skillAssignments: Array<{ agentId: string; skillId: string }> = [
    // Orchestrator gets all skills
    { agentId: IDS.agOrchestrator, skillId: IDS.skillWebSearch  },
    { agentId: IDS.agOrchestrator, skillId: IDS.skillCodeExec   },
    { agentId: IDS.agOrchestrator, skillId: IDS.skillN8nWebhook },
    { agentId: IDS.agOrchestrator, skillId: IDS.skillOpenapi    },
    // Backend agent
    { agentId: IDS.agBackend,      skillId: IDS.skillCodeExec   },
    { agentId: IDS.agBackend,      skillId: IDS.skillOpenapi    },
    // Frontend agent
    { agentId: IDS.agFrontend,     skillId: IDS.skillCodeExec   },
    { agentId: IDS.agFrontend,     skillId: IDS.skillWebSearch  },
    // Middleware agent
    { agentId: IDS.agMiddleware,   skillId: IDS.skillN8nWebhook },
    { agentId: IDS.agMiddleware,   skillId: IDS.skillOpenapi    },
    // API Coder
    { agentId: IDS.agApiCoder,     skillId: IDS.skillCodeExec   },
    { agentId: IDS.agApiCoder,     skillId: IDS.skillOpenapi    },
    // UI Fixer
    { agentId: IDS.agUiFixer,      skillId: IDS.skillWebSearch  },
    { agentId: IDS.agUiFixer,      skillId: IDS.skillCodeExec   },
  ];

  for (const sa of skillAssignments) {
    await prisma.agentSkill.upsert({
      where:  { agentId_skillId: sa },
      update: {},
      create: sa,
    });
  }

  // Subagent skills
  await prisma.subagentSkill.upsert({
    where: { subagentId_skillId: { subagentId: IDS.subCodeReviewer, skillId: IDS.skillCodeExec } },
    update: {},
    create: { subagentId: IDS.subCodeReviewer, skillId: IDS.skillCodeExec },
  });
  await prisma.subagentSkill.upsert({
    where: { subagentId_skillId: { subagentId: IDS.subTestRunner, skillId: IDS.skillCodeExec } },
    update: {},
    create: { subagentId: IDS.subTestRunner, skillId: IDS.skillCodeExec },
  });

  // ── 8. Provider Credential (OpenRouter) ─────────────────────────────────────
  console.log('  → ProviderCredential: OpenRouter');

  const provider = await prisma.providerCredential.upsert({
    where: { id: IDS.providerOpenRouter },
    update: {},
    create: {
      id:              IDS.providerOpenRouter,
      agencyId:        agency.id,
      name:            'OpenRouter (LSS)',
      type:            'openrouter',
      baseUrl:         'https://openrouter.ai/api/v1',
      apiKeyEncrypted: placeholder('OPENROUTER_API_KEY'),
      extraHeaders: {
        'HTTP-Referer': 'https://learnsocialstudies.com',
        'X-Title':      'Agent Visual Studio — LSS',
      },
      isActive: true,
    },
  });

  // ── 9. Model Catalog Entries ─────────────────────────────────────────────────
  console.log('  → ModelCatalogEntry (4)');

  const catalogEntries = [
    {
      id:          IDS.catGpt4o,
      providerId:  provider.id,
      modelId:     'openai/gpt-4o',
      displayName: 'GPT-4o',
      families:    ['reasoning', 'vision', 'instruction', 'multilingual'],
      contextK:    128,
      isActive:    true,
    },
    {
      id:          IDS.catGpt4oMini,
      providerId:  provider.id,
      modelId:     'openai/gpt-4o-mini',
      displayName: 'GPT-4o Mini',
      families:    ['fast', 'instruction', 'mini'],
      contextK:    128,
      isActive:    true,
    },
    {
      id:          IDS.catDeepSeek,
      providerId:  provider.id,
      modelId:     'deepseek/deepseek-chat',
      displayName: 'DeepSeek Chat',
      families:    ['reasoning', 'coding', 'instruction'],
      contextK:    64,
      isActive:    true,
    },
    {
      id:          IDS.catQwenMax,
      providerId:  provider.id,
      modelId:     'qwen/qwen-max',
      displayName: 'Qwen Max',
      families:    ['reasoning', 'multilingual', 'instruction'],
      contextK:    32,
      isActive:    true,
    },
  ];

  for (const entry of catalogEntries) {
    await prisma.modelCatalogEntry.upsert({
      where:  { id: entry.id },
      update: {},
      create: entry,
    });
  }

  // ── 10. Budget Policies ──────────────────────────────────────────────────────
  console.log('  → BudgetPolicy (4 scopes)');

  // Agency-level: $500/month, alert at 80%
  await prisma.budgetPolicy.upsert({
    where:  { id: IDS.budgetAgency },
    update: {},
    create: {
      id:          IDS.budgetAgency,
      limitUsd:    500.0,
      periodDays:  30,
      alertAt:     0.8,
      agencyId:    agency.id,
    },
  });

  // Department-level: $200/month
  await prisma.budgetPolicy.upsert({
    where:  { id: IDS.budgetDept },
    update: {},
    create: {
      id:           IDS.budgetDept,
      limitUsd:     200.0,
      periodDays:   30,
      alertAt:      0.8,
      departmentId: dept.id,
    },
  });

  // Workspace-level: $100/month
  await prisma.budgetPolicy.upsert({
    where:  { id: IDS.budgetWs },
    update: {},
    create: {
      id:          IDS.budgetWs,
      limitUsd:    100.0,
      periodDays:  30,
      alertAt:     0.8,
      workspaceId: workspace.id,
    },
  });

  // Orchestrator agent-level: $50/month (tightest guard)
  await prisma.budgetPolicy.upsert({
    where:  { id: IDS.budgetAgent },
    update: {},
    create: {
      id:       IDS.budgetAgent,
      limitUsd: 50.0,
      periodDays: 30,
      alertAt:  0.9,       // 90% alert for the orchestrator
      agentId:  orchestrator.id,
    },
  });

  // ── 11. Model Policies ───────────────────────────────────────────────────────
  console.log('  → ModelPolicy (4 scopes)');

  // Agency-level default
  await prisma.modelPolicy.upsert({
    where:  { id: IDS.modelPolicyAgency },
    update: {},
    create: {
      id:            IDS.modelPolicyAgency,
      primaryModel:  'openai/gpt-4o',
      fallbackChain: ['openai/gpt-4o-mini', 'deepseek/deepseek-chat'],
      temperature:   0.7,
      maxTokens:     4096,
      agencyId:      agency.id,
    },
  });

  // Department-level
  await prisma.modelPolicy.upsert({
    where:  { id: IDS.modelPolicyDept },
    update: {},
    create: {
      id:            IDS.modelPolicyDept,
      primaryModel:  'openai/gpt-4o',
      fallbackChain: ['deepseek/deepseek-chat', 'qwen/qwen-max'],
      temperature:   0.7,
      maxTokens:     4096,
      departmentId:  dept.id,
    },
  });

  // Workspace-level
  await prisma.modelPolicy.upsert({
    where:  { id: IDS.modelPolicyWs },
    update: {},
    create: {
      id:            IDS.modelPolicyWs,
      primaryModel:  'openai/gpt-4o',
      fallbackChain: ['openai/gpt-4o-mini', 'deepseek/deepseek-chat'],
      temperature:   0.5,     // workspace prefers more deterministic outputs
      maxTokens:     8192,
      workspaceId:   workspace.id,
    },
  });

  // Orchestrator agent — high-quality, low temperature for routing
  await prisma.modelPolicy.upsert({
    where:  { id: IDS.modelPolicyAgent },
    update: {},
    create: {
      id:            IDS.modelPolicyAgent,
      primaryModel:  'openai/gpt-4o',
      fallbackChain: ['openai/gpt-4o-mini'],
      temperature:   0.2,   // orchestrators need high determinism
      maxTokens:     4096,
      agentId:       orchestrator.id,
    },
  });

  // ── 12. AuditEvent — seed marker ─────────────────────────────────────────────
  console.log('  → AuditEvent: seed.completed');

  await prisma.auditEvent.create({
    data: {
      eventType: 'seed.completed',
      scopeType:  'agency',
      scopeId:    agency.id,
      payload: {
        seedVersion: 'F0-09',
        timestamp:   new Date().toISOString(),
        entities: {
          agencies:           1,
          departments:        1,
          workspaces:         1,
          agents:             6,
          subagents:          2,
          skills:             4,
          agentSkills:        skillAssignments.length,
          providerCredentials: 1,
          modelCatalogEntries: 4,
          budgetPolicies:     4,
          modelPolicies:      4,
        },
      },
    },
  });

  console.log('\n✅  Seed F0-09 completed successfully.');
  console.log('   Agency:       Learn Social Studies (lss)');
  console.log('   Department:   Core AI (orchestrator-l2)');
  console.log('   Workspace:    Primary (orchestrator-l3)');
  console.log('   Agents:       orchestrator + 5 specialists');
  console.log('   Subagents:    2 (under backend-agent)');
  console.log('   Skills:       4');
  console.log('   Policies:     4 budget + 4 model = 8 total');
  console.log('\n⚠️   Replace placeholder encrypted values before deploying to production.');
  console.log('   Run: node scripts/encrypt-provider-key.js');
}

// ─── Run ─────────────────────────────────────────────────────────────────────

main()
  .catch((e) => {
    console.error('❌  Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
