```
███████╗██████╗ ██████╗ ███╗   ██╗███████╗██╗  ██╗████████╗
██╔════╝██╔══██╗██╔══██╗████╗  ██║██╔════╝╚██╗██╔╝╚══██╔══╝
█████╗  ██████╔╝██████╔╝██╔██╗ ██║█████╗   ╚███╔╝    ██║
██╔══╝  ██╔══██╗██╔═══╝ ██║╚██╗██║██╔══╝   ██╔██╗    ██║
███████╗██║  ██║██║     ██║ ╚████║███████╗██╔╝ ██╗   ██║
╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝   ╚═╝
 █████╗ ██╗    ████████╗██╗   ██╗████████╗ ██████╗ ██████╗
██╔══██╗██║    ╚══██╔══╝██║   ██║╚══██╔══╝██╔═══██╗██╔══██╗
███████║██║       ██║   ██║   ██║   ██║   ██║   ██║██████╔╝
██╔══██║██║       ██║   ██║   ██║   ██║   ██║   ██║██╔══██╗
██║  ██║██║       ██║   ╚██████╔╝   ██║   ╚██████╔╝██║  ██║
╚═╝  ╚═╝╚═╝       ╚═╝    ╚═════╝    ╚═╝    ╚═════╝ ╚═╝  ╚═╝
```

# ERPNEXT AI TUTOR :: DESK-SIDE ERROR/WARNING CO-PILOT

```
PROJECT  : ERPNext AI Tutor (Frappe App)
PURPOSE  : Floating Desk widget that explains errors/warnings + answers with live page context
MODULE   : "ERPNext AI Tutor" → "AI Tutor Settings" (Single DocType)
DEPENDS  : erpnext_ai (AI Settings + LLM client)
PLATFORM : Frappe v15+ | ERPNext v15+
RUNTIME  : Python 3.10+ | Node.js 18+ (bench)
LICENSE  : Apache-2.0 (see license.txt)
```

---

## $ man erpnext-ai-tutor

```text
NAME
  erpnext-ai-tutor - Desk-side AI tutor widget with automatic error/warning help.

SYNOPSIS
  - Opens as a floating widget inside ERPNext Desk.
  - Captures Desk alerts/errors and auto-generates a troubleshooting prompt.
  - Sends sanitized page/form context (optional) to your configured LLM provider via erpnext_ai.

DESCRIPTION
  When a user hits an error/warning inside ERPNext Desk, the widget can auto-open and ask the
  AI tutor to explain "what happened" and "how to fix it" with practical steps for the current page.

  It also supports normal questions like:
    - "Qayerdaman?" / "Where am I?"
    - "Qaysi maydonni to'ldiryapman?" / "Which field is active?"

SECURITY
  Context is sanitized and size-capped (redaction + truncation). Secrets are never requested.
```

---

## SYSTEM OVERVIEW

```
ERPNext AI Tutor is a Desk-native helper (widget) that sits on every Desk page.
It is designed for:
  - Admins + power users who face validation errors, permission issues, or confusing warnings
  - Teams that want "instant, contextual" troubleshooting without copy-pasting screenshots

CORE IDEA:
  Capture what ERPNext already shows to the user (error/warning + page context),
  sanitize it, and ask the AI for a safe, step-by-step explanation + fix plan.
```

---

## ARCHITECTURE (HIGH LEVEL)

```
OPERATIONAL FLOW
┌───────────────────────────────────────────────────────────────────┐
│ ERPNext Desk (Browser)                                            │
│   - Widget UI (JS/CSS)                                            │
│   - Hooks: frappe.msgprint / frappe.show_alert / window.error      │
│   - Captures: route, page title, active field, (optional) form doc │
└───────────────────────────────┬───────────────────────────────────┘
                                │ frappe.call()
                                ▼
┌───────────────────────────────────────────────────────────────────┐
│ Frappe Server: erpnext_ai_tutor                                   │
│   - get_tutor_config()  -> public config + ai_ready                │
│   - chat()              -> sanitize + truncate + prompt building   │
└───────────────────────────────┬───────────────────────────────────┘
                                │ erpnext_ai.services.llm_client
                                ▼
┌───────────────────────────────────────────────────────────────────┐
│ ERPNext AI (erpnext_ai)                                           │
│   - AI Settings (provider/model/api_key)                           │
│   - generate_completion(...)                                       │
└───────────────────────────────┬───────────────────────────────────┘
                                │ HTTPS
                                ▼
┌───────────────────────────────────────────────────────────────────┐
│ LLM Provider (OpenAI / Gemini / ...)                               │
└───────────────────────────────────────────────────────────────────┘
```

