from __future__ import annotations

import re
from typing import Any, Dict, List

import frappe

from erpnext_ai_tutor.tutor.navigation import build_navigation_plan


CREATE_ACTION_RE = re.compile(
	r"(?:\b(?:yangi|create|add|new|yarat[a-z\u0400-\u04FF'’_-]*|qo['’]?sh[a-z\u0400-\u04FF'’_-]*)\b)",
	re.IGNORECASE,
)

CONTINUE_ACTION_RE = re.compile(
	r"(?:\b(?:davom|keyingi|yana|continue|next)\b)",
	re.IGNORECASE,
)

SHOW_SAVE_RE = re.compile(
	r"(?:\b(?:save|submit|saqla|saqlash|сохран|отправ)\b)",
	re.IGNORECASE,
)

GENERIC_HELP_RE = re.compile(
	r"(?:\b(?:qanday|qanaqa|nima\s+qil(?:ay|sam|ishim)|yordam|help|how\s+do\s+i|what\s+should\s+i\s+do)\b)",
	re.IGNORECASE,
)

ACTION_KEYWORDS_RE = re.compile(
	r"(?:\b(?:qo['’]sh|yarat|create|add|new|tahrir|edit|delete|o['’]chir|top|find|navigate|ko['’]rsat|show)\b)",
	re.IGNORECASE,
)

ALLOWED_STAGES = {"open_and_fill_basic", "fill_more", "show_save_only"}
ALLOWED_PENDING = {"", "action", "target"}


def _msg(lang: str, *, uz: str, ru: str, en: str) -> str:
	if lang == "ru":
		return ru
	if lang == "en":
		return en
	return uz


def _normalize_slug(text: str) -> str:
	value = str(text or "").strip().lower().replace("_", "-")
	if value.endswith("-list"):
		value = value[: -len("-list")]
	return value.strip("-")


def _doctype_to_slug(doctype: str) -> str:
	return frappe.scrub(str(doctype or "")).replace("_", "-")


def _is_real_doctype(name: str) -> bool:
	value = str(name or "").strip()
	if not value:
		return False
	return bool(
		frappe.db.exists(
			"DocType",
			{
				"name": value,
				"issingle": 0,
				"istable": 0,
				"is_virtual": 0,
			},
		)
	)


def _doctype_from_slug(slug: str) -> str:
	key = _normalize_slug(slug)
	if not key:
		return ""
	row = frappe.db.sql(
		"""
		select name
		from `tabDocType`
		where ifnull(issingle, 0)=0
		  and ifnull(istable, 0)=0
		  and ifnull(is_virtual, 0)=0
		  and replace(replace(lower(name), ' ', '-'), '_', '-')=%s
		limit 1
		""",
		(key,),
		as_dict=True,
	)
	if not row:
		return ""
	return str(row[0].get("name") or "").strip()


def _extract_route_parts(ctx: Dict[str, Any]) -> List[str]:
	route = ctx.get("route")
	if isinstance(route, list):
		parts = [str(x or "").strip() for x in route if str(x or "").strip()]
		if parts:
			return parts
	route_str = str(ctx.get("route_str") or "").strip().strip("/")
	if not route_str:
		return []
	return [p.strip() for p in route_str.split("/") if p.strip()]


def _infer_doctype_from_context(ctx: Dict[str, Any]) -> str:
	if not isinstance(ctx, dict):
		return ""
	form = ctx.get("form")
	if isinstance(form, dict):
		form_doctype = str(form.get("doctype") or "").strip()
		if _is_real_doctype(form_doctype):
			return form_doctype

	parts = _extract_route_parts(ctx)
	if not parts:
		return ""
	if parts and parts[0].lower() == "form" and len(parts) > 1 and _is_real_doctype(parts[1]):
		return str(parts[1]).strip()

	candidates: List[str] = []
	if parts:
		candidates.append(parts[0])
		candidates.append(parts[-1])
	if len(parts) > 1:
		candidates.append(parts[-2])

	seen = set()
	for raw in candidates:
		token = str(raw or "").strip()
		if not token or token in seen:
			continue
		seen.add(token)
		if token.lower().startswith("new-"):
			continue
		doctype = _doctype_from_slug(token)
		if doctype:
			return doctype
	return ""


