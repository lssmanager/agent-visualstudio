Decisiones finales de diseño — Agent Visual Studio
Documento consolidado a partir del plan maestro adjunto, reorganizado como especificación ejecutable por fases para el orquestador, backend, gateway, builder y subagentes de frontend. La base existente que se conserva es la interfaz RuntimeAdapter, el FlowExecutor, la estructura modular backend y la jerarquía Agency → Department → Workspace → Agent → Subagent; los puntos incompletos son StepExecutor, gateway propio, adapter nativo y storage JSON en disco.
​

Objetivo del producto
El producto final deja de depender estructuralmente de OpenClaw como runtime principal y pasa a una arquitectura propia basada en PostgreSQL + Prisma, un gateway nativo por canales, ejecución real de LLMs, orquestación jerárquica multinivel y una integración completa con n8n.
​

La lógica central del sistema es jerárquica: un mensaje puede entrar por Agency, Department, Workspace o un Agent, y cada nivel debe actuar como orquestador de su ámbito, delegando hacia abajo según capacidades y consolidando la respuesta hacia arriba.

Decisiones definitivas
Storage y persistencia
La decisión definitiva de persistencia es PostgreSQL + Prisma como fuente única de verdad del sistema, reemplazando la estrategia de JSON en disco porque esa capa actual no ofrece concurrencia, queries reales ni soporte multi-tenant sólido.

La migración inicial no será parcial sobre unas pocas entidades: se asume adopción de la mejor práctica objetivo en 2026, por lo que el schema Prisma completo debe entrar desde la primera fase de plataforma, incluyendo jerarquía, runs, skills, gateway, n8n, policies y audit.

Jerarquía de orquestación
La jerarquía operativa definitiva es Agency → Department → Workspace → Agent → Subagent, donde cada nivel puede tener un orchestrator que recibe una tarea, identifica subordinados relevantes, reparte subtareas, espera resultados y devuelve una síntesis consolidada.

El comportamiento es recursivo por nivel: Agency delega a Departments; Department delega a Workspaces; Workspace delega a Agents; y los Agents especializados o subagentes ejecutan trabajo directo o flujos asociados según su rol y especialidad.

Agent Builder y propagación de perfiles
El AgentBuilder asume explícitamente la lógica jerárquica del sistema. Su función no es solo crear entidades, sino mantener consistentes los perfiles, prompts y capacidades delegables de cada nivel, tanto de arriba hacia abajo como de abajo hacia arriba.

Cuando se agrega o elimina un agente especializado en un workspace, el sistema debe recalcular automáticamente el perfil del Workspace, del Department y del Agency correspondiente para reflejar nuevas capacidades de delegación; el ejemplo explícito del documento es agregar Spotify Ads al área de Marketing, obligando a actualizar el prompt orquestador del departamento para que sepa delegar también a ese nuevo especialista.

Gateway y abandono de OpenClaw
La decisión final es construir un gateway propio y usar OpenClaw solo como referencia de implementación canal por canal, no como dependencia operativa permanente.
​

La estrategia correcta ya definida en el texto es copiar la lógica útil de OpenClaw para recepción de mensajes, resolución de sesiones, binding de agente, despacho al runtime y respuesta al canal, empezando por WebChat y Telegram, luego WhatsApp, Webhook, Slack y extensiones posteriores como Discord o Teams si se priorizan.
​

Historial de conversación del gateway
El historial de conversación no debe guardarse como JSONB acumulativo en GatewaySession. La práctica correcta es dividir la responsabilidad en dos capas separadas dentro de PostgreSQL.

El problema fundamental de acumular messageHistory como un array JSON creciente en la sesión es que Postgres mueve valores JSONB grandes al sistema TOAST cuando superan ~2KB, degradando lecturas y escrituras. Además, cada nuevo mensaje requiere leer y reescribir el array completo, no es queryable por campos individuales, y no permite auditoría por mensaje sin deserializar toda la sesión.

Capa	Tabla	Propósito	Mutabilidad
Contexto activo del LLM	GatewaySession.activeContextJson	Ventana compacta (últimos N msgs + resumen) enviada al LLM	Reescrita con summarización
Historial permanente	ConversationMessage (tabla propia)	Registro completo, append-only, queryable, auditable	Solo inserts, nunca updates
El schema Prisma definitivo para esta sección es el siguiente:

text
model GatewaySession {
  id              String        @id @default(uuid())
  channelConfigId String
  channelConfig   ChannelConfig @relation(fields:[channelConfigId], references:[id])
  externalUserId  String
  agentId         String

  // Ventana activa para el LLM: últimos N msgs + resumen. Siempre pequeño (<3KB).
  activeContextJson Json?

  state           String        @default("active")
  metadata        Json?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  messages        ConversationMessage[]

  @@unique([channelConfigId, externalUserId])
}

