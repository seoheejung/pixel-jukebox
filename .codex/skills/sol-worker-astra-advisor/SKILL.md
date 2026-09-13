---
name: sol-worker-astra-advisor
description: Use when Sol is blocked by a reproduced hard failure, an unresolved architecture tradeoff, or when an independent high-value review is requested.
---

# Sol Worker / Astra Advisor

Keep implementation, tests, debugging, and verification on `GPT-5.6 Sol`.

Before escalation, try a reasonable Sol pass at `Medium` and collect only the evidence needed to explain the blocker.

For Astra, pass only:
- the concrete question;
- relevant code/interface/error excerpts;
- reproduced behavior;
- attempts already made;
- project constraints.

When supported, use `GPT-6 Astra` with `fork_turns: "none"` as a read-only advisor.

Astra must not edit files, commit, change dependencies, expand scope, or spawn other agents.

Ask Astra for:
- Finding
- Evidence
- Recommended direction
- Risks / unresolved points

Return to Sol for implementation and verification.

If explicit model selection or `fork_turns: "none"` is unsupported, state that limitation instead of pretending Astra was used.
