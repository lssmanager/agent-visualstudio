# Unified Action Plan: 10 Critical Actions

**Document Version**: 1.0
**Last Updated**: 2026-04-15
**Audience**: Development Team, Project Leadership

---

## Purpose

This document lists 10 concrete actions required to convert Dashboard Agentes from foundation-stage to operationally-viable. Each action has clear Done Criteria, technical details, and integration points.

**Golden Rule**: No action is complete until its Done Were met. No parallel work on Phases 1-3 gaps.

---

## ACTION 1: Eliminate Hardcoding of Profiles

**Priority**: 🔴 BLOCKER
**Phase**: 1
**Est. Time**: 4 hours

### Problem

`ProfilesService` still imports hardcoded profile objects from TypeScript:

```typescript
import { chiefOfStaffProfile, dailyTaskManagerProfile, ... } from '...';

export class ProfilesService {
  getAll() {
    return [chiefOfStaffProfile, executiveAssistantProfile, ...];
  }
}
```

This means:
- New profiles added to templates/ don't auto-appear
- GET /profiles ignores markdown catalog
- "Dynamic" profile system is not actually dynamic

### Solution

1. Create **three new files**:
   - `packages/profile-engine/src/loaders/load-profile-markdown.ts`
   - `packages/profile-engine/src/loaders/load-profiles-catalog.ts`
   - `packages/profile-engine/src/loaders/index.ts`

2. Update `ProfilesService`:
   ```typescript
   async getAll(basePath = process.cwd()): Promise<ProfileSpec[]> {
     return loadProfilesCatalog(basePath);
   }
   ```

3. Remove hardcoded imports from service.

### Technical Details

**load-profile-markdown.ts**:
- Function: `loadProfileFromMarkdown(profileId, basePath): Promise<ProfileSpec>`
- Input: `basePath/templates/profiles/{profileId}.md` + `{profileId}.json`
- Process:
  1. Read .md file
  2. Extract title (h1), Purpose section, Suggested Routines section
  3. Read .json sidecar
  4. Merge: JSON is primary, markdown enriches description
  5. Validate against `profileSpecSchema`
- Output: Typed `ProfileSpec`
- Errors: Clear messages with file paths

**load-profiles-catalog.ts**:
- Function: `loadProfilesCatalog(basePath): Promise<ProfileSpec[]>`
- Scans `basePath/templates/profiles/` for all `.md` files
- Loads each via `loadProfileFromMarkdown`
- Caches result
- Error handling: Report missing .json, validation failures

**Validation**:
- Use Zod: `profileSpecSchema.parse(merged)`
- Fail fast with clear error messages

### Done Criteria

- [ ] New loader functions exist and export
- [ ] ProfilesService.getAll() calls loader, not imports
- [ ] GET /profiles calls service async
- [ ] Test: Add new file to templates/profiles/test.md + test.json
- [ ] Restart API
- [ ] GET /profiles includes test profile
- [ ] No code changes needed to expose new profile

### Integration Points

- ProfilesController GET /profiles must be async
- ProfilesService must use loaders

---

## ACTION 2: Implement JSON Sidecars for All Profiles

**Priority**: 🔴 BLOCKER
**Phase**: 1
**Est. Time**: 2 hours

### Problem

Markdown profiles exist, but JSON sidecars are missing or incomplete. This breaks the merge logic.

### Solution

Create or complete these files. Each must match its corresponding .md:

```
templates/profiles/
  ├── chief-of-staff.md
  ├── chief-of-staff.json ← MUST EXIST
  ├── daily-task-manager.md
  ├── daily-task-manager.json ← MUST EXIST
  ... (7 profiles total)
```

### Required JSON Structure

```json
{
  "id": "chief-of-staff",
  "name": "Chief of Staff",
  "category": "operations",
  "description": "Operational orchestrator profile...",
  "defaultModel": "openai/gpt-5.4-mini",
  "defaultSkills": ["status.read", "tasks.manage", "notes.capture"],
  "defaultPolicies": ["safe-operator"],
  "routines": ["morning-brief", "eod-review", "followup-sweep", "task-prep"],
  "tags": ["orchestration", "follow-ups"],
  "visibility": "public",
  "priority": 1
}
```

### Validation Rules

- `id` must match filename: `chief-of-staff.json` → `id: "chief-of-staff"`
- All fields required except `description` (can come from .md)
- `category` must be one of: operations, support, engineering, monitoring
- `defaultModel` should reference real LLM
- `defaultSkills` is array of skill IDs
- `defaultPolicies` is array of policy IDs
- `routines` references must exist in templates/workspaces/

