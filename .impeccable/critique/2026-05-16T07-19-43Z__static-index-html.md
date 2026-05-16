---
target: static/index.html
total_score: 22
p0_count: 0
p1_count: 3
timestamp: 2026-05-16T07-19-43Z
slug: static-index-html
---
# Critique — MyTask (static/index.html)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Good: overdue badge, toasts, active nav, AI briefing. Gap: no spinner during dashboard load |
| 2 | Match System / Real World | 3 | "KB" abbreviation is opaque. Everything else natural |
| 3 | User Control and Freedom | 2 | No undo for deleted tasks. Escape works on forms/modals but delete is permanent |
| 4 | Consistency and Standards | 2 | border-left = priority on cards; border-right = active on sidebar — same visual element, two meanings. Activity items hardcode border-radius: 6px instead of var(--r) |
| 5 | Error Prevention | 3 | Title required, date constraints, delete confirmation. Minor: no warning when past due date is set |
| 6 | Recognition Rather Than Recall | 2 | AI actions hidden inside expanded cards; keyboard shortcuts exist but zero UI exposure; "KB" requires prior knowledge |
| 7 | Flexibility and Efficiency | 2 | Five views is genuinely good. Ctrl+Enter for chat. No command palette, no global shortcuts, no bulk operations |
| 8 | Aesthetic and Minimalist Design | 2 | Three simultaneous priority signals on task cards. Dashboard stat cards add color noise. Emoji icons conflict with stated personality |
| 9 | Error Recovery | 2 | Login and form errors are clear. Network errors on list load log silently to console |
| 10 | Help and Documentation | 1 | No tooltips, no onboarding, no keyboard shortcut reference |
| **Total** | | **22/40** | **Acceptable** |

## Anti-Patterns Verdict

SaaS-generic dark palette confirmed. Three absolute bans tripped: side-stripe borders (task cards + sidebar active), hero-metric template (dashboard stats), identical card grid (project cards and activity items).

## Overall Impression

Feature-rich tool hamstrung by aesthetic identity that contradicts its stated personality. Biggest opportunity: replace the color strategy entirely.

## What's Working

1. Multi-view architecture (list/board/calendar/timeline/table) is genuinely useful
2. Filter bar always visible across all views
3. Inline editing pattern is coherent and tight

## Priority Issues

- [P1] Color strategy is the anti-reference (#13152a + #4a90d9 = SaaS-generic dark)
- [P1] Side-stripe border pattern on task cards and sidebar (absolute ban)
- [P1] Dashboard is a hero-metric template
- [P2] Emoji icons don't match "focused and serious" personality
- [P2] No undo after destructive operations

## Persona Red Flags

**Alex (Power User)**: No keyboard shortcut for new task. No bulk operations. AI actions require card expansion. No keyboard shortcut to switch views.

**Sam (Accessibility)**: Priority communicated by border-left-color alone (color as sole indicator). ai-dot has no text alternative. Focus indicators not explicitly styled.

**IT Professional "Dana"**: No urgency distribution per project. "KB" abbreviation is opaque.

## Minor Observations

- dash-activity-item hardcodes border-radius: 6px instead of var(--r)
- Chat widget and task-edit-form borders use accent color, diluting its semantic authority
- New Task button at bottom of list is worst location for primary action
