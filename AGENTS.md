# AGENTS.md

## Mission
This repository must evolve OpenClaw Studio into a full multi-level control plane,
not a simple agent editor.

Studio must converge toward these product surfaces:
- Agency Builder (macro structure, topology, routing, hooks, versions, operations)
- Workspace Studio (canvas micro de construcción interna)
- Entity Editor (editor universal por nivel jerárquico)
- Profiles (catálogo jerárquico reutilizable)
- Runs (observabilidad jerárquica con replay y trace)
- Sessions (superficie de conversación operativa activa)
- Settings (configuración visible, providers, runtimes, diagnostics)

## Canonical hierarchy
Agency
  Department
    Workspace
      Agent
        Subagent

Cross-cutting capabilities:
- Skills
- Tools
- Flows
- Handoffs
- Channels
- Core files

## Execution rule
Only these levels can receive direct inbound messages and trigger execution:
- Agency
- Department
- Workspace

Agents and Subagents execute delegated work only.

## Navigation mental model
The sidebar must answer these questions, not list page types:
- Which agency am I in?
- Which level am I working at?
- Do I want to see structure, edit an entity, observe executions, or configure runtimes?

Navigation is organized by operational level, not by technical page type.

## Left sidebar structure

### Block A — Agency switcher
- Selector at the top
- Collapsible list of available agencies
- Selecting an agency loads its tree into the left panel

### Block B — Hierarchical tree (collapsible index)
- Agency
  - Departments
    - Workspaces
      - Agents
        - Subagents

This tree is the primary index of the product.
It drives the context for almost every screen.

### Block C — Main surfaces

**Build**
- Agency Builder
- Workspace Studio
- Entity Editor (replaces "Agents" as isolated page)
- Profiles

**Operate**
- Runs
- Sessions

**Configure**
- Settings

## Surface definitions

### Agency Builder
Macro surface. Shows:
- Agency organigram and department/workspace connections
- Routing and handoffs
- Hooks
- Versions
- High-level operations

Internal tabs:
- Topology
- Structure
- Routing & Channels
- Hooks
- Versions
- Operations

Three-panel layout:
- Left (collapsible): available agencies + active agency tree
- Center: graph / organigram / topology map
- Right: details of selected node (metadata, routing, channels, hooks,
  handoffs, connections, version summary)

Routing & Channels and Hooks are contextual tabs here, not top-level menu items.

### Workspace Studio
Micro surface. Drag-and-drop canvas for internal workspace construction:
- Component library
- Canvas
- Properties panel
- Test panel
- Diff panel
- Runtime session summary

Left panel shows the hierarchical position of the workspace within its agency.

### Entity Editor
Universal editor for any selected level in the tree.
Replaces the current "Agents" page as an isolated view.

Editable levels:
- Agency
- Department
- Workspace
- Agent
- Subagent

Entity editor sections:
- identity
- prompts
- tools
- skills
- model
- type
- shareability
- advanced
- handoff rules
- tags
- connections
- runs
- routing & channels
- hooks
- versions
- operations

### Profiles
Hierarchical catalog of reusable profiles, organized by level:
- Agency profiles
- Department profiles
- Workspace profiles
- Agent profiles
- Subagent profiles

Not a flat list. Level-grouped catalog.

### Runs
Hierarchical observability surface.
Sidebar: agencies and level tree.
Central view: filters by level, runs of agency / department / workspace / agent,
replay, trace, conditions, handoffs, cost/latency/status.

### Sessions
Operative conversation surface. Not just historical log.
- View active sessions
- Open a session
- Send message to selected level
- See delegation chain
- See channel
- See runtime state

### Settings
All runtime and provider configuration:
- General
- Providers (OpenAI, Anthropic, Google, local models)
- Runtimes (OpenClaw runtime config)
- Channels
- Integrations (n8n, etc.)
- Diagnostics
- Security / Policies

Diagnostics is absorbed into Settings. It is not a top-level menu item.

## What collapses into contextual tabs
These are NOT top-level menu items. They are tabs within the level selected in the tree:
- Routing & Channels (per Agency / Department / Workspace / Agent as applicable)
- Hooks (per Agency / Department / Workspace / Agent as applicable)
- Versions → contains: current version, previous snapshot, compare,
  visual diff, apply, rollback, publish/deploy status