def _normalize_menu_path(menu_path: Any, doctype: str) -> List[str]:
	path: List[str] = []
	if isinstance(menu_path, list):
		for item in menu_path:
			text = str(item or "").strip()
			if text and text not in path:
				path.append(text)
	if doctype and doctype not in path:
		path.append(doctype)
	return path[:6]


def _resolve_doctype_target(
	user_message: str,
	ctx: Dict[str, Any],
	fallback_doctype: str = "",
	*,
	allow_context_fallback: bool = True,
) -> Dict[str, Any]:
	plan = build_navigation_plan(user_message)
	kind = str(plan.get("kind") or "").strip().lower() if isinstance(plan, dict) else ""
	if kind == "doctype":
		doctype = str(plan.get("doctype") or plan.get("target_label") or "").strip()
		if doctype and _is_real_doctype(doctype):
			route = str(plan.get("route") or "").strip() or f"/app/{_doctype_to_slug(doctype)}"
			menu_path = _normalize_menu_path(plan.get("menu_path"), doctype)
			return {
				"doctype": doctype,
				"route": route,
				"menu_path": menu_path,
			}

	if allow_context_fallback:
		context_doctype = _infer_doctype_from_context(ctx)
		if context_doctype and _is_real_doctype(context_doctype):
			plan2 = build_navigation_plan(f"{context_doctype} list")
			route = str(plan2.get("route") or "").strip() if isinstance(plan2, dict) else ""
			if not route:
				route = f"/app/{_doctype_to_slug(context_doctype)}"
			menu_path = _normalize_menu_path(plan2.get("menu_path") if isinstance(plan2, dict) else None, context_doctype)
			return {
				"doctype": context_doctype,
				"route": route,
				"menu_path": menu_path,
			}

	fallback = str(fallback_doctype or "").strip()
	if fallback and _is_real_doctype(fallback):
		plan3 = build_navigation_plan(f"{fallback} list")
		route = str(plan3.get("route") or "").strip() if isinstance(plan3, dict) else ""
		if not route:
			route = f"/app/{_doctype_to_slug(fallback)}"
		menu_path = _normalize_menu_path(plan3.get("menu_path") if isinstance(plan3, dict) else None, fallback)
		return {
			"doctype": fallback,
			"route": route,
			"menu_path": menu_path,
		}

	return {}


def _extract_state(ctx: Dict[str, Any]) -> Dict[str, Any]:
	state_raw = ctx.get("tutor_state") if isinstance(ctx, dict) else None
	if not isinstance(state_raw, dict):
		return {}
	pending = str(state_raw.get("pending") or "").strip().lower()
	if pending not in ALLOWED_PENDING:
		pending = ""
	stage = str(state_raw.get("stage") or "").strip().lower()
	if stage not in ALLOWED_STAGES:
		stage = "open_and_fill_basic"
	doctype = str(state_raw.get("doctype") or "").strip()
	action = str(state_raw.get("action") or "").strip().lower()
	if action != "create_record":
		action = ""
	return {
		"pending": pending,
		"stage": stage,
		"doctype": doctype,
		"action": action,
	}


def _build_guide_payload(doctype: str, route: str, menu_path: List[str], stage: str) -> Dict[str, Any]:
	clean_stage = stage if stage in ALLOWED_STAGES else "open_and_fill_basic"
	return {
		"type": "navigation",
		"route": str(route or "").strip(),
		"target_label": doctype,
		"menu_path": _normalize_menu_path(menu_path, doctype),
		"tutorial": {
			"mode": "create_record",
			"stage": clean_stage,
			"doctype": doctype,
		},
	}


def _coach_state(doctype: str, stage: str, pending: str = "") -> Dict[str, Any]:
	return {
		"action": "create_record",
		"doctype": str(doctype or "").strip(),
		"stage": stage if stage in ALLOWED_STAGES else "open_and_fill_basic",
		"pending": pending if pending in ALLOWED_PENDING else "",
	}


