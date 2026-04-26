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

Mapa de referencias — Qué se toma de cada framework
Este proyecto no es una reimplementación de ningún framework existente. La estrategia es tomar conceptos específicos y bien delimitados de cada referencia, adaptarlos a TypeScript y a la arquitectura propia, sin importar dependencias de ninguno de ellos directamente como runtime.

CrewAI — Process.hierarchical + allow_delegation
Qué se copia: La semántica de delegación jerárquica Manager → Specialist y el concepto de allow_delegation como bandera por agente.

CrewAI genera automáticamente dos herramientas para agentes con allow_delegation=True: delegate_work (asigna una subtarea a otro agente por rol) y ask_question (consulta a otro agente y espera respuesta). El proceso Process.hierarchical hace que un manager LLM coordine a los especialistas en vez de que ellos se turnen secuencialmente.

Cómo se adapta aquí:

HierarchyOrchestrator.decomposeTask() replica la lógica de CrewAI manager: recibe task, lista children disponibles, pide al LLM que asigne subtareas.

HierarchyOrchestrator.consolidateResults() replica el paso de síntesis final del manager.

El campo Agent.role ('orchestrator' | 'specialist' | 'subagent') mapea directamente a la semántica de allow_delegation de CrewAI.

No se importa la librería CrewAI: todo en TypeScript con Prisma + AgentExecutor propio.

LangGraph — Checkpointer + Thread state + Persistence
Qué se copia: El patrón de persistencia de estado de ejecución por paso, el concepto de thread como unidad de conversación durable, y la separación entre memoria activa del LLM y registro permanente.

LangGraph guarda un checkpoint del estado del grafo en cada paso de ejecución, organizado por threads. Esto permite conversational memory persistente, time-travel debugging, reanudación tras fallo y human-in-the-loop.

Cómo se adapta aquí:

Run + RunStep en Prisma son el equivalente directo de los checkpoints de LangGraph por paso de ejecución.

GatewaySession + ConversationMessage son el equivalente del thread de LangGraph: la sesión es el thread, los mensajes son el historial durable.

activeContextJson de GatewaySession replica el patrón del checkpointer activo de LangGraph: estado compacto en memoria, historial completo en disco.

FlowExecutor con replay ya implementado adopta la semántica de time-travel de LangGraph.

No se importa LangGraph: es Python; lo que se toma es el patrón de persistencia, no el código.

AutoGen — GroupChat + OrchestratorAgent + Mixture of Agents
Qué se copia: El patrón GroupChatManager donde un orquestador central recibe el task, lo despacha a workers en paralelo, espera resultados y los consolida.

El OrchestratorAgent de AutoGen itera sobre capas de workers: en cada capa hace asyncio.gather(*[self.send_message(task, worker_id) for worker_id in worker_ids]) y pasa los resultados como contexto a la siguiente capa o a la consolidación final.

Cómo se adapta aquí:

HierarchyOrchestrator.delegate() replica exactamente este patrón: Promise.allSettled() sobre children relevantes, luego consolidación.

La lógica de capas de AutoGen (layer 0 → layer 1 → final aggregator) inspira la delegación recursiva Agency → Department → Workspace → Agent.

El prompt de consolidación del orquestador (synthesize these responses into a single, high-quality response) es la base del consolidateResults().

No se importa AutoGen: es Python con .NET port; la adaptación es TypeScript puro.

Flowise — Canvas AgentFlow V2 + Node execution model
Qué se copia: La arquitectura de canvas donde cada nodo es una unidad independiente de ejecución, los edges definen el control de flujo, y el Flow State es un mecanismo explícito para compartir datos entre nodos.

En Flowise AgentFlow V2, cada nodo ejecuta una operación discreta, los datos se pasan referenciando outputs de nodos previos, y el Iteration Node puede envolver una secuencia de nodos para procesar arrays elemento a elemento.

Cómo se adapta aquí:

Flow.spec con nodes[] y edges[] replica la serialización del canvas de Flowise.

Los tipos de nodo del canvas propio (agent, tool, condition, approval, n8n_workflow, channel_trigger, subflow, handoff) son la versión propia de la librería de nodos de Flowise.

El FlowExecutor existente que ya interpreta el grafo adopta la semántica de ejecución nodo-por-nodo de Flowise.

El Iteration Node de Flowise inspira un futuro nodo foreach para procesar arrays de subtareas en paralelo.

No se importa Flowise: se reutiliza React Flow/XYFlow como base del canvas, igual que usa Flowise, pero con tipos de nodo propios.

Semantic Kernel — SequentialPlanner + Plugins + Kernel
Qué se copia: El concepto de Planner para descomposición automática de tareas complejas en pasos secuenciales o paralelos, y la abstracción de Plugin como unidad de skill registrable.

El SequentialPlanner de Semantic Kernel recibe un goal de lenguaje natural, consulta al LLM los plugins/funciones disponibles, genera un plan de pasos y lo ejecuta. Cada plugin expone funciones con descripción semántica para que el planner las seleccione.

Cómo se adapta aquí:

TaskPlanner (propuesto en Fase 2) adopta esta semántica: dado un task complejo, consulta al LLM con la lista de agents/skills disponibles y genera el plan de delegación antes de que HierarchyOrchestrator lo ejecute.

Skill en el schema Prisma es el equivalente al Plugin de Semantic Kernel: tiene nombre, descripción semántica, tipo y schema de input.

La resolución de ModelPolicy por cascada de scopes replica el patrón de Kernel configuration de Semantic Kernel, donde el kernel tiene una configuración base y cada función puede sobreescribirla.

No se importa Semantic Kernel: es .NET/Python; el patrón conceptual se implementa en TypeScript con el AgentExecutor propio.