- Automations / Routines → contextual tab within Agency or Workspace,
  not a top-level menu item

## Global selection state
Navigation and context must be driven by a hierarchical selection state, not a
single selected entity:
- selectedAgency
- selectedDepartment
- selectedWorkspace
- selectedAgent
- selectedSubagent
- selectedView
- selectedTab

The entire app state depends on this selection hierarchy, not on a workspace-centric
single-entity model.

## Canonical Studio behavior
- Agency is the top-level sandbox.
- Departments and Workspaces can connect freely only inside the same Agency.
- Topology actions are real runtime actions:
  - connect
  - disconnect
  - pause
  - reactivate
  - redirect
  - continue
- Studio must support bidirectional propagation:
  - top-down
  - bottom-up

## Core files affected by Studio
Studio changes may affect or propose diffs for:
- BOOTSTRAP
- IDENTITY
- TOOLS
- USER
- HEARTBEAT
- MEMORY
- SOUL
- AGENT.md / AGENTS.md

## Required change lifecycle
Do not write major behavioral changes blindly.

The required lifecycle is:
1. preview
2. diff proposal
3. apply
4. rollback

## Non-goals
- Do not reduce Studio to a simple agent editor.
- Do not hardcode Studio around a single selected agent.
- Do not treat Skills and Tools as simple checkboxes.
- Do not break preview → diff → apply → rollback.
- Do not ship UI-only topology controls that do not affect runtime.
- Do not duplicate catalog data if reference propagation is the intended model.
- Do not keep Routing & Channels, Hooks, or Diagnostics as top-level menu items.
- Do not keep "Commands" as a top-level menu item; use Automations/Routines contextually.
- Do not treat Sessions as a simple historical log; it is an operative runtime surface.
- Do not use workspace-centric state as the app's single source of truth.

## Product invariants
- Skills and Tools are profile-shaping inputs, not only permissions.
- Assigning Skills/Tools can modify the operational profile of Agency, Department,
  Workspace, Agent, or Subagent.
- Entity Editor must explain visually what an entity does, how it works,
  what it receives, what it outputs, and what files it proposes to change.
- Agency Builder and Workspace Studio are separate views.
- Observability and replay are first-class features, not optional extras.
- Core file diff/apply/rollback lives inside Versions, not as a standalone card.
- The sidebar tree is the primary navigation driver for all surfaces.

## Repo zones
- apps/api/src/modules/**
    => backend contracts, orchestration, runtime, replay, observability,
       diff/apply/rollback, hierarchical selection state
- apps/web/src/features/**
    => Agency Builder, Workspace Studio, Entity Editor, Profiles,
       Runs, Sessions, Settings
- packages/**
    => reusable engines, graph state, propagation, shared schemas,
       hierarchical selection state
- templates/**
    => agency profiles, reusable presets, setup seeds
- skills/**
    => Codex skills and workflow helpers
- docs/**
    => specs, canonical model, architecture, contracts

## Entity targets
Backend changes should eventually support:
- AgencySpec
- DepartmentSpec
- WorkspaceSpec
- AgentSpec
- SubagentSpec or AgentSpec(kind=subagent)
- SkillSpec
- ToolSpec
- ConnectionSpec
- HandoffPolicy
- ChannelBinding
- RunSpec
- RunStep
- TraceEvent
- CoreFileDiff
- RollbackSnapshot
- SelectionContext (selectedAgency, selectedDepartment, selectedWorkspace,
  selectedAgent, selectedSubagent, selectedView, selectedTab)

## Required commands
Run these whenever relevant:
- npm install
- npm run build
- npm test

If a deeper AGENTS.md adds checks, run those too.

## Delivery rules
- Prefer small, reviewable patches.
- Keep API and UI contracts aligned.
- Update docs whenever the entity model changes.
- Keep naming consistent with the canonical hierarchy.
- Add or update tests for behavior changes.
- Preserve backward compatibility where practical unless the task
  explicitly allows breaking changes.

## Definition of Done
A change is done only if:
1. it matches the canonical Studio model,
2. build and tests pass,
3. UI and API contracts remain aligned,
4. docs are updated if entities or flows changed,
5. the patch is scoped and reviewable.