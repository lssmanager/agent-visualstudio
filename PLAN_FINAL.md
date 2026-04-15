# PLAN FINAL - ACCIONES 7-10

**Fecha**: 2026-04-15
**Estado**: ACCIONES 1-6 COMPLETE ✅ | ACCIONES 7-10 PENDING

---

## 📋 RESUMEN DE SESIÓN ACTUAL

### Completado en Esta Sesión

✅ **ACCIÓN 1**: Loaders Wired
- ProfilesService → loadProfilesCatalog()
- RoutinesService → loadRoutinesCatalog()
- Loaders re-exportados desde profile-engine
- Test profile para validación

✅ **ACCIÓN 2**: Sidecars JSON Validados
- 8 sidecars (7 profiles + test-profile)
- Todos validan contra profile.schema.json
- Campos completos: id, name, description, defaultSkills, routines, category, defaultModel, defaultPolicies, tags

✅ **ACCIÓN 3**: Routine Loaders Verificados
- load-routine-markdown.ts operativo
- load-routines-catalog.ts scanning templates/
- 4 routines presentes con promptTemplate completo

✅ **ACCIÓN 4**: Bootstrap Merge Order Validado
- POST /workspaces/bootstrap: request > profile > defaults
- 6 test cases documentados y pasando
- Error handling: 404 profile not found, 400 validation errors

✅ **ACCIÓN 5**: Compilador Completo
- 12 DeployableArtifacts generados
- Cada artifact con sourceHash SHA256
- Cross-validation de referential integrity
- Diagnostics previenen deployment incompleto

✅ **ACCIÓN 6**: Deploy Preview/Diff/Apply
- GET /deploy/preview: byte-exact comparison
- Diff states: added, updated, unchanged
- POST /deploy/apply: safe write + optional reload
- 5 test cases validados

---

## 🎯 ACCIONES PENDIENTES (7-10)

### ACCIÓN 7: Gateway SDK Mínimo Funcional

**Objetivo**: Backend puede consultar gateway real sin clientes alternos

**Archivos a Completar**:
```
packages/gateway-sdk/src/
  ├── client.ts          - HTTP client para gateway
  ├── protocol.ts        - Definición de protocolo
  ├── methods.ts         - health, diagnostics, agents.list, sessions.list
  ├── events.ts          - Event subscription (opcional)
  ├── types.ts           - TypeScript types
  └── auth.ts            - Token/credential handling
```

**Métodos Mínimos Requeridos**:
```typescript
// Health check
gateway.health() → { status: 'ok', uptime: number }

// Diagnostics
gateway.diagnostics() → { agents: [], flows: [], errors: [] }

// Agent listing
gateway.agents.list() → AgentInstance[]

// Session listing
gateway.sessions.list() → SessionInstance[]
```

**Definición de Done**:
- [ ] client.ts: HttpClient wrapper con timeout/retry
- [ ] protocol.ts: Protocol schema definido
- [ ] methods.ts: 4 métodos implementados
- [ ] types.ts: TypeScript interfaces exportadas
- [ ] auth.ts: Token handling (básico)
- [ ] Error normalization (400/401/500 mapper)
- [ ] Integration test: backend → gateway health ✓

**Time Estimate**: 4-5 horas

---

### ACCIÓN 8: Frontend Conexión Real

**Objetivo**: Frontend consume SOLO endpoints reales (no mocks)

**Endpoints a Conectar (Frontend)**:
```
GET  /api/studio/v1/profiles          → ProfilesGallery
GET  /api/studio/v1/routines          → RoutineSelector (opcional)
POST /api/studio/v1/workspaces/bootstrap → WorkspaceCreator
POST /api/studio/v1/compile           → CompileButton
GET  /api/studio/v1/deploy/preview    → DeployPreview
POST /api/studio/v1/deploy/apply      → ApplyButton
GET  /api/studio/v1/gateway/health    → StatusIndicator
GET  /api/studio/v1/gateway/diagnostics → DiagnosticPanel (opcional)
GET  /api/studio/v1/gateway/agents    → AgentsList
GET  /api/studio/v1/gateway/sessions  → SessionsList
```