### Done Criteria

- [ ] All 7 profiles have .json sidecars
- [ ] Each .json validates against `packages/schemas/profile.schema.json`
- [ ] ID matches filename exactly
- [ ] No required fields missing
- [ ] Lint: `jq . templates/profiles/*.json` all valid

---

## ACTION 3: Implement Routine Loaders

**Priority**: 🔴 BLOCKER
**Phase**: 1
**Est. Time**: 3 hours

### Problem

Routines exist as markdown but aren't loaded dynamically as RoutineSpec objects.

### Decision (Approved)

Routines are **strings pure**: no internal parsing. Load markdown content as-is into `promptTemplate`.

### Solution

1. Create `packages/profile-engine/src/loaders/load-routine-markdown.ts`
2. Create `packages/profile-engine/src/loaders/load-routines-catalog.ts`
3. Update `RoutinesService` to use loader
4. Update `RoutinesController` to be async

### Technical Details

**load-routine-markdown.ts**:
- Function: `loadRoutineMarkdown(routineId, basePath): Promise<RoutineInfo>`
- Input: `basePath/templates/workspaces/chief-of-staff/routines/{routineId}.md`
- Process:
  1. Read file
  2. Extract heading as name (`# Morning Brief` → "Morning Brief")
  3. Return rest as promptTemplate
- Output: `{ id, name, path, content }`

**load-routines-catalog.ts**:
- Function: `loadRoutinesCatalog(basePath): Promise<RoutineSpec[]>`
- Scans `templates/workspaces/chief-of-staff/routines/` for all `.md`
- Returns RoutineSpec[] with:
  ```typescript
  {
    id: "morning-brief",
    name: "Morning Brief",
    description: "Routine: Morning Brief",
    promptTemplate: "[full markdown content]",
    steps: []
  }
  ```
- Caches

**RoutinesService**:
```typescript
async getAll(basePath = process.cwd()): Promise<RoutineSpec[]> {
  return loadRoutinesCatalog(basePath);
}
```

### Done Criteria

- [ ] Loader functions created
- [ ] RoutinesService async, uses loader
- [ ] RoutinesController async
- [ ] Test: GET /routines returns at least 4 routines (chief-of-staff set)
- [ ] Each routine has promptTemplate with full markdown
- [ ] No hardcoded routines in code

---

## ACTION 4: Implement Real Workspace Bootstrap

**Priority**: 🔴 BLOCKER
**Phase**: 2
**Est. Time**: 4 hours

### Problem

Current bootstrap creates workspace with fixed defaults, ignoring profile configuration.

### Solution

**Endpoint Contract**:

```typescript
POST /api/studio/v1/workspaces/bootstrap

Request:
{
  "profileId"?: string,
  "workspaceSpec": {
    "name": "required",
    "owner"?: string,
    "description"?: string,
    "defaultModel"?: string,
    "skillIds"?: string[],
    ... (other WorkspaceSpec fields)
  }
}

Response (201):
{
  "workspaceSpec": { ... },
  "created": true,
  "message": "Workspace bootstrapped from profile '...'",
  "timestamp": "..."
}

Errors:
- 400: Missing workspaceSpec.name
- 404: Profile not found
- 400: Validation error
```

### Merge Order (CRITICAL)

```typescript
// This is the golden rule - request wins over profile wins over defaults
defaultModel:
  request.defaultModel
  ?? profile.defaultModel
  ?? 'openai/gpt-5.4-mini'

skillIds:
  request.skillIds
  ?? profile.defaultSkills
  ?? []

policyRefs:
  request.policyRefs
  ?? profile.defaultPolicies.map(id => ({id, scope: 'workspace'}))
  ?? []

routines:
  request.routines
  ?? profile.routines
  ?? []
```

### Implementation

**WorkspacesService**:

