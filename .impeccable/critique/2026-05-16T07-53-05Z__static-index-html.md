---
target: static/index.html
total_score: 26
p0_count: 1
p1_count: 1
timestamp: 2026-05-16T07-53-05Z
slug: static-index-html
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Good: ⏳ buttons, streaming cursor, overdue badge, AI dot. Missing: no global loading state on app init |
| 2 | Match System / Real World | 3 | ISO date strings ("Due 2026-05-15") in card meta — should be relative ("Due in 3 days") |
| 3 | User Control and Freedom | 3 | Undo-on-delete toast is excellent. No undo for status changes or subtask completion |
| 4 | Consistency and Standards | 2 | Delete task uses undo toast; delete tag/project/status uses window.confirm() — two different patterns |
| 5 | Error Prevention | 2 | Delete button sits immediately adjacent to Edit with no spacing buffer; 5s undo window is tight |
| 6 | Recognition Rather Than Recall | 3 | Filter bar and view tabs clearly labeled; tag dimming good affordance; timeline model requires learning |
| 7 | Flexibility and Efficiency | 3 | Enter/Ctrl+Enter shortcuts present; no keyboard shortcut for new task or quick-add |
| 8 | Aesthetic and Minimalist Design | 3 | Mostly clean; 4 identical-layout stat cards; emoji sidebar icons feel consumer-casual |
| 9 | Error Recovery | 2 | "AI unavailable, please try again" covers all AI failure modes — no failure-type distinction |
| 10 | Help and Documentation | 2 | Chat placeholder is the only onboarding; no empty-state guidance on dashboard |

**Total: 26/40 — Acceptable**

## Anti-Patterns Verdict

LLM assessment: PASS. Warm charcoal OKLCH + amber accent is coherent and non-generic. No hero-metric, no side-stripe, no gradient text, no glassmorphism, no navy/glowing-blue. Login radial gradient is the single ornamental gesture — contained and defensible.

Automated scan: exit 0, zero findings on both static/index.html and static/app.js.

## Priority Issues

**[P0] Delete button proximity and undo window**: Red Delete adjacent to Edit, no spacing. 5s undo toast appears at bottom-of-viewport far from user's reading area. Fix: push Delete to far right with margin-left:auto, extend undo to 8s, move toast to top-center.

**[P1] Inconsistent destructive action patterns**: Task delete = undo toast. Tag/project/status delete = window.confirm(). Fix: migrate all to undo-toast pattern.

**[P2] ISO date strings in card meta**: "Start 2026-05-01 · Due 2026-05-15" machine format. Fix: relativeDate() helper showing "Due today", "Due tomorrow", "Due in N days".

**[P2] Expanded card information density**: 6 simultaneous interaction zones. Fix: collapse AI Actions behind disclosure trigger.

**[P3] Emoji sidebar icons**: 📊 📁 🏷 📚 inconsistent with restrained brand. Fix: uniform Unicode symbols or minimal icon set.

## Persona Red Flags

Alex (Power User): No keyboard shortcut for New Task. 5s undo window tight for multitasker.

Sam (Intermittent User): Stat card numbers are dead-ends — no click-through to filtered task lists.
