## Rules
- Never attribute git commits or PRs to Claude or any other AI model

## Code quality

Write clean, maintainable code and refactor as you go. The guiding rules we hold
this codebase to:

- **DRY — don't duplicate.** If the same logic appears in two places, extract it.
- **Proper decomposition.** Each unit does one thing and has a clear interface.
  Split behavior from presentation;
  when a file grows large or a function does several jobs, break it up.
- **Consistent patterns.** Match how the surrounding code already solves a problem
  rather than inventing a parallel one. Reuse the shared primitive; add a small,
  well-named option to it before forking a near-copy.
- **YAGNI.** Don't add flexibility, params, or abstraction for hypothetical futures.

Before finishing a change, scan it for the classic code smells (full catalog:
https://refactoring.guru/refactoring/smells) and fix any you introduced:

- **Bloaters** — Long Method · Large Class · Primitive Obsession · Long Parameter
  List · Data Clumps.
- **Object-Orientation Abusers** — Switch Statements (prefer polymorphism/maps) ·
  Temporary Field · Refused Bequest · Alternative Classes with Different Interfaces.
- **Change Preventers** — Divergent Change · Shotgun Surgery · Parallel Inheritance
  Hierarchies.
- **Dispensables** — Duplicate Code · Dead Code · Lazy Class · Data Class ·
  Speculative Generality · redundant **Comments** (write comments that explain _why_,
  not restatements of _what_ the code plainly does).
- **Couplers** — Feature Envy · Inappropriate Intimacy · Message Chains · Middle
  Man · Incomplete Library Class.