```typescript
interface BootstrapInput {
  profileId?: string;
  workspaceSpec: Partial<WorkspaceSpec>;
}

async bootstrap(input: BootstrapInput, basePath = process.cwd()): Promise<WorkspaceSpec> {
  let profileDefaults = {};

  if (input.profileId) {
    const profile = await loadProfile(input.profileId, basePath);
    profileDefaults = {
      defaultModel: profile.defaultModel,
      skillIds: profile.defaultSkills,
      policyRefs: profile.defaultPolicies.map(id => ({id, scope: 'workspace'})),
      routines: profile.routines,
      profileIds: [input.profileId]
    };
  }

  const merged = workspaceSpecSchema.parse({
    id: input.workspaceSpec.id || generateId(input.workspaceSpec.name),
    slug: generateSlug(input.workspaceSpec.name),
    name: input.workspaceSpec.name,
    defaultModel: input.workspaceSpec.defaultModel ?? profileDefaults.defaultModel ?? defaults,
    skillIds: input.workspaceSpec.skillIds ?? profileDefaults.skillIds ?? [],
    // ... merge all fields
  });

  return this.repository.save(merged);
}
```

**WorkspacesController**:

```typescript
router.post('/workspaces/bootstrap', async (req, res) => {
  const { profileId, workspaceSpec } = req.body;

  if (!workspaceSpec) {
    return res.status(400).json({error: 'workspaceSpec required'});
  }

  if (!workspaceSpec.name) {
    return res.status(400).json({error: 'name required'});
  }

  try {
    const workspace = await service.bootstrap({profileId, workspaceSpec});
    res.status(201).json({
      workspaceSpec: workspace,
      created: true,
      message: ...,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(404).json({
        error: 'PROFILE_NOT_FOUND',
        profileId: profileId
      });
    }
    res.status(400).json({error: err.message});
  }
});
```

### Done Criteria

- [ ] POST /workspaces/bootstrap accepts profileId + workspaceSpec
- [ ] Merge order respected: request > profile > defaults
- [ ] With profileId=chief-of-staff, response includes profile's skillIds
- [ ] If request overrides defaultModel, request value wins
- [ ] 404 error when profile not found
- [ ] 400 error when name missing
- [ ] Workspace persisted with correct merged values

---

## ACTION 5: Complete Compiler to DeployableArtifact[]

**Priority**: 🔴 BLOCKER
**Phase**: 3
**Est. Time**: 3 hours

### Problem

Compiler exists but produces incomplete artifacts; missing sourceHash, diagnostic details.

### Solution

Update `packages/workspace-engine/src/compile-openclaw-artifacts.ts` to generate:

```typescript
interface CompileOpenClawWorkspaceInput {
  workspace: WorkspaceSpec;
  agents: AgentSpec[];
  skills: SkillSpec[];
  flows: FlowSpec[];
  profiles: ProfileSpec[];
  policies?: PolicySpec[];
}

export function compileOpenClawWorkspace(input: CompileOpenClawWorkspaceInput): CompileResult {
  // Generate 8 mandatory artifacts:
  return {
    artifacts: [
      {
        id: `${workspace.id}:agents-md`,
        type: 'prompt-file',
        name: 'AGENTS.md',
        path: 'AGENTS.md',
        mediaType: 'text/markdown',
        content: compileAgentsMd(agents),
        sourceHash: sha256(compileAgentsMd(agents))
      },
      {
        id: `${workspace.id}:soul-md`,
        type: 'prompt-file',
        name: 'SOUL.md',
        path: 'SOUL.md',
        mediaType: 'text/markdown',
        content: compileSoulMd(workspace),
        sourceHash: sha256(compileSoulMd(workspace))
      },
      {
        id: `${workspace.id}:tools-md`,
        type: 'prompt-file',
        name: 'TOOLS.md',
        path: 'TOOLS.md',
        mediaType: 'text/markdown',
        content: compileToolsMd(skills),
        sourceHash: sha256(compileToolsMd(skills))
      },
      {
        id: `${workspace.id}:user-md`,
        type: 'prompt-file',
        name: 'USER.md',
        path: 'USER.md',
        mediaType: 'text/markdown',
        content: compileUserMd(workspace),
        sourceHash: sha256(compileUserMd(workspace))
      },
      {
        id: `${workspace.id}:heartbeat-md`,
        type: 'prompt-file',
        name: 'HEARTBEAT.md',
        path: 'HEARTBEAT.md',
        mediaType: 'text/markdown',
        content: compileHeartbeatMd(workspace),
        sourceHash: sha256(compileHeartbeatMd(workspace))
      },
      // .spec.json files
      {
        id: `${workspace.id}:workspace-spec`,
        type: 'workspace',
        name: 'workspace.spec.json',
        path: '.openclaw-studio/workspace.spec.json',
        mediaType: 'application/json',
        content: JSON.stringify(workspace, null, 2),
        sourceHash: sha256(JSON.stringify(workspace))
      },
      {
        id: `${workspace.id}:agents-spec`,
        type: 'agent',
        name: 'agents.spec.json',
        path: '.openclaw-studio/agents.spec.json',
        mediaType: 'application/json',
        content: JSON.stringify(agents, null, 2),
        sourceHash: sha256(JSON.stringify(agents))
      },
      {
        id: `${workspace.id}:skills-spec`,
        type: 'skill',
        name: 'skills.spec.json',
        path: '.openclaw-studio/skills.spec.json',
        mediaType: 'application/json',
        content: JSON.stringify(skills, null, 2),
        sourceHash: sha256(JSON.stringify(skills))
      },
      // ... additional .spec.json for flows, profiles, policies
    ],
    diagnostics: crossValidate(input) // validation errors if any
  };
}
```

