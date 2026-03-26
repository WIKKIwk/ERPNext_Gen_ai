from __future__ import annotations

from typing import Any, Dict

from erpnext_ai_tutor.tutor.training_intent import _infer_training_intent_with_ai
from erpnext_ai_tutor.tutor.training_resolution import _resolve_doctype_target
from erpnext_ai_tutor.tutor.training_state import _extract_state

GUIDE_OFFER_ACTIONS = {"create_record", "manage_roles"}
GUIDE_OFFER_MIN_CONFIDENCE = 0.55


def build_guide_offer(user_message: str, ctx: Dict[str, Any]) -> Dict[str, Any] | None:
	"""Return non-executable guide affordance metadata for normal chat replies."""
	text = str(user_message or "").strip()
	if not text:
		return None

	ctx = ctx if isinstance(ctx, dict) else {}
	state = _extract_state(ctx)
	if state.get("pending") or state.get("action") == "create_record":
		return None

	intent = _infer_training_intent_with_ai(text, has_active_tutorial=False)
	action = str(intent.get("action") or "").strip().lower()
	doctype = str(intent.get("doctype") or "").strip()
	try:
		confidence = float(intent.get("confidence") or 0.0)
	except Exception:
		confidence = 0.0

	if action not in GUIDE_OFFER_ACTIONS:
		return None
	if confidence < GUIDE_OFFER_MIN_CONFIDENCE:
		return None

	target_query = doctype or text
	target = _resolve_doctype_target(
		target_query,
		ctx,
		fallback_doctype=doctype,
		allow_context_fallback=True,
	)
	if not isinstance(target, dict) or not target:
		return None

	route = str(target.get("route") or "").strip()
	target_label = str(target.get("doctype") or target.get("target_label") or "").strip()
	if not route or not target_label:
		return None

	menu_path = target.get("menu_path")
	if not isinstance(menu_path, list):
		menu_path = []
	menu_path = [str(x).strip() for x in menu_path if str(x or "").strip()]

	mode = "manage_roles" if action == "manage_roles" else "create_record"
	return {
		"show": True,
		"confidence": max(0.0, min(confidence, 1.0)),
		"reason": "semantic_intent_resolved_target",
		"target_label": target_label,
		"route": route,
		"menu_path": menu_path,
		"mode": mode,
	}