Microsoft Agent Framework — Standards MCP + A2A + OpenAPI-first
Qué se copia: Los estándares abiertos de interoperabilidad: MCP (Model Context Protocol) para tools, A2A (Agent-to-Agent) para comunicación entre agentes, y OpenAPI-first para integrar APIs externas como skills sin wrappers manuales.

El Microsoft Agent Framework unifica AutoGen (orquestación dinámica) con Semantic Kernel (workflows deterministas) en un solo runtime, y adopta MCP + A2A + OpenAPI como estándares de interoperabilidad, permitiendo que los agentes sean portables y vendor-neutral.

Cómo se adapta aquí:

Los tipos de skill 'mcp' | 'n8n_webhook' | 'openapi' | 'builtin' | 'function' del schema Prisma adoptan directamente esta taxonomía de interoperabilidad.

El tipo 'mcp' soporta tools MCP como primer ciudadano, siguiendo el estándar abierto que MAF promueve.

El tipo 'openapi' permite que cualquier API con especificación OpenAPI se importe como skill sin wrapper manual, replicando el patrón OpenAPI-first de MAF.

La separación entre Agent Orchestration (LLM-driven) y Workflow Orchestration (determinista) de MAF mapea a la distinción entre nodos agent (orquestado por LLM) y nodos tool/condition (deterministas) en el canvas.

No se importa MAF: es .NET; los estándares MCP y OpenAPI son agnósticos de lenguaje.

n8n — Execution engine + Queue mode + Node type taxonomy
Qué se copia: La taxonomía de tipos de nodo (Trigger, Action, Logic, Code), el modelo de ejecución por cola con BullMQ, y la capacidad de que cada workflow sea inmediatamente disponible como endpoint REST.

n8n distingue tres familias de nodos: Trigger (inician ejecución), Action (hacen trabajo), Logic (controlan flujo: IF, Switch, Merge, Loop). El queue mode permite ejecuciones asíncronas y confiables a escala con Redis + BullMQ.

Cómo se adapta aquí:

La taxonomía de nodos del canvas propio replica la de n8n: channel_trigger = Trigger, agent/tool = Action, condition/approval = Logic.

El modo de cola con BullMQ + Redis (previsto en Fase 6) adopta directamente el queue mode de n8n para ejecuciones a escala.

Los workflows n8n se integran como nodos de tipo n8n_workflow en el canvas: el Studio puede encadenar nodos propios con workflows n8n como si fueran acciones internas.

La capacidad de serializar Flow.spec y exponerlo como endpoint REST replica el patrón de n8n de flows-as-API.

n8n sí se usa como sistema externo (vía API y webhooks), no como librería importada; el Studio lo orquesta, no lo embebe.

Hermes Chief of Staff — Session loop + Transport layer + Skills from experience
Qué se copia: El patrón de agent loop con session y memory persistente, la capa de transporte agnóstica de canal, y el concepto de skills creadas a partir de experiencia (aprendizaje en uso).

Hermes Agent tiene como característica única un learning loop que crea skills a partir de la experiencia de ejecución y las mejora durante el uso. Su arquitectura separa claramente Transport Layer, Agent Loop, Session & Memory como capas independientes.

Cómo se adapta aquí:

La separación IChannelAdapter (Transport) + SessionManager + AgentExecutor (Agent Loop) del gateway replica exactamente esta arquitectura de capas de Hermes.

GatewaySession + ConversationMessage es el equivalente de Session & Memory de Hermes, con la diferencia de que aquí es Prisma/PostgreSQL en vez de un store en memoria.

El concepto de skills creadas desde experiencia inspira una extensión futura del ProfilePropagatorService: registrar qué tipos de tareas ejecuta cada agente con éxito y enriquecer automáticamente su profileJson con esa información.

No se importa Hermes: la implementación de referencia es para agentes individuales, no para la jerarquía multinivel que aquí se construye.

Tabla resumen de referencias por componente
Componente del Studio	Framework de referencia	Concepto específico adoptado
Componente del Studio	Framework de referencia	Concepto específico adoptado
HierarchyOrchestrator.decomposeTask()	CrewAI	Process.hierarchical, allow_delegation, manager LLM 
HierarchyOrchestrator.consolidateResults()	AutoGen	OrchestratorAgent Mixture of Agents, asyncio.gather + síntesis 
Run + RunStep	LangGraph	Checkpointer por paso, thread state 
GatewaySession + ConversationMessage	LangGraph	Thread durable + memoria activa vs. disco 
TaskPlanner	Semantic Kernel	SequentialPlanner, descomposición semántica de tasks 
Skill tipos mcp, openapi, n8n_webhook	Microsoft Agent Framework	MCP + A2A + OpenAPI-first interoperability 
Canvas Flow.spec + tipos de nodo	Flowise	AgentFlow V2, nodo como unidad independiente 
Taxonomía de nodos canvas	n8n	Trigger / Action / Logic node taxonomy 
Cola BullMQ (Fase 6)	n8n	Queue mode para ejecuciones asíncronas a escala 
IChannelAdapter + SessionManager capas	Hermes	Transport layer independiente + session loop 
ProfilePropagatorService extensión futura	Hermes	Skills creadas desde experiencia de ejecución 
Agent.role orchestrator/specialist/subagent	CrewAI + AutoGen	Roles con semántica de delegación explícita 

La capa n8n se compone de N8nConnection, N8nWorkflow, N8nService, un nodo visual N8nWorkflowNode para el canvas y un helper para que el AgentBuilder pueda crear workflows desde lenguaje natural y vincularlos como skills de un agente.
​

Esto convierte a n8n en una capacidad nativa del Studio: los workflows pueden sincronizarse, exponerse como skills y aparecer como nodos del canvas para ser orquestados en los flows del producto.