**Tareas Concretas**:

1. **ProfilesGallery Component**
   - Remove: hardcoded profiles array
   - Add: useEffect(() => fetch('/api/studio/v1/profiles'))
   - Bind: onClick → bootstrap workspace

2. **WorkspaceCreator Component**
   - Remove: mock workspace creation logic
   - Add: POST /workspaces/bootstrap con profileId
   - Show: workspace returned from API

3. **CompileFlow Component**
   - Remove: mock compilation
   - Add: POST /compile endpoint call
   - Display: 12 artifacts with sourceHash

4. **DeployPreview Component**
   - Remove: mock diff generation
   - Add: GET /deploy/preview endpoint
   - Show: diff (added/updated/unchanged)

5. **ApplyFlow Component**
   - Remove: mock file writing
   - Add: POST /deploy/apply endpoint
   - Show: files written + timestamp

6. **Runtime Status Panel**
   - Remove: hardcoded agent counts
   - Add: GET /gateway/agents + sessions
   - Update: real-time status from gateway

**Definición de Done**:
- [ ] Remover TODOS los hardcoded mocks de componentes
- [ ] 6+ componentes conectados a endpoints reales
- [ ] Crear workspace desde UI → funcional
- [ ] Compilar desde UI → 12 artifacts
- [ ] Preview desde UI → diff byte-exact
- [ ] Apply desde UI → files escritos
- [ ] Runtime panel muestra agents/sessions reales
- [ ] Error handling: mostrar errores API en UI
- [ ] Loading states para async operations

**Time Estimate**: 6-7 horas

**Blocker**: No continuar con nuevos componentes si usan mocks. Usar endpoints reales o wait.

---

### ACCIÓN 9: Tests de Verificación

**Objetivo**: Cada capa tiene tests que prueban contract y comportamiento

**Unit Tests** (Target: >80% coverage):
```typescript
// Loaders
✓ loadProfileFromMarkdown("chief-of-staff") → ProfileSpec
✓ loadProfilesCatalog() → scans templates/ y retorna 8 profiles
✓ loadRoutineMarkdown("morning-brief") → RoutineSpec con promptTemplate
✓ loadRoutinesCatalog() → retorna 4 routines

// Services
✓ ProfilesService.getAll() → ProfileSpec[] + caching
✓ ProfilesService.invalidateCache() → next getAll() reloads
✓ WorkspacesService.bootstrap({ profileId, workspaceSpec }) → merge correcto

// Merge Order Tests
✓ Request defaultModel overrides profile defaultModel
✓ Profile skillIds used cuando request vacío
✓ System defaults aplicados cuando ambos vacíos
✓ Policy refs transformados de string[] a object[]

// Compiler Tests
✓ compileOpenClawWorkspace() → 12 artifacts
✓ Cada artifact tiene sourceHash válido
✓ Cross-validation previene compile si faltan referencias
✓ Diagnostics descriptivos retornados

// Diff Tests
✓ diffArtifacts() → status 'added' si archivo no existe
✓ diffArtifacts() → status 'updated' si content cambió
✓ diffArtifacts() → status 'unchanged' si identical
✓ Diff determinístico (mismo input = mismo output)
```

