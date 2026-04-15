# ACCIÓN 2 - Validación de Sidecars JSON

## Estado: ✅ COMPLETADO

Fecha: 2026-04-15

---

## Campos Requeridos (según profile.schema.json)

✅ **id** (string)
✅ **name** (string)
✅ **description** (string)
✅ **defaultSkills** (array of strings)
✅ **routines** (array of strings)

## Campos Opcionales (pero recomendados)

- **category** (enum: operations | support | engineering | monitoring)
- **defaultModel** (string)
- **defaultPolicies** (array of strings)
- **defaultRoutingRules** (array de objects)
- **tags** (array of strings)

---

## Auditoría de 8 Sidecars JSON

### 1. chief-of-staff.json

```json
{
  "id": "chief-of-staff",
  "name": "Chief of Staff",
  "description": "Operational orchestrator...",
  "category": "operations",
  "defaultModel": "openai/gpt-5.4-mini",
  "defaultSkills": ["status.read", "tasks.manage", "notes.capture"],
  "defaultPolicies": ["safe-operator"],
  "routines": ["morning-brief", "eod-review", "followup-sweep", "task-prep"],
  "tags": ["orchestration", "follow-ups", "leadership"]
}
```

✅ Requeridos: ✓ id, ✓ name, ✓ description, ✓ defaultSkills, ✓ routines
✅ Opcionales: ✓ category, ✓ defaultModel, ✓ defaultPolicies, ✓ tags
✅ Sin campos adicionales

---

### 2. daily-task-manager.json

```json
{
  "id": "daily-task-manager",
  "name": "Daily Task Manager",
  "description": "Ensure daily execution discipline...",
  "category": "operations",
  "defaultModel": "openai/gpt-5.4-mini",
  "defaultSkills": ["tasks.manage", "calendar.read"],
  "defaultPolicies": ["safe-operator"],
  "routines": ["morning-brief", "task-prep", "eod-review"],
  "tags": ["task-execution", "planning", "discipline"]
}
```

✅ Requeridos: ✓ id, ✓ name, ✓ description, ✓ defaultSkills, ✓ routines
✅ Opcionales: ✓ category, ✓ defaultModel, ✓ defaultPolicies, ✓ tags
✅ Sin campos adicionales

---

### 3. dev-agent.json

```json
{
  "id": "dev-agent",
  "name": "Dev Agent",
  "description": "Handle development tasks...",
  "category": "engineering",
  "defaultModel": "openai/gpt-5.3-codex",
  "defaultSkills": ["code.search", "code.edit", "tests.run"],
  "defaultPolicies": ["safe-operator"],
  "routines": ["task-prep", "eod-review"],
  "tags": ["development", "code-quality", "engineering"]
}
```

✅ Requeridos: ✓ id, ✓ name, ✓ description, ✓ defaultSkills, ✓ routines
✅ Opcionales: ✓ category, ✓ defaultModel, ✓ defaultPolicies, ✓ tags
✅ Sin campos adicionales

---

### 4. executive-assistant.json

```json
{
  "id": "executive-assistant",
  "name": "Executive Assistant",
  "description": "Support executive communication...",
  "category": "support",
  "defaultModel": "openai/gpt-5.4-mini",
  "defaultSkills": ["calendar.read", "tasks.manage", "notes.capture"],
  "defaultPolicies": ["safe-operator"],
  "routines": ["morning-brief", "task-prep", "followup-sweep"],
  "tags": ["communication", "coordination", "support"]
}
```

✅ Requeridos: ✓ id, ✓ name, ✓ description, ✓ defaultSkills, ✓ routines
✅ Opcionales: ✓ category, ✓ defaultModel, ✓ defaultPolicies, ✓ tags
✅ Sin campos adicionales

---

### 5. monitoring-agent.json

```json
{
  "id": "monitoring-agent",
  "name": "Monitoring Agent",
  "description": "Provide visibility into system health...",
  "category": "monitoring",
  "defaultModel": "openai/gpt-5.4-mini",
  "defaultSkills": ["health.read", "logs.analyze", "usage.cost.read"],
  "defaultPolicies": ["safe-operator"],
  "routines": ["system-check", "anomaly-scan"],
  "tags": ["monitoring", "health", "diagnostics"]
}
```

✅ Requeridos: ✓ id, ✓ name, ✓ description, ✓ defaultSkills, ✓ routines
✅ Opcionales: ✓ category, ✓ defaultModel, ✓ defaultPolicies, ✓ tags
✅ Sin campos adicionales

---

### 6. orchestrator.json

