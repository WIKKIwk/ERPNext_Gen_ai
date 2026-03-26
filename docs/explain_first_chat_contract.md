# Explain-First Chat Contract

This document freezes the first architecture contract for issue `#1`:
`Triggerlarsiz explain-first tutor arxitekturasi va AI guide-offer oqimi`.

The goal is to remove trigger-based routing as the product foundation and
separate four concepts that are currently too tightly coupled:

- `reply`
- `guide_offer`
- `guide`
- `tutor_state`

## Core Rules

1. Plain `chat()` must be explain-first.
2. Plain `chat()` must never auto-start a guided run.
3. `guide_offer` is UI affordance metadata, not execution payload.
4. `guide` is executable guidance metadata and must only appear after an
   explicit guide start action.
5. `tutor_state` must only exist after an actual guided session has started.
6. No keyword or phrase is allowed to directly force a guided run.

## Field Definitions

### `reply`

Human-facing assistant response for the current turn.

Rules:

- Always conversational.
- Always safe to show in chat immediately.
- May explain, teach, troubleshoot, or answer navigation questions.
- Must not be replaced by a hardcoded tutorial starter message unless a guided
  run has actually started.

### `guide_offer`

Optional metadata telling the frontend whether it should render an optional
`Ko'rsatib ber` button.

Rules:

- Optional.
- Non-executable.
- Does not start cursor flow.
- Does not create tutorial state.
- Must be based on intent + context + confidence, not trigger words.

Allowed shape:

```json
{
  "show": true,
  "confidence": 0.84,
  "reason": "In-product guide is likely useful",
  "target_label": "Item",
  "route": "/app/item",
  "menu_path": ["Stock", "Item"],
  "mode": "create_record"
}
```

Field rules:

- `show`: boolean, required if `guide_offer` exists.
- `confidence`: float in `0..1`.
- `reason`: short diagnostic text for logs/debugging, not required for end-user
  rendering.
- `target_label`: human-readable ERP target.
- `route`: normalized ERP route.
- `menu_path`: optional resolved path for the UI.
- `mode`: expected guide mode such as `create_record`, `navigate`, or
  `manage_roles`.

### `guide`

Executable guidance payload for deterministic cursor execution.

Rules:

- Reserved for explicit guide start paths only.
- Must be normalized and validated before returning.
- Must not appear in plain explain-only `chat()` responses.
- May be passed to the frontend only when the system is actually ready to run
  a guided cursor flow.

Allowed shape:

```json
{
  "type": "navigation",
  "route": "/app/item",
  "target_label": "Item",
  "menu_path": ["Stock", "Item"],
  "tutorial": {
    "mode": "create_record",
    "stage": "open_and_fill_basic",
    "doctype": "Item"
  }
}
```

### `tutor_state`

Persistent guided-session state for multi-step cursor flows.

Rules:

- Must be absent in explain-only turns.
- Must only be created after an explicit guide start action.
- Must not be used as a side effect of `guide_offer`.
- Must track real guided progress, not UI speculation.

## Response Modes

### Mode A: Explain only

Used for normal chat and read-only learning.

```json
{
  "ok": true,
  "reply": "Item qo'shish uchun avval Stock modulidagi Item ro'yxatini ochasiz...",
  "guide_offer": null,
  "guide": null,
  "tutor_state": null
}
```

### Mode B: Explain + optional guide offer

Used when the system believes an in-product guide would help, but the user has
not started it yet.

```json
{
  "ok": true,
  "reply": "Item qo'shish jarayonini qisqacha tushuntiraman...",
  "guide_offer": {
    "show": true,
    "confidence": 0.84,
    "reason": "In-product guide is likely useful",
    "target_label": "Item",
    "route": "/app/item",
    "menu_path": ["Stock", "Item"],
    "mode": "create_record"
  },
  "guide": null,
  "tutor_state": null
}
```

### Mode C: Explicit guide start

Used only after the user clicks the optional guide button or otherwise performs
an explicit guide-start action.

```json
{
  "ok": true,
  "reply": "Mayli, endi amalda ko'rsataman.",
  "guide_offer": null,
  "guide": {
    "type": "navigation",
    "route": "/app/item",
    "target_label": "Item",
    "menu_path": ["Stock", "Item"],
    "tutorial": {
      "mode": "create_record",
      "stage": "open_and_fill_basic",
      "doctype": "Item"
    }
  },
  "tutor_state": {
    "action": "create_record",
    "doctype": "Item",
    "stage": "open_and_fill_basic",
    "pending": ""
  }
}
```

## Invariants

These rules must remain true across backend and frontend changes:

- `guide_offer != guide`
- `guide_offer` must not imply execution
- `guide_offer` must not create `tutor_state`
- `guide` must not be returned by plain explain-only chat
- `tutor_state` must not exist before explicit guide start
- keyword matching must not be the primary routing mechanism for guide offers

## Backend Expectations

For plain `chat()`:

- return `reply`
- optionally return `guide_offer`
- do not return `guide`
- do not create `tutor_state`

For explicit guide start:

- resolve and validate target
- return executable `guide`
- create `tutor_state`
- only then allow deterministic cursor flow

## Frontend Expectations

For plain chat rendering:

- always show `reply`
- render `Ko'rsatib ber` only if `guide_offer.show == true`
- never auto-run cursor from `guide_offer`

For explicit guide start:

- call the guide-start path
- wait for executable `guide`
- start cursor flow from returned `guide`

## What This Contract Solves

This contract prevents the current class of failures where:

- `item qo'shishni o'rgat` incorrectly becomes a tutorial starter template
- explanation and execution are mixed in one response
- button visibility depends on brittle trigger phrases
- guided flow starts too early for users who only want read-only learning