---

## FEATURE MATRIX

```
DESK WIDGET UX
├── Floating button (bottom-right)
├── Drawer chat UI (compact + fast)
├── Conversation history (browser localStorage, per-user)
├── New chat button + history switcher
└── Keyboard: Enter = send, Shift+Enter = newline

AUTO HELP (ERROR/WARNING)
├── Captures error/warning popups
│   ├── frappe.msgprint(...) with indicator: red/orange/yellow
│   └── frappe.show_alert(...)
├── Best-effort front-end crash capture
│   ├── window.error
│   └── unhandledrejection
├── Auto-open on Error / Warning (configurable)
└── Rate limiting (prevents spam loops)

CONTEXT AWARENESS (OPTIONAL)
├── Route + page title/heading
├── Current form doctype/docname (when available)
├── Missing required fields (best-effort)
├── Active field + (sanitized) value
└── (Optional) sanitized form doc values (size-capped)

LLM SAFETY
├── Redaction of common secret key names
├── Depth + list-size + string-length caps
└── Max context KB limit (server-side truncation)
```

---

## OPERATIONAL DETAILS (DEFAULT BEHAVIOR)

```text
AUTO HELP DETECTION
  Auto-generated troubleshooting prompts start with:
    "ERP tizimida xatolik/ogohlantirish chiqdi."

AUTO HELP RATE LIMITS (CLIENT)
  - Cooldown per unique event fingerprint ............. 45s
  - Max auto-helps per rolling window (60s) ........... 3
  - Failure cooldown (auto mode) ...................... 2m

CHAT STATE (CLIENT)
  - Stored in browser localStorage (per ERPNext user)
  - Key pattern: erpnext_ai_tutor:<host>:<user>:v1
  - Pruning: keeps up to 20 conversations × 200 messages each

CONTEXT SNAPSHOT (CLIENT → SERVER)
  - Always: route, route_str, page_title, page_heading, url, user
  - Optional (settings): form context + sanitized doc values
  - Best-effort: active field {fieldname,label,value} (sanitized)
  - Last event: {severity,title,message,source}
```

---

## PROJECT LAYOUT (FILES OF INTEREST)

```text
apps/erpnext_ai_tutor/
├── README.md
├── pyproject.toml
└── erpnext_ai_tutor/
    ├── hooks.py ........................ Desk asset injection (app_include_js/css)
    ├── api.py .......................... Whitelisted endpoints + sanitization + LLM calls
    ├── public/js/ai_tutor_widget.js .... UI + event capture + context snapshot + localStorage
    ├── public/css/ai_tutor_widget.css .. UI styling
    └── erpnext_ai_tutor/doctype/ai_tutor_settings/
        ├── ai_tutor_settings.json ...... Settings schema + permissions
        └── ai_tutor_settings.py ........ Defaults + config helpers
```

---

## TECHNICAL REQUIREMENTS

```
FRAPPE / ERPNEXT
├── Frappe Framework: v15.x (minimum recommended)
├── ERPNext: v15.x (recommended)
└── Bench: configured site environment

DEPENDENCIES
├── erpnext_ai app (required)
│   └── Provides: AI Settings + LLM client used by this app
└── LLM Provider key (OpenAI / Gemini / ...)

RUNTIME
├── Python: 3.10+
└── Node.js: per your bench/ERPNext requirements
```

---

## INSTALLATION PROTOCOLS

### [PROTOCOL 1] BENCH INSTALL (RECOMMENDED)

```bash
# 1) Go to your bench
cd /path/to/frappe-bench

# 2) Get the app
bench get-app <REPO_URL_OR_LOCAL_PATH> erpnext_ai_tutor

# 3) Install on your site
bench --site <site-name> install-app erpnext_ai_tutor

# 4) Run migrations (creates "AI Tutor Settings")
bench --site <site-name> migrate

# 5) Build assets + clear cache
bench build --app erpnext_ai_tutor
bench --site <site-name> clear-cache
bench restart
```

### [PROTOCOL 2] MANUAL (DEV / LOCAL EDITABLE)

```bash
cd /path/to/frappe-bench/apps
git clone <REPO_URL> erpnext_ai_tutor

cd /path/to/frappe-bench
source env/bin/activate
pip install -e apps/erpnext_ai_tutor

bench --site <site-name> install-app erpnext_ai_tutor
bench --site <site-name> migrate
bench build --app erpnext_ai_tutor
```