### sourceHash Requirement

- Deterministic: same content → same hash
- Used for: diff detection, change tracking
- Calculation: SHA256 of artifact.content
- Never changes value for identical input

### Done Criteria

- [ ] POST /compile returns DeployableArtifact[] with 8+ artifacts
- [ ] Each artifact has sourceHash (non-empty)
- [ ] sourceHash identical for identical input (tested)
- [ ] AGENTS.md, SOUL.md, TOOLS.md, USER.md, HEARTBEAT.md all present
- [ ] .spec.json files complete and valid
- [ ] Cross-validation diagnostics captured

---

## ACTION 6: Implement Preview/Diff/Apply

**Priority**: 🔴 BLOCKER
**Phase**: 3
**Est. Time**: 5 hours

### Problem

Without preview/diff/apply, deployment loop is broken. Generated artifacts unreachable.

### Solution

Implement three endpoints:

#### GET /api/studio/v1/deploy/preview

```
Query: ?workspaceId=xyz

Response:
{
  "workspaceId": "xyz",
  "artifacts": [...],
  "diff": {
    "added": ["AGENTS.md", "SOUL.md"],
    "updated": ["USER.md"],
    "unchanged": ["TOOLS.md"],
    "removed": []
  },
  "timestamp": "..."
}
```

**Logic**:
1. Compile workspace to artifacts
2. Compare against `.openclaw-studio/` on disk
3. Diff by sourceHash:
   - Added: artifact not on disk
   - Updated: artifact exists, different sourceHash
   - Unchanged: artifact exists, same sourceHash
   - Removed: file on disk, not in artifacts

#### POST /api/studio/v1/deploy/apply

```
Body:
{
  "workspaceId": "xyz",
  "confirmed": true
}

Response:
{
  "applied": true,
  "filesWritten": ["AGENTS.md", "SOUL.md", "USER.md"],
  "timestamp": "...",
  "deployPath": ".openclaw-studio/"
}
```

**Logic**:
1. Compile workspace
2. Write each artifact to disk at artifact.path
3. Create `.openclaw-studio/` if missing
4. Return list of files written

### Services

**deploy.service.ts**:
```typescript
class DeployService {
  async preview(workspaceId: string): Promise<DeployPreview> {
    const artifacts = compile(workspaceId);
    const onDisk = readDiskState(workspaceId);
    const diff = calculateDiff(artifacts, onDisk);
    return {workspaceId, artifacts, diff};
  }

  async apply(workspaceId: string): Promise<DeployResult> {
    const artifacts = compile(workspaceId);
    for (const artifact of artifacts) {
      writeFile(artifact.path, artifact.content);
    }
    return {applied: true, filesWritten: artifacts.map(a => a.name)};
  }
}
```

**deploy-diff.service.ts**:
```typescript
function calculateDiff(
  artifacts: DeployableArtifact[],
  onDisk: Map<string, string>
): DeployDiff {
  const added = [];
  const updated = [];
  const unchanged = [];
  const removed = [];

  for (const artifact of artifacts) {
    const current = onDisk.get(artifact.path);
    if (!current) {
      added.push(artifact.name);
    } else if (current !== artifact.sourceHash) {
      updated.push(artifact.name);
    } else {
      unchanged.push(artifact.name);
    }
  }

  for (const [path, hash] of onDisk.entries()) {
    if (!artifacts.find(a => a.path === path)) {
      removed.push(path);
    }
  }

  return {added, updated, unchanged, removed};
}
```

### Done Criteria

- [ ] GET /deploy/preview returns reproducible diff
- [ ] POST /deploy/apply writes to `.openclaw-studio/`
- [ ] sourceHash stable (same input = same hash)
- [ ] Diff accurately categorizes changed/unchanged
- [ ] Files written to correct paths
- [ ] Test: bootstrap → compile → preview → apply

