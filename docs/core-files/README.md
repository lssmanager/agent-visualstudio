# Core Files

Core Files are markdown-based configuration files that define the identity, behavior, tools, and memory of every entity in the hierarchy. Inspired by OpenClaw.

## Files

### SOUL.md
Defines personality, communication style, values, and behavioral guidelines. Think of it as the "character sheet" for an agent or organization.

### IDENTITY.md
Defines role, scope, authorization level, and organizational position within the hierarchy.

### AGENTS.md
The roster of agents available at this level. Defines capabilities, descriptions, and routing hints.

### TOOLS.md
Defines which tools are available, usage policies, constraints, and examples.

### MEMORY.md
Defines memory strategy: which backend, retention rules, what to remember, what to forget, scope boundaries.

### HEARTBEAT.md
Defines routines: scheduled tasks, health checks, periodic behaviors, maintenance cycles.

### USER.md
User profile information: preferences, history, communication style, trust level.

### BOOTSTRAP.md
Initialization sequence: what happens when the entity starts up, what context to load, what connections to establish.

## Compilation

The runtime compiles Core Files for each agent at boot time:
1. Start from system defaults
2. Apply Agency-level files
3. Apply Department overrides
4. Apply Workspace overrides
5. Apply Agent-specific files
6. Produce `CompiledAgentContext` object
7. Cache with hierarchy version hash

Any change to a Core File at any level invalidates the cache for all descendants.
