from __future__ import annotations

from typing import Any, Dict

import frappe


SENSITIVE_KEY_PARTS = (
	"password",
	"passwd",
	"pwd",
	"token",
	"secret",
	"api_key",
	"apikey",
	"authorization",
	"auth",
	"private_key",
	"signature",
)


def redact_key(key: str) -> bool:
	lower = (key or "").lower()
	return any(part in lower for part in SENSITIVE_KEY_PARTS)


def sanitize(value: Any, *, depth: int = 0, max_depth: int = 6) -> Any:
	if depth > max_depth:
		return "[truncated]"

	if isinstance(value, dict):
		out: Dict[str, Any] = {}
		for k, v in value.items():
			key = str(k)
			if redact_key(key):
				out[key] = "[redacted]"
			else:
				out[key] = sanitize(v, depth=depth + 1, max_depth=max_depth)
		return out

	if isinstance(value, list):
		items = value[:200]
		return [sanitize(v, depth=depth + 1, max_depth=max_depth) for v in items]

	if isinstance(value, str):
		if len(value) > 4000:
			return value[:4000] + "…"
		return value

	return value


def coerce_text(value: Any) -> str:
	if value is None:
		return ""
	if isinstance(value, str):
		return value
	return str(value)


def clip_ui_text(value: Any, *, limit: int = 80) -> str:
	text = coerce_text(value).replace("\r", " ").replace("\n", " ")
	text = " ".join(text.split()).strip()
	if not text:
		return ""
	if len(text) > limit:
		return text[: limit - 1] + "…"
	return text


def parse_json_arg(value: Any) -> Any:
	"""Frappe JS often sends nested args as JSON strings; normalize them back."""
	if isinstance(value, str):
		try:
			return frappe.parse_json(value)
		except Exception:
			return value
	return value