---

## DEPENDENCY SETUP (erpnext_ai)

If `erpnext_ai` is missing or not configured, the tutor will reply with an AI Settings error.

```text
Desk → Chatting with AI → AI Settings
  - Select provider (OpenAI / Gemini / ...)
  - Set API key
  - Pick a model
```

Quick checks:

```bash
bench --site <site-name> list-apps | rg "erpnext_ai|erpnext_ai_tutor"

bench --site <site-name> console
>>> frappe.get_single("AI Tutor Settings").enabled
```

---

## CONFIGURATION MATRIX (AI Tutor Settings)

Open settings:

```text
ERPNext Desk → Search bar → "AI Tutor Settings"
PERMISSIONS: System Manager
```

```
FIELDS
├── Enable AI Tutor
│   ├── ON  : widget loads on Desk
│   └── OFF : widget hidden
│
├── Auto-open on Error / Auto-open on Warning
│   ├── ON  : opens and auto-asks for a fix when an error/warning popup appears
│   └── OFF : no auto-open; widget works manually
│
├── Include Page Context
│   ├── ON  : injects route/page/form context into the LLM prompt (recommended)
│   └── OFF : chat works as generic assistant (less contextual, more private)
│
├── Include Form Values
│   ├── ON  : sends sanitized current doc values when available (more accurate, less private)
│   └── OFF : avoids sending field values (safer)
│
├── Max Context Size (KB)
│   ├── default: 24
│   ├── min: 4   | max: 256
│   └── caps context JSON to prevent token exhaustion / slow responses
│
├── Language (uz / ru / en)
│   └── fallback language when message is ambiguous (auto-detects user language)
│
└── System Prompt (advanced)
    └── override the tutor's core behavior and troubleshooting style
```

---

## PRIVACY / SECURITY NOTES

```
SANITIZATION
├── Redacts keys containing:
│   password, passwd, pwd, token, secret, api_key, apikey,
│   authorization, auth, private_key, signature
├── Caps recursion depth + list size
├── Truncates long strings
└── Truncates oversize context payloads (Max Context KB)

STORAGE
├── Chat history is stored in the browser (localStorage), per-user
└── Server does not persist conversation history (it is client-supplied per request)
```

Important:
- Treat any LLM provider as an external system. Even with sanitization, review what you share.
- For strict privacy, disable `Include Form Values`.

---

## API SURFACE (Frappe Whitelisted)

```text
erpnext_ai_tutor.api.get_tutor_config
  -> { config: {...}, ai_ready: bool, language: "uz|ru|en" }

erpnext_ai_tutor.api.chat
  args:
    - message: str
    - context: dict|json (sanitized)
    - history: list|json (last ~20 messages)
  -> { ok: bool, reply: str }
```

---

## TROUBLESHOOTING

### Widget does not show up

```bash
# Ensure app is installed
bench --site <site-name> list-apps | rg erpnext_ai_tutor

# Ensure settings enabled
bench --site <site-name> console
>>> frappe.get_single("AI Tutor Settings").enabled

# Rebuild assets + clear cache (common after updates)
bench build --app erpnext_ai_tutor
bench --site <site-name> clear-cache
bench restart
```

### "AI Settings topilmadi yoki API key yo'q"

Fix:
- Install/configure `erpnext_ai`
- Set provider + API key in `AI Settings`

### Auto-open does not trigger

Checks:
- `AI Tutor Settings` → `Auto-open on Error/Warning` enabled
- Error popup uses indicator `red` / `orange` / `yellow` (only those are treated as error/warning)

### Trigger a test error/warning (Desk Console)

Open browser devtools on ERPNext Desk and run:

```js
frappe.msgprint({ message: "AI Tutor test error", indicator: "red" });
frappe.show_alert({ message: "AI Tutor test warning", indicator: "orange" });
```

### Reset local chat history (client-side)

```js
Object.keys(localStorage)
	.filter((k) => k.startsWith("erpnext_ai_tutor:"))
	.forEach((k) => localStorage.removeItem(k));
```

---

## DEVELOPMENT

This app uses `pre-commit` for formatting/lint.

```bash
cd apps/erpnext_ai_tutor
pre-commit install
pre-commit run -a
```

Tools (via pre-commit):

```
ruff      - Python lint/format
eslint    - JS lint
prettier  - formatting
pyupgrade - Python modernization
```

---

## LICENSE

Apache License 2.0. See `license.txt`.
