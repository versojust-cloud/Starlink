# Stitch (Google Labs) — Canvas Refresh Prompts

Paste these prompts into [stitch.withgoogle.com](https://stitch.withgoogle.com) one at a time.
Each one is self-contained — Stitch generates a Tailwind + React component you can
diff against the file in `apps/web/src/features/comfy/components/`.

After Stitch generates a design, do **not** copy the raw output — instead extract
classNames + structure, and reconcile with `canvas-design-tokens.ts` so the rest
of the canvas stays consistent.

---

## Shared Style Brief (paste at the top of every Stitch session)

```
DESIGN BRIEF — Multi-agent business analysis canvas

Aesthetic reference: Linear, Vercel dashboard, Cursor IDE, ComfyUI.
NOT: Notion, Figma, gradient-heavy AI products.

Color system (use ONLY these):
- Background base: slate-950 (#020617) → slate-900 (#0F172A) gradient
- Surface tint: white at 3-8% opacity over the base
- Borders: white at 6-14% opacity
- Text: white (primary), slate-400 (secondary), slate-500 (tertiary)
- Single accent: cyan-300 (#67E8F9) for active / focus / primary CTAs
- Status hues (use sparingly): emerald-300 success, amber-300 warning, rose-300 danger
- DO NOT use multiple competing gradients (no amber+cyan+emerald together)

Typography:
- Sans-serif system stack
- 13 px body, 11 px metadata, 10 px uppercase tracking-wide kicker labels
- Numerals tabular for counts / measurements

Spacing & geometry:
- Density similar to Linear: padding 12-16 px on cards, 24 px on shells
- Radius: 8 px for inputs / buttons, 12 px for cards, 16 px for shells
- Border 1 px, NEVER 2 px or thicker
- No glow shadows. Active state = 1 px ring at 30-40% opacity.

Iconography:
- Lucide React icons only, strokeWidth 1.75
- Icon size: 14 px in body, 16 px in shells, 12 px in micro-states
```

---

## Prompt 1 — Right Rail Configuration Drawer (NEW component, doesn't exist yet)

```
Build a 360-px-wide right rail panel that opens when a user selects a node in
a React Flow canvas. The panel shows the selected node's configuration:

Sections (top to bottom):
1. Header: node icon + label + node-type kicker + close button (X icon)
2. "Identity" section: name (text input), role (read-only chip)
3. "Prompt" section: system_prompt (textarea, 8 lines, monospace 12 px)
4. "Tools" section: list of bound tools, each as a removable chip
5. "Inputs" / "Outputs" sections: list of port types from the node descriptor
6. Footer: "Save" primary button + "Reset" ghost button

Use the design brief above. The drawer slides in from the right with a 220 ms
ease-out transition. When no node is selected, render nothing (don't render an
empty state — caller hides the drawer).
```

---

## Prompt 2 — Bottom Command Tray (replaces current bottom chat-input)

```
Build a floating command tray fixed to the bottom of the canvas, centered,
max-width 720 px. Two states:

State A (idle):
- Single horizontal pill, 48 px tall
- Left: chat-bubble icon (cyan-300)
- Center: textarea-as-input "Ask anything, or describe a business idea…"
- Right: "Run" primary button (cyan-300 bg, slate-950 text), shows ⌘+Enter shortcut

State B (executing):
- Same pill morphs into a 2-row stack
- Top row: same input but disabled, with a per-stage progress indicator on the
  left (5 dots: idle → input → thinking → review → output, current dot is cyan)
- Bottom row: a list of currently active agents as pills (e.g. "market-agent",
  "critic"), each with a tiny spinner. Click to expand.

Use the design brief. The tray has 12 px elevation (subtle 1px ring + soft
shadow), backdrop-blur-xl. Width animates from collapsed input → expanded.
Match Cursor's command palette aesthetic — minimal, dense, keyboard-first.
```

---

## Prompt 3 — Node Palette Sidebar (refresh existing)

```
Build a 280-px-wide left rail "node library" sidebar for a multi-agent canvas.
A tree of categories, each expandable, showing draggable node entries.

Top section: "Search" input with kbd hint "/"
Middle section: 5 categories, each with 2-4 nodes:
  📊 BMC Cards (cc-bmc-card, customer-segments, value-propositions, …)
  🤖 AI Agents (market-agent, product-agent, finance-agent, critic)
  🗂️ Data Sources (data-source, knowledge-search, db-query)
  💡 Insights (insight-note, conflict-alert)
  📝 Misc (canvas-note, agent-avatar, plan-node)

Each node entry is a 36-px-tall row:
- Left: 24×24 hue-tinted square with emoji or lucide icon
- Center: bold label + 11 px slate-400 description (truncated)
- Right: drag handle dots (visible on hover)
- Hover: 1 px white/14 border, no glow

Use the design brief. Each category gets a single subtle hue (cyan / amber /
sky / violet / slate) — the chip on the left, NOT the whole row. The row stays
neutral. Pin frequently-used nodes to the top.
```

---

## Prompt 4 — Top Header Bar (refresh existing)

```
Build a 56-px-tall top header bar for a multi-agent business canvas.

Left cluster:
- 32-px monochrome logo chip (sparkles icon, no gradient)
- Brand: "智绘 · 无限画布" (15 px semibold) over "MACRA Business Intelligence"
  (10 px uppercase tracked)

Right cluster (right to left):
- "快速入门" primary button (cyan-300, with ⚡ icon)
- "导出" ghost button (with download icon)
- View segmented control: 自由画布 ↔ BMC 九宫格
- Workflow stage rail: 5 pills (input → thinking → review → output → idle),
  active one filled with white/8% bg, others slate-500

Use the design brief. Bar uses backdrop-blur-xl over slate-950 at 60% opacity,
border-bottom 1 px white/6. Below md breakpoint, collapse the workflow stage
rail into a single "STAGE: <name>" badge.
```

---

## Prompt 5 — Empty Canvas State (NEW component)

```
Build an empty-state placeholder for when the canvas has no nodes yet.

Center-aligned, max-width 480 px:
- 64-px circle outline (white/8 border, no fill) containing a sparkles icon
- Headline: "开始你的商业模型" (20 px semibold white)
- Subheadline: "用一句话描述你的想法，多个 AI 顾问会同步生成 BMC" (14 px slate-400)
- Two action buttons side-by-side:
  • Primary "从模板开始" with grid icon
  • Ghost "查看示例" with book icon
- Below the buttons: a horizontal scroll row of 3 example seed cards
  (each 220×80 px), preview text + "Try this →"

Use the design brief. The whole state has subtle scale-95 → scale-100 entry
animation. Background is the canvas's existing radial gradient — no new
background needed.
```

---

## How to apply Stitch output to the codebase

For each generated component:

1. **Diff classNames** against `canvas-design-tokens.ts`. If Stitch invented a
   new color or radius, prefer the token. If a token is missing, add it to the
   tokens file in the same commit.

2. **Keep file paths + props** identical. Don't rename the component or change
   its public API — just swap the JSX body. This keeps `comfy-canvas-page.tsx`
   wiring untouched.

3. **One commit per refreshed component**. Easy to revert one if the design
   doesn't land.

4. **Run `pnpm --filter @starlink/web lint`** between commits — catches any
   class-name typos Stitch might emit (e.g. invalid Tailwind variants).

---

## Already-refreshed components (use as style anchor for Stitch)

- `canvas-header.tsx` — refresh-2026-04, the canonical example. Match its
  density and color discipline.
- `panels/node-palette-panel.tsx` — palette pattern.
- `panels/seed-input-panel.tsx` — input + status icon pattern.
- `canvas-design-tokens.ts` — central token source.

If Stitch deviates from these, prefer the existing files; reconcile by adjusting
tokens, not the new component.
