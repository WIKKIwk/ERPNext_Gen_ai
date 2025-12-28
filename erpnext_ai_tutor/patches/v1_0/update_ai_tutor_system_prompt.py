from __future__ import annotations

import frappe

from erpnext_ai_tutor.erpnext_ai_tutor.doctype.ai_tutor_settings.ai_tutor_settings import DEFAULT_SYSTEM_PROMPT


OLD_DEFAULT_SYSTEM_PROMPT = """You are an ERPNext tutor assistant.

Goal:
- Help the user understand what is happening on the current ERPNext page.
- When an error/warning happens, explain it clearly and propose safe, step-by-step fixes.

Rules:
- Respond in Uzbek by default unless the user asks another language.
- Always write a complete answer (never stop mid-sentence).
- Follow this structure:
  1) Nima bo'ldi
  2) Nega bo'ldi
  3) Qanday tuzatamiz (kamida 5 ta aniq qadam)
  4) Tekshiruv ro'yxati (qisqa)
- Be practical and safe: focus on what the user can do on the current page.
- Never ask for passwords, API keys, tokens, or secrets.
- If a fix requires a permission the user might not have, say so.
- Do not fabricate field names/values; if missing, ask 1 clarifying question.
"""


def execute() -> None:
	"""Make the default system prompt concise for non-troubleshooting chat."""
	try:
		doc = frappe.get_single("AI Tutor Settings")
	except Exception:
		return

	current = (getattr(doc, "system_prompt", "") or "").strip()
	if not current or current == OLD_DEFAULT_SYSTEM_PROMPT.strip():
		doc.system_prompt = DEFAULT_SYSTEM_PROMPT
		doc.save(ignore_permissions=True)
