from __future__ import annotations

from typing import Dict, List

import frappe


def get_ai_provider_config() -> Dict[str, str]:
	"""Reuse ERPNext AI's provider/key settings when available."""
	try:
		from erpnext_ai.erpnext_ai.doctype.ai_settings.ai_settings import AISettings

		doc = AISettings.get_settings()
		api_key = getattr(doc, "_resolved_api_key", None)
		if not api_key:
			raise ValueError("Missing API key")
		return {
			"provider": doc.api_provider,
			"model": doc.openai_model,
			"api_key": api_key,
			"language": getattr(doc, "language", "uz") or "uz",
		}
	except Exception as exc:
		frappe.throw(
			"AI sozlamalari topilmadi yoki API key yo'q. "
			"Desk → Chatting with AI → AI Settings bo'limida OpenAI/Gemini API key'ni kiriting."
		)
		raise exc


def call_llm(*, messages: List[dict], max_tokens: int | None = None) -> str:
	cfg = get_ai_provider_config()
	try:
		from erpnext_ai.erpnext_ai.services.llm_client import generate_completion
	except Exception as exc:
		frappe.throw("ERPNext AI komponentlari topilmadi. Iltimos `erpnext_ai` app o'rnatilganini tekshiring.")
		raise exc

	def call_with(token_cap: int) -> str:
		return generate_completion(
			provider=cfg["provider"],
			api_key=cfg["api_key"],
			model=cfg["model"],
			messages=messages,
			temperature=0.2,
			max_completion_tokens=token_cap,
			timeout=60,
		)

	caps = [int(max_tokens)] if max_tokens else [8192, 4096, 2048]
	for cap in caps:
		try:
			return call_with(cap)
		except Exception as exc:
			msg = str(exc).lower()
			token_related = (
				"maxoutputtokens",
				"max_completion_tokens",
				"max tokens",
				"output tokens",
				"token limit",
				"too large",
				"exceeds",
				"invalid argument",
			)
			if not any(p in msg for p in token_related):
				raise
	return call_with(2048)
