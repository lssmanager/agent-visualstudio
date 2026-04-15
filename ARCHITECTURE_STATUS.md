# Architecture Status & Gap Analysis

**Date**: 2026-04-15
**Status**: Foundation Solid, Gaps Critical
**Owner**: Development Team

---

## Executive Summary

The system has strong type foundations and markdown templates, but **does NOT yet use markdown/JSON as live source of truth**. Current state is 40% foundation + 60% gaps. The main issue is not architecture—it's wiring.

**Primary Gap**: Hardcoded profiles still active in ProfilesService instead of loading from markdown catalog.

---

## Traffic Light Status

| Component | Status | Details |
|-----------|--------|---------|
| **Type System** | 🟢 GREEN | AgentSpec, WorkspaceSpec, schemas exist |
| **Markdown Templates** | 🟢 GREEN | Profiles and routines .md files exist |
| **Loaders** | 🟡 YELLOW | Partial; need full implementation |
| **Profile Catalog** | 🔴 RED | Not loading from markdown dynamically |
| **Routine Catalog** | 🔴 RED | Not loading from markdown dynamically |
| **Sidecars JSON** | 🟡 YELLOW | Basic structure unclear; need validation |
| **Bootstrap** | 🟡 YELLOW | Exists but uses fixed defaults, not profile merge |
| **Compiler** | 🟡 YELLOW | Base exists; incomplete artifacts + hashes |
| **Preview/Diff/Apply** | 🔴 RED | Not implemented |
| **Gateway SDK** | 🟡 YELLOW | Base exists; needs completion |
| **Frontend Studio** | 🟡 YELLOW | Structure exists; hardwired to mocks |

---

## Critical Gaps

### Gap 1: ProfilesService Hardcoding
**Severity**: 🔴 BLOCKER

**Current State**:
```typescript
// BAD: Still hardcoded
export class ProfilesService {
  getAll() {
    return [chiefOfStaffProfile, executiveAssistantProfile, ...];
  }
}
```

**Required State**:
```typescript
// GOOD: Dynamic from markdown
export class ProfilesService {
  async getAll(basePath = process.cwd()): Promise<ProfileSpec[]> {
    return loadProfilesCatalog(basePath);
  }
}
```

**Impact**: GET /profiles returns hardcoded values instead of detecting new profiles.

---

### Gap 2: Loaders Not Deployed
**Severity**: 🔴 BLOCKER

**Missing Files**:
- `packages/profile-engine/src/loaders/load-profile-markdown.ts`
- `packages/profile-engine/src/loaders/load-profiles-catalog.ts`
- `packages/profile-engine/src/loaders/load-routine-markdown.ts`
- `packages/profile-engine/src/loaders/load-routines-catalog.ts`
- `packages/workspace-engine/src/loaders/load-workspace-preset.ts`

**Impact**: No runtime loading capability.

---

### Gap 3: JSON Sidecars Incomplete
**Severity**: 🟡 CRITICAL

**Required Files** (complete, validated):
- `templates/profiles/chief-of-staff.json`
- `templates/profiles/daily-task-manager.json`
- `templates/profiles/dev-agent.json`
- `templates/profiles/executive-assistant.json`
- `templates/profiles/monitoring-agent.json`
- `templates/profiles/orchestrator.json`
- `templates/profiles/relationship-manager.json`

**Each Must Include**:
```json
{
  "id": "profile-id",
  "name": "Profile Name",
  "category": "operations|support|engineering|monitoring",
  "description": "...",
  "defaultModel": "openai/gpt-5.4-mini",
  "defaultSkills": ["skill1", "skill2"],
  "defaultPolicies": ["policy1"],
  "routines": ["routine1", "routine2"],
  "tags": ["tag1"],
  "visibility": "public|private",
  "priority": 1
}
```

**Impact**: Sidecars incomplete = metadata unreliable.

---

### Gap 4: Bootstrap Not Using Profile Merge
**Severity**: 🔴 BLOCKER

**Current**: Creates workspace with fixed defaults.
**Required**: Real merge order: request > profile > system defaults.

**Impact**: Bootstrap appears to work but ignores profile configuration.

---

### Gap 5: Compile Incomplete
**Severity**: 🔴 BLOCKER

Missing:
- DeployableArtifact[] fully populated
- sourceHash calculation
- All templates (AGENTS.md, SOUL.md, TOOLS.md, USER.md, HEARTBEAT.md)

**Impact**: Compile output unreliable for deployment.

---

### Gap 6: Preview/Diff/Apply Not Implemented
**Severity**: 🔴 BLOCKER

**Missing Endpoints**:
- GET /deploy/preview
- POST /deploy/apply

**Impact**: No deployment workflow. Loop is broken.

---

### Gap 7: Frontend Wired to Mocks
**Severity**: 🔴 BLOCKER

Studio/ProfilesGallery/WorkspaceEditor hardwired to UI-only state, not real endpoints.

**Impact**: Frontend unusable with real backend.

---

## What IS Working

✅ Type system (AgentSpec, WorkspaceSpec, etc.)
✅ Markdown template files (profiles, routines)
✅ Express.js server structure
✅ Schema validation (Zod)
✅ Workspace file persistence
✅ Compiler base structure
✅ Gateway SDK skeleton

---

## What IS NOT Working Yet

❌ Dynamic profile loading from markdown
❌ Dynamic routine loading from markdown
❌ Real workspace bootstrap from profile
❌ Complete compilation to artifacts
❌ Preview/diff/apply deployment
❌ Frontend connected to real API
❌ Gateway real-time integration

---

## Definition of Done (Real)

The system is considered **DONE** only when:

1. **Developers can add new profiles without code changes**:
   - Create `templates/profiles/new-profile.md`
   - Create `templates/profiles/new-profile.json`
   - Restart API
   - New profile appears in GET /profiles

2. **Workspace creation from profile works**:
   - POST /workspaces/bootstrap accepts profileId
   - Profile defaults merged correctly
   - Request fields override profile fields

3. **Compilation produces real artifacts**:
   - POST /compile generates DeployableArtifact[]
   - Each artifact has sourceHash
   - All templates (AGENTS.md, SOUL.md, TOOLS.md, USER.md, HEARTBEAT.md) present

4. **Deployment preview/apply works**:
   - GET /deploy/preview shows diff
   - POST /deploy/apply writes files
   - Developers can see what will be deployed before committing

5. **Frontend connected to reality**:
   - Profile selector pulls from real endpoint
   - Workspace creation form -> real bootstrap
   - Compile preview -> real artifacts
   - Deploy panel -> real apply

---

## Risk Assessment

### Risk 1: False Sense of Progress
**Current State**: Hardcoded profiles create illusion of working system.
**Risk**: Developers think profiles are dynamic when they're not.
**Mitigation**: Audit ProfilesService immediately.

### Risk 2: Frontend Ahead of Backend
**Current State**: Studio has extensive UI but no real endpoints.
**Risk**: Hard to rewire when backend finally delivers.
**Mitigation**: FREEZE frontend work until backend gaps close.

### Risk 3: Deployment Loop Broken
**Current State**: Compile works; deploy doesn't.
**Risk**: Generated artifacts unreachable from production.
**Mitigation**: Implement preview/diff/apply before marking "done".

### Risk 4: Sidecars Inconsistent
**Current State**: JSON files not verified against schema.
**Risk**: Some profiles invalid; loader fails on edge cases.
**Mitigation**: Validate all sidecars against profile.schema.json immediately.

---

## Phase Breakdown

### Phase 1: Foundation Dynamic (CRITICAL)
**Est. 2-3 days**

- [ ] Implement all loaders
- [ ] Validate all sidecars against schema
- [ ] Wire ProfilesService to use loaders (remove hardcoding)
- [ ] Wire RoutinesService to use loaders
- [ ] Audit: GET /profiles returns from markdown, not hardcoded

**Done When**: New profile in templates/ auto-appears in GET /profiles

---

### Phase 2: Real Bootstrap
**Est. 1-2 days**

- [ ] Implement load-workspace-preset.ts
- [ ] Wire WorkspacesService.bootstrap() to load profile
- [ ] Implement merge order: request > profile > defaults
- [ ] Audit: POST /workspaces/bootstrap respects merge order

**Done When**: Bootstrap with profileId works; request overrides win

---

### Phase 3: Deployment Workflow
**Est. 2-3 days**

- [ ] Complete artifacts in compiler
- [ ] Add sourceHash calculation
- [ ] Implement GET /deploy/preview
- [ ] Implement POST /deploy/apply
- [ ] Ensure deterministic diff

**Done When**: Preview reproducible; apply writes correct files

---

### Phase 4: Gateway Integration
**Est. 1-2 days**

- [ ] Complete gateway-sdk/src/client.ts
- [ ] Implement health, diagnostics, agents.list, sessions.list
- [ ] Add error normalization
- [ ] Wire backend to query gateway

**Done When**: Backend can poll real gateway stats

---

### Phase 5: Frontend Wiring
**Est. 2-3 days**

- [ ] ProfilesGallery -> GET /profiles
- [ ] WorkspaceCreator -> POST /workspaces/bootstrap
- [ ] CompilePreview -> POST /compile + GET /deploy/preview
- [ ] DeployPanel -> POST /deploy/apply
- [ ] StatusDashboard -> GET /gateway/... endpoints

**Done When**: Full UI flow works end-to-end with real APIs

---

## Deployment Checklist

Before marking **DONE**, audit:

- [ ] No hardcoded profiles in ProfilesService
- [ ] No hardcoded routines in RoutinesService
- [ ] All sidecars valid against schema
- [ ] GET /profiles returns dynamic catalog
- [ ] GET /routines returns dynamic catalog
- [ ] POST /workspaces/bootstrap merges correctly
- [ ] POST /compile returns complete artifacts
- [ ] sourceHash stable for identical inputs
- [ ] GET /deploy/preview shows diff
- [ ] POST /deploy/apply writes files
- [ ] Frontend consumes real endpoints only
- [ ] E2E test: add profile -> bootstrap -> compile -> preview -> apply

---

## Action Items for Leadership

1. **Freeze frontend expansion** until backend gaps close (Phases 1-3)
2. **Prioritize loaders + sidecars** (Phase 1 is blocker)
3. **Audit current ProfilesService** today (confirm hardcoding issue)
4. **Assign developer to close Phases 1-3** sequentially (no parallel work on Foundation gaps)
5. **Do not merge frontend PRs** that hardwire to mocks instead of real endpoints

---

## Next Steps

1. **Immediate**: Run `GET /profiles` against current API, confirm it returns hardcoded imports
2. **Immediate**: Validate sidecars against `packages/schemas/profile.schema.json`
3. **Today**: Plan Phase 1 (loaders)
4. **This Week**: Execute Phase 1-2
5. **Next Week**: Execute Phase 3-5

---

## References

- **Detailed Action Plan**: UNIFIED_ACTION_PLAN.md
- **Test Verification**: TEST_IMPLEMENTATION.md
- **Quick Start**: QUICK_START.md
- **Implementation Guide**: IMPLEMENTATION_SUMMARY.md

---

**Status Last Updated**: 2026-04-15
**Next Review**: After Phase 1 completion