def _action_clarify_reply(lang: str) -> str:
	return _msg(
		lang,
		uz=(
			"Albatta. Qaysi harakatni ko'rsatib beray?\n"
			"Masalan: yangi Item qo'shish, yangi Sales Invoice yaratish, yoki boshqa Doctype ochish."
		),
		ru=(
			"Конечно. Какое действие показать?\n"
			"Например: создать новый Item, создать Sales Invoice или открыть другой DocType."
		),
		en=(
			"Sure. Which action should I demonstrate?\n"
			"For example: create a new Item, create a Sales Invoice, or open another DocType."
		),
	)


def _target_clarify_reply(lang: str) -> str:
	return _msg(
		lang,
		uz="Tayyorman. Qaysi DocType uchun yangi yozuv yaratamiz? (masalan: Item, Customer, Sales Invoice)",
		ru="Готово. Для какого DocType создаём новую запись? (например: Item, Customer, Sales Invoice)",
		en="Ready. For which DocType should we create a new record? (e.g., Item, Customer, Sales Invoice)",
	)


def _start_tutorial_reply(lang: str, doctype: str) -> str:
	return _msg(
		lang,
		uz=(
			f"Zo'r, endi **{doctype}** bo'yicha amaliy ko'rsataman: ro'yxatni ochamiz, `Add/New` ni bosamiz "
			"va asosiy maydonlarni demo tarzda to'ldiramiz. Xavfsizlik uchun `Save/Submit` ni avtomatik bosmayman."
		),
		ru=(
			f"Отлично, сейчас покажу практический сценарий для **{doctype}**: откроем список, нажмём `Add/New` "
			"и заполним базовые поля в демо-режиме. Из соображений безопасности `Save/Submit` автоматически не нажимаю."
		),
		en=(
			f"Great, I will walk you through **{doctype}**: open the list, click `Add/New`, and fill key fields in demo mode. "
			"For safety, I will not click `Save/Submit` automatically."
		),
	)


def _continue_tutorial_reply(lang: str, doctype: str, stage: str) -> str:
	if stage == "show_save_only":
		return _msg(
			lang,
			uz=f"Tushunarli. **{doctype}** formasida `Save/Submit` joyini ko'rsataman, lekin uni bosmayman.",
			ru=f"Понял. На форме **{doctype}** покажу, где находится `Save/Submit`, но нажимать не буду.",
			en=f"Understood. On the **{doctype}** form, I will show where `Save/Submit` is, but I will not click it.",
		)
	return _msg(
		lang,
		uz=f"Mayli, **{doctype}** bo'yicha keyingi bosqichni davom ettiraman va qo'shimcha maydonlarni to'ldirib ko'rsataman.",
		ru=f"Хорошо, продолжаю следующий шаг по **{doctype}** и покажу заполнение дополнительных полей.",
		en=f"Alright, I will continue the next **{doctype}** step and demonstrate filling additional fields.",
	)


def _needs_action_clarification(user_message: str) -> bool:
	text = str(user_message or "").strip()
	if len(text) > 140:
		return False
	if CREATE_ACTION_RE.search(text):
		return False
	return bool(GENERIC_HELP_RE.search(text)) and not bool(ACTION_KEYWORDS_RE.search(text))