```json
{
  "id": "orchestrator",
  "name": "Orchestrator",
  "description": "Route tasks across agents...",
  "category": "operations",
  "defaultModel": "openai/gpt-5.4",
  "defaultSkills": ["routing.apply", "status.read"],
  "defaultPolicies": ["safe-operator"],
  "routines": ["task-prep", "followup-sweep"],
  "tags": ["orchestration", "delegation", "routing"]
}
```

✅ Requeridos: ✓ id, ✓ name, ✓ description, ✓ defaultSkills, ✓ routines
✅ Opcionales: ✓ category, ✓ defaultModel, ✓ defaultPolicies, ✓ tags
✅ Sin campos adicionales

---

### 7. relationship-manager.json

```json
{
  "id": "relationship-manager",
  "name": "Relationship Manager",
  "description": "Maintain follow-up discipline...",
  "category": "support",
  "defaultModel": "openai/gpt-5.4-mini",
  "defaultSkills": ["contacts.search", "followups.plan"],
  "defaultPolicies": ["safe-operator"],
  "routines": ["followup-sweep", "relationship-review"],
  "tags": ["relationships", "outreach", "continuity"]
}
```

✅ Requeridos: ✓ id, ✓ name, ✓ description, ✓ defaultSkills, ✓ routines
✅ Opcionales: ✓ category, ✓ defaultModel, ✓ defaultPolicies, ✓ tags
✅ Sin campos adicionales

---

### 8. test-profile.json

```json
{
  "id": "test-profile",
  "name": "Test Profile",
  "description": "Test profile for validation",
  "category": "engineering",
  "defaultModel": "openai/gpt-4",
  "defaultSkills": ["test.read", "test.write"],
  "defaultPolicies": ["test-policy"],
  "routines": ["test-routine-1", "test-routine-2"],
  "tags": ["test", "validation"]
}
```

✅ Requeridos: ✓ id, ✓ name, ✓ description, ✓ defaultSkills, ✓ routines
✅ Opcionales: ✓ category, ✓ defaultModel, ✓ defaultPolicies, ✓ tags
✅ Sin campos adicionales

---

## Verificación de Pairing 1:1 (MD ↔ JSON)

| Profile ID | .md | .json | Status |
|-----------|-----|-------|--------|
| chief-of-staff | ✅ | ✅ | Pairing completo |
| daily-task-manager | ✅ | ✅ | Pairing completo |
| dev-agent | ✅ | ✅ | Pairing completo |
| executive-assistant | ✅ | ✅ | Pairing completo |
| monitoring-agent | ✅ | ✅ | Pairing completo |
| orchestrator | ✅ | ✅ | Pairing completo |
| relationship-manager | ✅ | ✅ | Pairing completo |
| test-profile | ✅ | ✅ | Pairing completo (para testing) |

---

## Cambios Realizados

🔧 **Remover campos no estándar**:
- Removido "visibility" de todos los 8 sidecars
- Removido "priority" de todos los 8 sidecars
- Razón: profile.schema.json especifica `"additionalProperties": false`

✅ **Validación contra esquema**:
- Todos los 8 sidecars JSON ahora cumplen con profile.schema.json
- Requeridos: id, name, description, defaultSkills, routines
- Opcionales soportados: category, defaultModel, defaultPolicies, tags

---

## Definición de Done - CUMPLIDA

| Criterio | Estado |
|----------|--------|
| 7 sidecars para profiles originales | ✅ |
| Todos con campos requeridos | ✅ |
| Todos con campos opcionales razonables | ✅ |
| Sin campos no estándar | ✅ |
| Validación contra profile.schema.json | ✅ |
| Pairing 1:1 con .md files | ✅ |
| Test profile para validación | ✅ |

---

## Impacto

✅ **Sidecars JSON ahora válidos**
- ProfilesService.getAll() puede cargar y validar contra schema
- No hay errores de "additionalProperties" en validación
- Todas las rutas de merge funcionarán correctamente

✅ **GET /profiles completamente funcional**
- Retorna array de 8 ProfileSpec válidos
- Bootstrap puede usar cualquiera de los 7 profiles estándar
- Test profile valida el pipeline completo

✅ **Ready para Compilador**
- Compiler puede confiar en que ProfileSpec está bien formado
- Merge order va a funcionar sin sorpresas

---

## Siguiente: ACCIÓN 3

**Implementar Routine Loaders Completamente**

- Validar que load-routine-markdown.ts está completo
- Validar que load-routines-catalog.ts carga desde chief-of-staff/routines/
- Verificar que GET /routines devuelve todas las routines con promptTemplate

**Time estimate**: 3-4 horas
**Blocker severity**: 🔴 BLOCKER (bootstrap necesita routines para completar merge)

---

**ACCIÓN 2 COMPLETADA**: Todos los 8 sidecars JSON validan contra schema.
