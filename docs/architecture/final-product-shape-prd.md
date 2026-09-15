# Starlink Final Product Shape PRD

## 1. Product Positioning

Starlink is a generative business decision-support system built around four core capabilities:

1. Multi-agent collaborative reasoning
2. Knowledge-enhanced business analysis
3. Structured business-model generation
4. Visual canvas interaction

The product is not a generic chat app, not a pure knowledge-base app, and not a standalone workflow editor. Its final software shape should be:

`a workspace-based business intelligence system that turns a business problem into a structured, explainable, revisable decision canvas`

## 2. Thesis-Driven Product Goal

Based on the thesis proposal, the product must solve five linked problems:

1. Improve analysis depth and coverage for complex business questions
2. Convert natural-language reasoning into stable structured outputs
3. Inject workspace knowledge into the reasoning process
4. Make business logic and conflicts visible and explainable
5. Form a complete loop across frontend interaction, backend orchestration, multi-agent reasoning, and knowledge services

This means the final product goal is:

`Input a business problem -> coordinate multiple agents -> generate structured commercial reasoning -> render it in a visual canvas -> let the user inspect, revise, and continue`

## 3. Final Software Form

The final software should be organized as one workspace with one core analysis loop.

### 3.1 Core Product Form

- `Workspace` is the top-level unit of work
- `Knowledge` is the context supply system
- `MACRA` is the structured multi-agent analysis engine
- `Canvas / Comfy` is the main interactive carrier
- `Experts / Seminar` is the critique and convergence layer
- `Flow Editor` is the advanced orchestration layer

### 3.2 Canonical User Flow

1. User enters a business problem in a workspace
2. User selects or imports knowledge context
3. System runs multi-agent business analysis
4. System outputs structured CC-BMC nodes and conflict signals
5. User reviews the result in:
   - `BMC grid view` for structured reading
   - `free canvas view` for relationship exploration and iterative refinement
6. User inspects evidence, conflicts, and agent contributions
7. User revises, accepts, or re-runs the analysis
8. User exports the business analysis result or continues into workflow customization

## 4. Product Information Architecture

### 4.1 Primary Modules

- `Workspace Home`
  - project overview
  - progress recovery
  - recommended next step

- `Knowledge`
  - file / URL / text import
  - knowledge-base management
  - evidence retrieval

- `MACRA Analysis`
  - business question input
  - multi-agent execution
  - structured CC-BMC generation
  - conflict review and HITL

- `Intelligence Canvas`
  - free canvas view
  - BMC grid view
  - node detail drawer
  - evidence and runtime trace visibility

- `Experts`
  - agent contributions
  - critique and divergence
  - decision convergence

- `Flow Editor`
  - advanced visual workflow editing
  - tool / agent orchestration
  - reusable analysis flow templates

### 4.2 Navigation Priority

The product should prioritize modules in this order:

1. `MACRA`
2. `Canvas`
3. `Knowledge`
4. `Experts`
5. `Flow Editor`

This ordering matches the thesis logic:

`business problem -> agent reasoning -> structured output -> visual interpretation -> advanced orchestration`

## 5. Final Interaction Model

### 5.1 Main Carrier

The final main carrier should be `canvas-based`, not `page-switch-based`.

The system should keep the user inside one analysis space as much as possible. Page transitions should exist, but the dominant experience should be:

- use the same workspace
- switch between structured and exploratory views
- inspect and revise the same analysis state

### 5.2 Dual-View Rule

The final commercial analysis interface must support both:

- `Free Canvas View`
  - for graph exploration
  - for relationship editing
  - for iterative reasoning and open-ended thinking

- `BMC Grid View`
  - for structured reading
  - for thesis demo and formal presentation
  - for checking coverage across business-model dimensions

This dual-view model is the correct final shape for the thesis, because the proposal explicitly requires both:

- visual interactive canvas
- stable structured commercial output

## 6. Key Product Objects

The product should revolve around these core objects:

- `Workspace`
- `Conversation`
- `Knowledge asset`
- `Macra node`
- `Conflict`
- `Business canvas graph`
- `Flow definition`
- `Execution run`

These objects should remain stable across modules. The UI should be different by context, but the underlying business entities should stay unified.

## 7. Core Requirements

### 7.1 Functional Requirements

- The user can start analysis from a business question
- The system can coordinate multiple agents for business reasoning
- The system can turn output into structured CC-BMC nodes
- The system can render the result both as freeform graph and fixed BMC grid
- The system can show conflict signals and request HITL decisions
- The system can use workspace knowledge as reasoning context
- The user can inspect node details, evidence, and agent sources
- The system can support advanced flow editing for extensibility

### 7.2 Non-Functional Requirements

- structured outputs must be stable enough for rendering
- runtime updates must be incremental and observable
- the architecture must be extensible for additional tools and agents
- the interaction must support explanation, revision, and replay

## 8. MVP Boundary

For the thesis-oriented MVP, the product only needs to guarantee this closed loop:

1. create / enter workspace
2. import or select context
3. submit business question
4. run MACRA multi-agent analysis
5. receive structured CC-BMC output
6. inspect the result in free canvas and BMC grid
7. review conflicts and take HITL action

Anything outside this loop is secondary for the thesis:

- large-scale community features
- generic social features
- full production workflow marketplace

## 9. What The Product Is Not

To avoid product drift, Starlink should not be treated as:

- a generic AI chat product
- a pure note-taking or knowledge-base tool
- a standalone no-code workflow platform
- a dashboard collection without a clear analysis core

Its identity should stay narrow and strong:

`a visual multi-agent business analysis and decision-support workspace`

## 10. Implementation Implications

Based on this PRD, the current codebase should keep moving toward:

1. `MACRA` as the primary thesis-facing analysis entry
2. `Comfy / Canvas` as one carrier with dual views, not competing products
3. `Knowledge` as context input and evidence support
4. `Experts` as critique and convergence, not a disconnected side module
5. `Flow Editor` as advanced extensibility, not the main user starting point

## 11. Acceptance Criteria

The final product shape is considered aligned with the thesis when:

- the system can generate a business analysis from a business question
- the result is visible as structured CC-BMC output
- the same result is explorable in a visual canvas
- agent contributions and conflicts are inspectable
- knowledge context can influence the result
- the user can revise or approve the analysis
- the system demonstrates a complete end-to-end decision-support loop