def _build_training_reply(
	*,
	reply: str,
	tutor_state: Dict[str, Any] | None = None,
	guide: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
	payload: Dict[str, Any] = {"ok": True, "reply": str(reply or "").strip()}
	if guide:
		payload["guide"] = guide
		payload["auto_guide"] = False
	if tutor_state is not None:
		payload["tutor_state"] = tutor_state
	return payload


def maybe_handle_training_flow(
	user_message: str,
	ctx: Dict[str, Any],
	*,
	lang: str,
	advanced_mode: bool,
) -> Dict[str, Any] | None:
	"""Deterministic coach flow for practical create-record teaching."""
	if not advanced_mode:
		return None

	text = str(user_message or "").strip()
	if not text:
		return None

	state = _extract_state(ctx)
	pending = str(state.get("pending") or "")
	state_doctype = str(state.get("doctype") or "")
	state_action = str(state.get("action") or "")

	if pending == "action":
		target = _resolve_doctype_target(text, ctx, allow_context_fallback=False)
		if target:
			doctype = str(target.get("doctype") or "").strip()
			reply = _start_tutorial_reply(lang, doctype)
			guide = _build_guide_payload(
				doctype=doctype,
				route=str(target.get("route") or ""),
				menu_path=target.get("menu_path") or [],
				stage="open_and_fill_basic",
			)
			return _build_training_reply(
				reply=reply,
				guide=guide,
				tutor_state=_coach_state(doctype, "open_and_fill_basic"),
			)
		if CREATE_ACTION_RE.search(text):
			target = _resolve_doctype_target(text, ctx, allow_context_fallback=True)
			if target:
				doctype = str(target.get("doctype") or "").strip()
				reply = _start_tutorial_reply(lang, doctype)
				guide = _build_guide_payload(
					doctype=doctype,
					route=str(target.get("route") or ""),
					menu_path=target.get("menu_path") or [],
					stage="open_and_fill_basic",
				)
				return _build_training_reply(
					reply=reply,
					guide=guide,
					tutor_state=_coach_state(doctype, "open_and_fill_basic"),
				)
			return _build_training_reply(
				reply=_target_clarify_reply(lang),
				tutor_state={"pending": "target", "action": "create_record", "stage": "open_and_fill_basic"},
			)
		return _build_training_reply(reply=_action_clarify_reply(lang), tutor_state={"pending": "action"})

	if pending == "target":
		target = _resolve_doctype_target(text, ctx, allow_context_fallback=False)
		if not target and CREATE_ACTION_RE.search(text):
			target = _resolve_doctype_target(text, ctx, allow_context_fallback=True)
		if not target:
			return _build_training_reply(
				reply=_target_clarify_reply(lang),
				tutor_state={"pending": "target", "action": "create_record", "stage": "open_and_fill_basic"},
			)
		doctype = str(target.get("doctype") or "").strip()
		reply = _start_tutorial_reply(lang, doctype)
		guide = _build_guide_payload(
			doctype=doctype,
			route=str(target.get("route") or ""),
			menu_path=target.get("menu_path") or [],
			stage="open_and_fill_basic",
		)
		return _build_training_reply(
			reply=reply,
			guide=guide,
			tutor_state=_coach_state(doctype, "open_and_fill_basic"),
		)

	if state_action == "create_record" and state_doctype and (CONTINUE_ACTION_RE.search(text) or SHOW_SAVE_RE.search(text)):
		stage = "show_save_only" if SHOW_SAVE_RE.search(text) else "fill_more"
		target = _resolve_doctype_target(state_doctype, ctx, fallback_doctype=state_doctype)
		doctype = str(target.get("doctype") or state_doctype).strip()
		route = str(target.get("route") or f"/app/{_doctype_to_slug(doctype)}")
		menu_path = target.get("menu_path") or [doctype]
		reply = _continue_tutorial_reply(lang, doctype, stage)
		guide = _build_guide_payload(doctype=doctype, route=route, menu_path=menu_path, stage=stage)
		return _build_training_reply(
			reply=reply,
			guide=guide,
			tutor_state=_coach_state(doctype, stage),
		)

	if CREATE_ACTION_RE.search(text):
		target = _resolve_doctype_target(text, ctx)
		if not target:
			return _build_training_reply(
				reply=_target_clarify_reply(lang),
				tutor_state={"pending": "target", "action": "create_record", "stage": "open_and_fill_basic"},
			)
		doctype = str(target.get("doctype") or "").strip()
		reply = _start_tutorial_reply(lang, doctype)
		guide = _build_guide_payload(
			doctype=doctype,
			route=str(target.get("route") or ""),
			menu_path=target.get("menu_path") or [],
			stage="open_and_fill_basic",
		)
		return _build_training_reply(
			reply=reply,
			guide=guide,
			tutor_state=_coach_state(doctype, "open_and_fill_basic"),
		)

	if _needs_action_clarification(text):
		return _build_training_reply(reply=_action_clarify_reply(lang), tutor_state={"pending": "action"})

	return None
