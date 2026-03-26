from __future__ import annotations

from typing import Any, Dict

from erpnext_ai_tutor.tutor.training_intent import _infer_training_intent_with_ai
from erpnext_ai_tutor.tutor.training_resolution import _resolve_doctype_target
from erpnext_ai_tutor.tutor.training_state import _extract_state
from erpnext_ai_tutor.tutor.training_targets import _infer_doctype_from_context

GUIDE_OFFER_ACTIONS = {"create_record", "manage_roles"}
GUIDE_OFFER_MIN_CONFIDENCE = 0.55
GUIDE_OFFER_CONTEXT_MATCH_MIN_CONFIDENCE = 0.45
GUIDE_OFFER_NO_CONTEXT_HIGH_CONFIDENCE = 0.65


def _normalize_confidence(value: Any) -> float:
	try:
		return max(0.0, min(float(value or 0.0), 1.0))
	except Exception:
		return 0.0


def _context_match(target_label: str, ctx: Dict[str, Any]) -> bool:
	context_doctype = str(_infer_doctype_from_context(ctx) or "").strip()
	target = str(target_label or "").strip()
	if not context_doctype or not target:
		return False
	return context_doctype.lower() == target.lower()


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
	confidence = _normalize_confidence(intent.get("confidence"))

	if action not in GUIDE_OFFER_ACTIONS:
		return None
	if confidence < GUIDE_OFFER_CONTEXT_MATCH_MIN_CONFIDENCE:
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

	has_context_match = _context_match(target_label, ctx)
	if has_context_match:
		if confidence < GUIDE_OFFER_CONTEXT_MATCH_MIN_CONFIDENCE:
			return None
		reason = "semantic_intent_resolved_target_context_match"
	elif doctype:
		if confidence < GUIDE_OFFER_MIN_CONFIDENCE:
			return None
		reason = "semantic_intent_resolved_target"
	else:
		if confidence < GUIDE_OFFER_NO_CONTEXT_HIGH_CONFIDENCE:
			return None
		reason = "semantic_intent_resolved_target_high_confidence"

	menu_path = target.get("menu_path")
	if not isinstance(menu_path, list):
		menu_path = []
	menu_path = [str(x).strip() for x in menu_path if str(x or "").strip()]

	mode = "manage_roles" if action == "manage_roles" else "create_record"
	return {
		"show": True,
		"confidence": confidence,
		"reason": reason,
		"target_label": target_label,
		"route": route,
		"menu_path": menu_path,
		"mode": mode,
	}