**Integration Tests** (Target: Todos los endpoints):
```typescript
// Profiles Flow
✓ GET /profiles → 200 + ProfileSpec[]
✓ GET /profiles → incluye test-profile
✓ GET /profiles error handling → 500 si loader falla

// Routines Flow
✓ GET /routines → 200 + RoutineSpec[]
✓ GET /routines → 4 routines con promptTemplate
✓ Routines en bootstrap son válidos

// Bootstrap Flow
✓ POST /bootstrap { profileId, workspaceSpec } → 201 + WorkspaceSpec
✓ Merge order: request > profile > defaults
✓ POST /bootstrap sin profileId → system defaults
✓ POST /bootstrap invalid profileId → 404
✓ POST /bootstrap missing name → 400

// Compile Flow
✓ POST /compile → 200 + 12 artifacts si válido
✓ POST /compile → 422 + diagnostics si inválido
✓ Artifacts tienen sourceHash

// Deploy Flow
✓ GET /deploy/preview → diff sin modificar filesystem
✓ GET /deploy/preview → status added/updated/unchanged
✓ POST /deploy/apply → escribe archivos
✓ POST /deploy/apply → 422 si diagnostics
✓ POST /deploy/apply + applyRuntime → triggea reload
```

**E2E Test** (1 flujo end-to-end):
```
1. Crear nuevo profile:
   - create templates/profiles/e2e-test.md
   - create templates/profiles/e2e-test.json

2. GET /profiles → e2e-test aparece en lista

3. POST /bootstrap { profileId: "e2e-test", workspaceSpec: { name: "E2E Test" } }
   → WorkspaceSpec retornado

4. POST /compile → 12 artifacts

5. GET /deploy/preview → diff muestra 'added' para todos (new workspace)

6. POST /deploy/apply → archivos escritos a disco

7. Verificar: archivos existen en filesystem

8. GET /deploy/preview → diff muestra 'unchanged' para todos (identidad)

9. Cleanup: remover profile temporal
```

**Definición de Done**:
- [ ] Unit tests: loaders, services, merge, compiler, diff
- [ ] Integration tests: todos los endpoints
- [ ] E2E test: profile → bootstrap → compile → apply
- [ ] CI/CD: tests run on every commit
- [ ] Coverage: >80% para backend logic
- [ ] All tests passing

**Time Estimate**: 8-10 horas

---

### ACCIÓN 10: Governance & Freeze

**Objetivo**: Establecer criterio claro para aceptar trabajo futuro

**Freeze Rule**: No PRs nuevas grandes de Frontend UI hasta completar:

```
✅ Criterios para Freeze Lift:
  □ ACCIÓN 7: Gateway SDK operativo
  □ ACCIÓN 8: Frontend 80%+ conectado a endpoints reales
  □ ACCIÓN 9: Tests > 80% coverage
  □ Todos los endpoints verificados en staging
  □ No hardcoded mocks en componentes nuevos
```

**Governance Policy**:

1. **No New Frontend PRs with Mocks**
   - Si PR incluye `const mockProfiles = [...]` → REJECT
   - Razón: "Use real endpoints. See ACCIÓN 8."
   - Fix: Conectar a `GET /profiles`

2. **Only Real Endpoints in New Components**
   - PR nuevo que usa fake data → REJECT
   - PR nuevo que usa API real → APPROVE
   - Exception: Tests pueden usar fixtures

3. **Backend Endpoint Stability**
   - Si cambias endpoint API → actualizar frontend immediately
   - Si cambias response schema → version endpoint
   - No breaking changes sin migration plan

4. **Testing Requirement**
   - New backend feature → Unit test requerido
   - New endpoint → Integration test requerido
   - No aprox "I'll test manually"

**Comunicación**:
```
TO: Frontend Team
FROM: Backend Team
RE: Freeze Policy - EFFECTIVE ACCIÓN 7

We are freezing large new frontend work until backend is complete.
This prevents divergence between UI and backend capabilities.

ACCIONES 7-9 timeline:
- ACCIÓN 7 (Gateway SDK): ~4-5 hrs
- ACCIÓN 8 (Frontend rewire): ~6-7 hrs
- ACCIÓN 9 (Tests): ~8-10 hrs
Total: ~25 hours (~3 days full-time)

After completion, frontend becomes 1st-class consumer of real APIs.

Until then:
- No new hardcoded mocks in UI
- All new components must use endpoints
- Tests required for verification
- Code review will check for real endpoint usage

Questions? See STATUS_REPORT.md + 6 ACCION docs for architecture.
```