model ConversationMessage {
  id               String         @id @default(uuid())
  sessionId        String
  session          GatewaySession @relation(fields:[sessionId], references:[id], onDelete: Cascade)

  role             String         // 'user' | 'assistant' | 'system' | 'tool'
  contentText      String?        @db.Text   // Texto plano para búsqueda
  contentJson      Json           // Estructura completa: [{type, text}] o tool_calls
  channelMessageId String?        // ID externo del canal (Telegram msg_id, etc.)

  toolCallId       String?        // Si es resultado de un tool call
  toolName         String?

  // Scope jerárquico del agente que respondió o recibió
  scopeType        String?        // 'agency' | 'department' | 'workspace' | 'agent'
  scopeId          String?

  tokenCount       Int?           // Tokens del mensaje (estimado o real)
  createdAt        DateTime       @default(now())

  @@index([sessionId, createdAt])
  @@index([sessionId, role])
  @@index([scopeId, createdAt])
}
El contentJson de cada ConversationMessage individual sí usa JSONB porque cada mensaje es pequeño (~1KB) y el problema de TOAST no aplica a ese nivel.
​ El activeContextJson en la sesión también permanece pequeño porque se compacta activamente con summarización cuando el historial crece.
​

Frontend del Studio
El frontend tendrá un subagente especializado propio y debe converger hacia un canvas tipo n8n + Flowise, con nodos visuales, edges, bindings, runs timeline y operaciones reales, en lugar de quedarse como un set de componentes aislados cuyo estado funcional hoy es incierto.

La UI no es una fase decorativa separada al final: debe avanzar de forma funcional por entregables conectados a cada fase del backend, aunque exista un subagente dedicado de frontend que materialice el canvas, la experiencia de edición y la operación visual.

Decisión de arquitectura para evitar dependencia circular
El borrador adjunto mostraba una dependencia circular entre LLMStepExecutor y HierarchyOrchestrator, porque el primero invocaba delegación y el segundo dependía otra vez del ejecutor para llamar LLM o ejecutar hijos.
​

La decisión final recomendada para dejar esto implementable por fases es introducir un servicio intermedio AgentExecutor como capa central de ejecución. LLMStepExecutor decide cuándo un nodo se ejecuta directo o cuándo se delega; HierarchyOrchestrator planifica delegación; y ambos usan AgentExecutor para ejecutar un agente concreto, evitando acoplamiento circular duro y simplificando testeo e inyección de dependencias.

Contrato final sugerido
LLMStepExecutor: interpreta el nodo del flujo y coordina la ejecución del paso.

HierarchyOrchestrator: descompone tareas, selecciona children y consolida resultados.

AgentExecutor: ejecuta un agente concreto con prompt, tools, policies, historial y contexto.

TaskPlanner opcional: ayuda a descomposición compleja para tareas secuenciales o compuestas, siguiendo la línea inspirada en Semantic Kernel.
​

Arquitectura objetivo
Núcleo backend
El backend conserva el FlowExecutor y la interfaz RuntimeAdapter, pero reemplaza el StepExecutor vacío por un LLMStepExecutor real capaz de resolver políticas de modelo, construir mensajes, llamar proveedores compatibles con OpenAI SDK, ejecutar tool calls y evaluar condiciones de branching con seguridad.
​

Las políticas de modelo y presupuesto deben resolverse por alcance en cascada agent → workspace → department → agency → global, usando ModelPolicy y BudgetPolicy desde Prisma.
​

Gateway nativo
El gateway debe componerse de ChannelRouter, SessionManager, AgentResolver y MessageDispatcher, con IChannelAdapter como interfaz común para cada canal y una Security Layer con Logto JWT, CORS, Helmet, rate limiting y secretos cifrados con AES-256-GCM.
​

El flujo operativo del gateway es: recibir mensaje externo, resolver o crear GatewaySession, buscar ChannelBinding, decidir qué scope o agente atiende el canal, cargar historial, despachar al runtime jerárquico y responder por el adaptador correspondiente.
​

Integración n8n
La capa n8n se compone de N8nConnection, N8nWorkflow, N8nService, un nodo visual N8nWorkflowNode para el canvas y un helper para que el AgentBuilder pueda crear workflows desde lenguaje natural y vincularlos como skills de un agente.
​

Esto convierte a n8n en una capacidad nativa del Studio: los workflows pueden sincronizarse, exponerse como skills y aparecer como nodos del canvas para ser orquestados en los flows del producto.
