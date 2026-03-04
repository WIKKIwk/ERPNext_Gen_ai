from __future__ import annotations

from typing import Any, Dict

from erpnext_ai_tutor.tutor.navigation import build_navigation_plan
from erpnext_ai_tutor.tutor.training_intent import _infer_doctype_with_ai
from erpnext_ai_tutor.tutor.training_targets import (
	_doctype_from_plan,
	_extract_doctype_mention_from_text,
	_infer_doctype_from_context,
	_target_from_doctype,
)


def _resolve_doctype_target(
	user_message: str,
	ctx: Dict[str, Any],
	fallback_doctype: str = "",
	*,
	allow_context_fallback: bool = True,
) -> Dict[str, Any]:
	# Highest priority: explicit doctype mention in user sentence.
	explicit_doctype = _extract_doctype_mention_from_text(user_message)
	target = _target_from_doctype(explicit_doctype)
	if target:
		return target

	plan = build_navigation_plan(user_message)
	target = _doctype_from_plan(plan)
	if target:
		return target

	# AI-based target inference as a smart fallback when deterministic
	# navigation parsing cannot map the user's phrase to a doctype.
	ai_doctype = _infer_doctype_with_ai(user_message)
	target = _target_from_doctype(ai_doctype)
	if target:
		return target

	# Deterministic list-oriented second pass (kept after AI because this pass
	# can overfit to unrelated "list" doctypes for some natural-language inputs).
	forced_plan = build_navigation_plan(f"{user_message} list")
	target = _doctype_from_plan(forced_plan)
	if target:
		return target

	kind = str(plan.get("kind") or "").strip().lower() if isinstance(plan, dict) else ""
	forced_kind = str(forced_plan.get("kind") or "").strip().lower() if isinstance(forced_plan, dict) else ""
	explicit_nav_target = kind in {"doctype", "module", "workspace"} or forced_kind in {"doctype", "module", "workspace"}

	if allow_context_fallback and not explicit_nav_target:
		context_doctype = _infer_doctype_from_context(ctx)
		target = _target_from_doctype(context_doctype)
		if target:
			return target

	fallback = str(fallback_doctype or "").strip()
	target = _target_from_doctype(fallback)
	if target:
		return target

	return {}
