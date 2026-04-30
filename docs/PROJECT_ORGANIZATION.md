# Agent Visual Studio - Organización del Proyecto GitHub

## Estructura de Fases Completa

### FASE F0: Setup & Fundación
Infraestructura base del proyecto

### FASE F1: API Core & Discovery
Core API, modelos y descubrimiento de agentes

### FASE F2: Agent Executor & Skills
Executor de agentes y sistema de skills

### FASE F3: Gateway & Channels
- **F3 Base**: WebChat + Telegram (anterior)
- **F3a: Gateway Multicanal Prioritario** ✅ [Issues #33-62]
  - Fase 1: Infrastructure Core (11-13)
  - Fase 2: Channel Lifecycle (14-15)
  - Fase 3: Runtime & Endpoints (17,16)
  - Fase 4: Telegram (18-20)
  - Fase 5: WhatsApp (21-25)
  - Fase 6: Discord (26-30)
  - Fase 7: Teams (31-35)
  - Fase 8: Frontend & Security (36-38)
  - Fase 9: Integration (39)
  - Fase 10: Documentation (40)
- **F3b**: Security Hardening

### FASE F4: Web UI & Configuration
Interfaz web y configuración del sistema

### FASE F5: Advanced Features
Características avanzadas (Slack, etc.)

### FASE F6: DevOps & Observability
Deployment, monitoring y observabilidad

## Issues Actual Status

### Open Issues (30)
- **#33-62**: F3a-11 a F3a-40 (correctamente organizados con labels order:01-order:30)

### Duplicates (Pending Closure)
- **#3-32**: Copias duplicadas de F3a (deben cerrarse)

## Orden de Ejecución Recomendado

1. **Cerrar duplicados** (#3-32)
2. **Reorganizar proyecto** en view/1 según las 10 fases
3. **Etiquetar** todos los issues existentes (F0-F6) con `order:XX`
4. **Establecer dependencias** en el proyecto

## Notas
- Los issues reales del proyecto están en la segunda tanda (33-62)
- Todos los F3a tienen labels order:01-order:30
- El proyecto necesita ser filtrado/visto por orden para facilitar seguimiento
