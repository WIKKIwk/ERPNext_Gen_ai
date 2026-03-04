from __future__ import annotations

from typing import Any, Dict

from erpnext_ai_tutor.tutor.training_heuristics import _looks_like_practical_tutorial_request
from erpnext_ai_tutor.tutor.training_intent import _infer_training_intent_with_ai
from erpnext_ai_tutor.tutor.training_patterns import (
	CONTINUE_ACTION_RE,
	CREATE_ACTION_RE,
	SHOW_SAVE_RE,
	normalize_apostrophes as _normalize_apostrophes,
)
from erpnext_ai_tutor.tutor.training_state import _extract_state
from erpnext_ai_tutor.tutor.training_targets import (
	_extract_doctype_mention_from_text,
	_extract_stock_entry_type_preference,
	_infer_doctype_from_context,
	_target_from_doctype,
)


def _build_training_context(user_message: str, ctx: Dict[str, Any]) -> Dict[str, Any]:
	text = str(user_message or "").strip()
	text_rules = _normalize_apostrophes(text)
	state = _extract_state(ctx)
	pending = str(state.get("pending") or "")
	state_doctype = str(state.get("doctype") or "")
	state_action = str(state.get("action") or "")
	state_stock_type = str(state.get("stock_entry_type_preference") or "")
	context_doctype = _infer_doctype_from_context(ctx)
	intent = _infer_training_intent_with_ai(text, has_active_tutorial=bool(state_action and state_doctype))
	intent_action = str(intent.get("action") or "other").strip().lower()
	intent_doctype = str(intent.get("doctype") or "").strip()
	practical_tutorial_requested = _looks_like_practical_tutorial_request(text_rules)
	create_requested = bool(CREATE_ACTION_RE.search(text_rules)) or practical_tutorial_requested or intent_action == "create_record"
	continue_requested = bool(CONTINUE_ACTION_RE.search(text_rules)) or intent_action == "continue"
	show_save_requested = bool(SHOW_SAVE_RE.search(text_rules)) or intent_action == "show_save"
	explicit_mention_doctype = _extract_doctype_mention_from_text(text_rules)
	explicit_target = _target_from_doctype(explicit_mention_doctype)
	explicit_doctype = str(explicit_target.get("doctype") or "").strip()
	requested_stock_type = _extract_stock_entry_type_preference(
		text_rules,
		explicit_doctype or state_doctype or intent_doctype,
	)

	# When a tutorial is already active, "to'ldir / o'rgat" style follow-ups
	# should continue the same guided flow unless user explicitly switches target.
	if state_action == "create_record" and state_doctype and practical_tutorial_requested and not explicit_doctype and not show_save_requested:
		continue_requested = True

	return {
		"text_rules": text_rules,
		"pending": pending,
		"state_doctype": state_doctype,
		"state_action": state_action,
		"state_stock_type": state_stock_type,
		"context_doctype": context_doctype,
		"intent_doctype": intent_doctype,
		"create_requested": create_requested,
		"continue_requested": continue_requested,
		"show_save_requested": show_save_requested,
		"explicit_target": explicit_target,
		"explicit_doctype": explicit_doctype,
		"practical_tutorial_requested": practical_tutorial_requested,
		"requested_stock_type": requested_stock_type,
	}