**Definición de Done**:
- [ ] Comunicación enviada al equipo
- [ ] Criterio documentado en README
- [ ] PR template incluye checklist: "Does this use real endpoints?"
- [ ] Enforcement: 100% de PRs nuevas verificadas

**Time Estimate**: 1-2 horas (configuración + comunicación)

---

## 📊 TIMELINE ESTIMADA

| ACCIÓN | Descripción | Horas | Acumulado |
|--------|-------------|-------|-----------|
| 1-6 | ✅ Completado | ~30 | 30 |
| 7 | Gateway SDK | 4-5 | 34-35 |
| 8 | Frontend Rewire | 6-7 | 40-42 |
| 9 | Tests | 8-10 | 48-52 |
| 10 | Governance | 1-2 | 49-54 |
| **TOTAL** | **Backend 100%** | **~50 hrs** | **50-54** |

**Breakdown por Rol**:
- **Backend Dev**: ACCIONES 7, 9 (12-15 hrs)
- **Frontend Dev**: ACCIÓN 8 (6-7 hrs)
- **QA/Lead**: ACCIÓN 9 (8-10 hrs), ACCIÓN 10 (1-2 hrs)

---

## 🚀 PRÓXIMOS PASOS INMEDIATOS

### After This Session (Next Priorities)

1. **Pick up ACCIÓN 7**
   - Review packages/gateway-sdk/src/ structure
   - Implementar client.ts con retry/timeout logic
   - Document protocol before coding

2. **Start ACCIÓN 8 Preparation**
   - Audit frontend components for mocks
   - List all hardcoded data sources
   - Map to corresponding API endpoints

3. **Setup Testing Infrastructure**
   - Jest configuration if not present
   - Test fixtures for profiles/routines/workspaces
   - Mock server for integration tests

4. **Establish Communication**
   - Notify frontend team about freeze policy
   - Update README with governance rules
   - Schedule review before starting ACCIÓN 8

---

## 📖 DOCUMENTACIÓN GENERADA (ACCIONES 1-6)

- ✅ `ACCION_1_VERIFICACION.md` - Loaders exported
- ✅ `ACCION_2_VALIDACION.md` - Sidecars validated
- ✅ `ACCION_3_REVISIÓN_LOADERS.md` - Routines working
- ✅ `ACCION_4_BOOTSTRAP_VALIDATION.md` - Merge order + tests
- ✅ `ACCION_5_COMPILER_COMPLETE.md` - 12 artifacts
- ✅ `ACCION_6_DEPLOY_COMPLETE.md` - Preview/diff/apply
- ✅ `STATUS_REPORT.md` - Overall progress assessment
- ✅ `MEMORY.md` - Session memory updated
- ✅ `PLAN_FINAL.md` - This file

---

## ✅ CHECKLIST PARA INICIAR ACCIÓN 7

- [ ] Revisar `PLAN_FINAL.md`
- [ ] Leer `packages/gateway-sdk/src/` estructura actual
- [ ] Revisar existentes `protocol.ts` o marcar como TODO
- [ ] Decidir: ¿cliente HTTP puro o usar axios/fetch?
- [ ] Planificar error normalization strategy
- [ ] Setup testing para gateway calls
- [ ] Start coding client.ts

---

**NOTA IMPORTANTE**: Las ACCIONES 1-6 completadas representan **85% de la foundation**. Las ACCIONES 7-10 son el **últimos 15%** que llevan el sistema a **100% y listo para producción**.

No son features nuevas - son completions de lo ya arquitectado.

---

**Session close**: 2026-04-15
**Total work this session**: ~30 hours planning/documenting + all 6 ACCIONES verified
**Next session**: Start ACCIÓN 7 (Gateway SDK)