---

## ACTION 7: Complete Gateway SDK

**Priority**: 🟡 IMPORTANT
**Phase**: 4
**Est. Time**: 3 hours

### Problem

Gateway SDK base exists but methods incomplete. Backend can't observe runtime.

### Solution

Complete these files:

- `packages/gateway-sdk/src/client.ts` - HTTP client
- `packages/gateway-sdk/src/protocol.ts` - RPC protocol
- `packages/gateway-sdk/src/methods.ts` - API methods
- `packages/gateway-sdk/src/types.ts` - Type definitions
- `packages/gateway-sdk/src/auth.ts` - Auth if needed

### Required Methods

```typescript
interface GatewayClient {
  health(): Promise<{status: 'healthy'|'degraded'|'unhealthy'}>;
  diagnostics(): Promise<GatewayDiagnostics>;
  agents.list(): Promise<AgentInstance[]>;
  sessions.list(): Promise<SessionInfo[]>;
}
```

### Backend Integration

```typescript
// apps/api/src/modules/gateway/gateway.service.ts
class GatewayService {
  private client: GatewayClient;

  async getHealth() {
    return this.client.health();
  }

  async getDiagnostics() {
    return this.client.diagnostics();
  }
}
```

### Done Criteria

- [ ] Gateway client can connect to gateway
- [ ] health() returns status
- [ ] diagnostics() returns full diagnostics
- [ ] agents.list() returns running agents
- [ ] sessions.list() returns active sessions
- [ ] Errors normalized (no raw HTTP errors)

---

## ACTION 8: Wire Frontend to Real Endpoints

**Priority**: 🟡 CRITICAL
**Phase**: 5
**Est. Time**: 4 hours

### RULE: NO MORE HARDWIRED MOCKS

Frontend must consume real API ONLY. Delete mocks before wiring real endpoints.

### Required Endpoints Wiring

**ProfilesGallery**:
```typescript
// Get real profiles
const profiles = await fetch('/api/studio/v1/profiles');
// Display as cards
```

**WorkspaceCreator**:
```typescript
// POST to real bootstrap
const workspace = await fetch('/api/studio/v1/workspaces/bootstrap', {
  method: 'POST',
  body: JSON.stringify({profileId, workspaceSpec})
});
```

**CompilePreview**:
```typescript
// GET real compile + preview
const compiled = await fetch('/api/studio/v1/compile');
const preview = await fetch('/api/studio/v1/deploy/preview');
// Show artifacts + diff
```

**DeployPanel**:
```typescript
// POST real apply
const result = await fetch('/api/studio/v1/deploy/apply', {
  method: 'POST',
  body: JSON.stringify({workspaceId, confirmed: true})
});
```

**StatusDashboard**:
```typescript
// GET real gateway stats
const health = await fetch('/api/studio/v1/gateway/health');
const diag = await fetch('/api/studio/v1/gateway/diagnostics');
// Display live status
```

### Done Criteria

- [ ] ProfileCard pulls from real GET /profiles
- [ ] WorkspaceForm posts to real bootstrap
- [ ] No hardcoded profile lists in frontend
- [ ] CompilePanel shows real artifacts
- [ ] DeployPanel shows real preview/diff
- [ ] StatusPanel shows real gateway health
- [ ] E2E flow works: select profile → bootstrap → compile → preview → apply

---

## ACTION 9: Add Tests & Fixtures

**Priority**: 🟡 IMPORTANT
**Phase**: 5 (parallel with 8)
**Est. Time**: 3 hours

### Unit Tests

- [ ] Profile loader: valid .md + .json → ProfileSpec
- [ ] Profile loader: invalid .json → clear error
- [ ] Routine loader: .md with heading → RoutineSpec
- [ ] Merge order: request values override profile
- [ ] Compiler: deterministic sourceHash
- [ ] Diff: added/updated/unchanged categorization

### Integration Tests

- [ ] GET /profiles returns dynamic catalog
- [ ] GET /routines returns dynamic catalog
- [ ] POST /workspaces/bootstrap merges correctly
- [ ] POST /compile returns valid artifacts
- [ ] GET /deploy/preview shows diff
- [ ] POST /deploy/apply writes files

### E2E Test

**Scenario**: Add new profile, bootstrap, compile, deploy

