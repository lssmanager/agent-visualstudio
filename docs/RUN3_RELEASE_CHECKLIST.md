# Run 3 Release Checklist

Objetivo: cerrar la fase de orquestación final después de `run1` y `run2`, con validación manual y verificación de deploy por SHA.

## 1. Baseline de commits

- [ ] Confirmar que la rama a desplegar incluye:
  - `e3455ee` (`feat(run1): tighten studio parity and admin-runs coherence`)
  - `c9d4de7` (`feat(run2): harden runtime command validation and clarify templates-runs contracts`)
- [ ] Confirmar que no hay cambios locales pendientes antes de promover release:
  - `git status --short`

## 2. Validación manual frontend

Referencia: `docs/PHASE3_VALIDATION_CHECKLIST.md`.

- [ ] Ejecutar smoke manual completo de:
  - continuidad Administration ↔ Studio
  - Studio node selection → inspector
  - Runs/Sessions como superficies visibles
  - labels/rutas canónicas
- [ ] Registrar hallazgos críticos antes de deploy (si hay).

## 3. Validación manual backend/runtime

- [ ] Verificar `POST /dashboard/runtime/command` con casos:
  - action soportada + payload válido
  - action no soportada (debe devolver `400`)
  - `connect`/`redirect` sin target (debe devolver `400`)
  - target con level inválido (debe devolver `400`)
- [ ] Verificar `GET /profiles/templates`:
  - `status=planned`
  - `mode=read_only`
  - `decision=excluded_from_v1`
- [ ] Verificar `GET /dashboard/runs`:
  - envelope con `projection=dashboard_scoped_v1`

## 4. Deploy validation (obligatorio)

- [ ] En la plataforma de deploy (Coolify), confirmar SHA exacto construido/desplegado.
- [ ] Verificar que el SHA desplegado coincide con el commit objetivo (no un SHA anterior).
- [ ] Después del deploy, validar una ruta de salud y una ruta funcional:
  - `/api/studio/v1/dashboard/overview?...`
  - `/api/studio/v1/dashboard/runs?...`

## 5. Cierre de release

- [ ] Registrar resultado final: `PASS` o `PASS_WITH_GAPS`.
- [ ] Si hay gaps, documentar:
  - síntoma
  - impacto
  - workaround
  - siguiente acción

