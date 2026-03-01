# CLAUDE.md — AI Assistant Guide for `membran`

## Project Overview

**membran** is a project in its earliest stage ("layer I"). The name "membran"
(membrane) suggests a boundary-layer or middleware architecture — acting as a
selective interface between components or systems. The full architecture has not
yet been defined.

**Current state (as of 2026-03-01):** Single `README.md`, no source code,
no build tooling, no language or framework chosen.

---

## Repository Layout

```
membran/
└── README.md        # Minimal project description ("membran / layer I")
```

As code is added, this section should be updated to reflect the actual
directory structure, language(s), and module boundaries.

---

## Git Workflow

### Branch naming

| Purpose | Pattern | Example |
|---------|---------|---------|
| AI-generated features | `claude/<short-description>-<session-id>` | `claude/add-claude-documentation-9mX0n` |
| Regular features | `feature/<description>` | `feature/auth-layer` |
| Bug fixes | `fix/<description>` | `fix/null-pointer` |

The default development branch is **`main`**. Never push directly to `main`
without a pull request.

### Push rules

- Always push with tracking: `git push -u origin <branch-name>`
- AI branches **must** start with `claude/` and end with the matching session
  ID, otherwise pushes will fail with HTTP 403.
- On network failure, retry up to 4 times with exponential back-off:
  2 s → 4 s → 8 s → 16 s.

### Commit messages

Write short, imperative subject lines (≤72 characters):

```
Add authentication middleware
Fix null dereference in request parser
Refactor connection pool into separate module
```

Avoid vague messages like "fix", "update", or "WIP".

---

## Development Conventions (to adopt as the project grows)

Because no language or framework has been chosen yet, the following are
**default conventions** to apply when the first code is committed.
Revise this section once concrete decisions are made.

### General

- Keep logic small and testable; prefer pure functions over stateful objects
  where possible.
- No dead code. Remove unused variables, imports, and functions rather than
  commenting them out.
- Avoid premature abstraction. Three similar lines are better than a wrong
  abstraction. Extract helpers only when a pattern repeats three or more times.
- Do not add comments that restate what the code does. Only comment *why*
  when the reason is non-obvious.

### Security

- Validate all data at system boundaries (user input, external APIs, file I/O).
  Trust internal calls.
- Never commit secrets, tokens, or credentials. Use environment variables or a
  secrets manager.
- Sanitize any output that is rendered in a browser or shell context to prevent
  XSS and injection attacks.

### Error handling

- Errors must be handled or explicitly propagated — never silently swallowed.
- Provide enough context in error messages to diagnose the failure without
  reading source code.

---

## Working as an AI Assistant in this Repo

### Before making changes

1. Read every file you intend to modify. Do not propose changes to unseen code.
2. Understand the existing approach before suggesting a different one.
3. Scope changes to exactly what was requested. Do not clean up surrounding
   code, add docstrings, or refactor unless explicitly asked.

### Making changes

- Prefer editing existing files over creating new ones.
- Keep pull-request diffs small and focused. One logical change per commit.
- After implementing, run any available linters and tests before pushing.
  If no tooling exists yet, note this in the PR description.

### Committing and pushing

```bash
# Stage specific files (never `git add -A` or `git add .` blindly)
git add <file1> <file2>

git commit -m "Short imperative description"

git push -u origin claude/<description>-<session-id>
```

---

## Updating This File

This `CLAUDE.md` should be kept current. Update it whenever:

- A language, framework, or build tool is adopted
- New top-level directories are added
- Coding conventions or workflows change
- CI/CD pipelines or test commands are established

The goal is that any AI assistant (or new human contributor) can read this file
and immediately understand how to work effectively in the repository.
