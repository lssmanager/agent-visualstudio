/**
 * prisma/seed-check.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * F0-09 — Verifica que el seed fue aplicado correctamente.
 *
 * Uso:
 *   npx ts-node prisma/seed-check.ts
 *
 * Exit 0 = OK, Exit 1 = alguna entidad faltante.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
  let ok = true;
  const fail = (msg: string) => { console.error(`  ✗ ${msg}`); ok = false; };
  const pass = (msg: string) => console.log(`  ✓ ${msg}`);

  console.log('\n🔍  Checking seed F0-09…\n');

  // Agency
  const agency = await prisma.agency.findFirst({ where: { slug: 'lss' } });
  agency ? pass(`Agency 'lss' found`) : fail(`Agency 'lss' not found`);

  // Department
  const dept = await prisma.department.findFirst({ where: { slug: 'core-ai', isLevelOrchestrator: true } });
  dept ? pass(`Department 'core-ai' (orchestrator)`) : fail(`Department 'core-ai' with isLevelOrchestrator=true not found`);

  // Workspace
  const ws = await prisma.workspace.findFirst({ where: { slug: 'primary', isLevelOrchestrator: true } });
  ws ? pass(`Workspace 'primary' (orchestrator)`) : fail(`Workspace 'primary' with isLevelOrchestrator=true not found`);

  // Orchestrator agent
  const orch = await prisma.agent.findFirst({ where: { slug: 'orchestrator', isLevelOrchestrator: true } });
  orch ? pass(`Agent 'orchestrator' (isLevelOrchestrator=true)`) : fail(`Agent 'orchestrator' not found`);

  // Specialist agents
  const slugs = ['backend-agent', 'frontend-agent', 'middleware-agent', 'ui-fixer', 'api-coder'];
  for (const slug of slugs) {
    const a = await prisma.agent.findFirst({ where: { slug } });
    a ? pass(`Agent '${slug}'`) : fail(`Agent '${slug}' not found`);
  }

  // C-20 invariant: at most 1 orchestrator per workspace
  const orchCount = await prisma.agent.count({
    where: { workspaceId: ws?.id, isLevelOrchestrator: true },
  });
  orchCount === 1
    ? pass(`C-20 OK: exactly 1 isLevelOrchestrator agent in workspace`)
    : fail(`C-20 VIOLATION: ${orchCount} agents with isLevelOrchestrator=true in workspace`);

  // Skills
  const skillCount = await prisma.skill.count();
  skillCount >= 4 ? pass(`${skillCount} skills present`) : fail(`Expected ≥4 skills, got ${skillCount}`);

  // AgentSkill assignments
  const asCount = await prisma.agentSkill.count();
  asCount >= 14 ? pass(`${asCount} agentSkill rows present`) : fail(`Expected ≥14 agentSkill rows, got ${asCount}`);

  // Policies
  const bpCount = await prisma.budgetPolicy.count();
  const mpCount = await prisma.modelPolicy.count();
  bpCount >= 4 ? pass(`${bpCount} BudgetPolicy rows`) : fail(`Expected ≥4 BudgetPolicy, got ${bpCount}`);
  mpCount >= 4 ? pass(`${mpCount} ModelPolicy rows`) : fail(`Expected ≥4 ModelPolicy, got ${mpCount}`);

  // Provider + catalog
  const provCount = await prisma.providerCredential.count();
  const catCount  = await prisma.modelCatalogEntry.count();
  provCount >= 1 ? pass(`${provCount} ProviderCredential`) : fail(`No ProviderCredential found`);
  catCount  >= 4 ? pass(`${catCount} ModelCatalogEntry`) : fail(`Expected ≥4 ModelCatalogEntry, got ${catCount}`);

  console.log(ok ? '\n✅  All checks passed.\n' : '\n❌  Some checks failed — re-run the seed.\n');
  process.exit(ok ? 0 : 1);
}

check()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