```
1. Create templates/profiles/e2e-test-profile.md
2. Create templates/profiles/e2e-test-profile.json
3. Restart API (or trigger reload)
4. GET /profiles includes e2e-test-profile
5. POST /workspaces/bootstrap with profileId=e2e-test-profile
6. Verify workspace has profile defaults
7. POST /compile
8. GET /deploy/preview
9. POST /deploy/apply
10. Verify files written to .openclaw-studio/
```

### Done Criteria

- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] E2E scenario reproducible
- [ ] New profiles auto-detected
- [ ] Full workflow exercises all endpoints

---

## ACTION 10: Freeze Frontend Until Backend Complete

**Priority**: 🔴 GOVERNANCE
**Phase**: 1-5 (entire effort)

### Rule

**Do not approve frontend PRs** that:
- Hardwire mock data
- Expand canvas/UI without backend integration points
- Add features not connected to real APIs

### Enforcement

1. Code review checklist: "Does this consume real API endpoint?"
2. If not → Approve only if marked `[WIP]` and blocks merge
3. No merging hardwired mocks into main

### Why

Frontend advancement without backend support creates:
- False sense of progress
- Technical debt (mocks to remove later)
- Divergence between UI and API contracts
- Rework when backend finally arrives

### When to Unfreeze

Only after Phase 3 complete:
- [ ] Loaders working
- [ ] Profiles/routines dynamic
- [ ] Bootstrap real
- [ ] Compile complete
- [ ] Preview/diff/apply working

---

## Execution Timeline

### Week 1: Phase 1 (Foundation Dynamic)
- [ ] Implement all loaders (16 hours)
- [ ] Complete sidecars (8 hours)
- [ ] Audit ProfilesService (4 hours)
- [ ] **FREEZE Frontend**

### Week 2: Phase 2-3 (Bootstrap + Deploy)
- [ ] Real bootstrap (8 hours)
- [ ] Compiler complete (6 hours)
- [ ] Preview/diff/apply (12 hours)
- [ ] Unit tests (6 hours)

### Week 3: Phase 4-5 (Gateway + Wiring)
- [ ] Gateway SDK (8 hours)
- [ ] Frontend wiring (12 hours)
- [ ] Integration tests (6 hours)
- [ ] E2E testing (4 hours)

### Total: ~110 hours (~2.5 weeks, one developer full-time)

---

## Verification Checklist

Before marking **SYSTEM COMPLETE**, audit:

### Architecture
- [ ] No hardcoded profiles in code
- [ ] No hardcoded routines in code
- [ ] No hardcoded workspace defaults
- [ ] All config from markdown/JSON sidecars

### APIs
- [ ] GET /profiles returns dynamic catalog
- [ ] GET /routines returns dynamic catalog
- [ ] POST /workspaces/bootstrap merges correctly
- [ ] POST /compile returns complete DeployableArtifact[]
- [ ] GET /deploy/preview reproducible
- [ ] POST /deploy/apply writes correct files

### Frontend
- [ ] No mocks hardwired
- [ ] All endpoints consume real API
- [ ] Profile selector → GET /profiles
- [ ] Workspace creation → POST /workspaces/bootstrap
- [ ] Compile → POST /compile
- [ ] Deploy → GET /deploy/preview + POST /deploy/apply

### Testing
- [ ] Add new profile to templates/ → auto-detected
- [ ] Workflow: bootstrap → compile → preview → apply all work
- [ ] Gateway health/diagnostics accessible
- [ ] No console errors from API integration

### Documentation
- [ ] ARCHITECTURE_STATUS.md updated
- [ ] API endpoints documented
- [ ] Merge order documented
- [ ] Deployment workflow clear

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Profiles dynamic | 100% from markdown |
| Routines dynamic | 100% from markdown |
| Bootstrap success rate | 100% |
| Compile artifact completeness | 100% (8 artifacts + valid schemas) |
| Diff reproducibility | 100% (identical for same input) |
| Deploy success | 100% (files written to correct paths) |
| Frontend API integration | 100% (no hardwired mocks) |
| Test coverage (critical paths) | 80%+ |

---

## Sign-Off Template

When each action complete, mark:

```markdown
## ACTION [X]: [Name]
- [x] Implemented
- [x] Tested
- [x] Code reviewed
- [x] Deployed to dev
- [ ] Documentation updated
- [ ] Ready for next action

Completed by: [Name]
Date: [Date]
```

---

**Document Status**: ACTIVE
**Last Updated**: 2026-04-15
**Next Review**: After Action 1 completion
