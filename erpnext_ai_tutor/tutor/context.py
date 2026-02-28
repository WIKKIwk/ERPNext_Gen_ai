from __future__ import annotations

from typing import Any, Dict, List

from erpnext_ai_tutor.tutor.common import coerce_text, redact_key
from erpnext_ai_tutor.tutor.language import normalize_lang, reply_text


def bool_word(value: Any, *, lang: str) -> str:
	lang = normalize_lang(lang)
	v = bool(value)
	if lang == "ru":
		return "да" if v else "нет"
	if lang == "en":
		return "yes" if v else "no"
	return "ha" if v else "yo'q"


def context_summary(ctx: Dict[str, Any], *, lang: str) -> str:
	lang = normalize_lang(lang)
	labels = {
		"uz": {
			"title": "Sarlavha",
			"page_heading": "Sahifa nomi",
			"page": "Sahifa",
			"form": "Forma",
			"is_new": "Yangi hujjat",
			"is_dirty": "O'zgarish bor",
			"missing_required": "Majburiy maydonlar bo'sh",
			"active_field": "Aktiv maydon",
			"active_value": "Aktiv qiymat",
			"last_event": "Oxirgi hodisa",
			"message": "Xabar",
		},
		"ru": {
			"title": "Заголовок",
			"page_heading": "Страница",
			"page": "Путь",
			"form": "Форма",
			"is_new": "Новый документ",
			"is_dirty": "Есть изменения",
			"missing_required": "Обязательные поля пустые",
			"active_field": "Активное поле",
			"active_value": "Активное значение",
			"last_event": "Последнее событие",
			"message": "Сообщение",
		},
		"en": {
			"title": "Title",
			"page_heading": "Page",
			"page": "Route",
			"form": "Form",
			"is_new": "New document",
			"is_dirty": "Unsaved changes",
			"missing_required": "Missing required fields",
			"active_field": "Active field",
			"active_value": "Active value",
			"last_event": "Last event",
			"message": "Message",
		},
	}[lang]

	lines: List[str] = []

	page_title = coerce_text(ctx.get("page_title")).strip()
	if page_title:
		lines.append(f"{labels['title']}: {page_title}")

	page_heading = coerce_text(ctx.get("page_heading")).strip()
	if page_heading and page_heading != page_title:
		lines.append(f"{labels['page_heading']}: {page_heading}")

	route_str = coerce_text(ctx.get("route_str")).strip()
	if route_str:
		lines.append(f"{labels['page']}: {route_str}")
	else:
		route = ctx.get("route")
		if isinstance(route, list) and route:
			lines.append(f"{labels['page']}: " + "/".join(coerce_text(part) for part in route))

	form = ctx.get("form")
	if isinstance(form, dict):
		doctype = coerce_text(form.get("doctype")).strip()
		docname = coerce_text(form.get("docname")).strip()
		if doctype:
			label = f"{labels['form']}: {doctype}"
			if docname:
				label += f" ({docname})"
			lines.append(label)

		if "is_new" in form:
			lines.append(f"{labels['is_new']}: {bool_word(form.get('is_new'), lang=lang)}")
		if "is_dirty" in form:
			lines.append(f"{labels['is_dirty']}: {bool_word(form.get('is_dirty'), lang=lang)}")

		missing = form.get("missing_required")
		if isinstance(missing, list) and missing:
			missing_labels: List[str] = []
			for item in missing[:30]:
				if not isinstance(item, dict):
					continue
				label = coerce_text(item.get("label") or item.get("fieldname")).strip()
				if label:
					missing_labels.append(label)
			if missing_labels:
				lines.append(f"{labels['missing_required']}: " + ", ".join(missing_labels))

	active_field = ctx.get("active_field")
	if isinstance(active_field, dict):
		fieldname = coerce_text(active_field.get("fieldname")).strip()
		label = coerce_text(active_field.get("label")).strip()
		value = coerce_text(active_field.get("value")).strip()
		if fieldname or label:
			name = label or fieldname
			if fieldname and label and label != fieldname:
				lines.append(f"{labels['active_field']}: {name} ({fieldname})")
			else:
				lines.append(f"{labels['active_field']}: {name}")
		if value:
			if fieldname and redact_key(fieldname):
				value = "[redacted]"
			if label and redact_key(label):
				value = "[redacted]"
			if value and value != "[redacted]":
				value = value[:200]
			lines.append(f"{labels['active_value']}: {value}")

	event = ctx.get("event")
	if isinstance(event, dict):
		severity = coerce_text(event.get("severity")).strip()
		title = coerce_text(event.get("title")).strip()
		message = coerce_text(event.get("message")).strip()
		if severity or title:
			parts = [p for p in (severity, title) if p]
			if parts:
				lines.append(f"{labels['last_event']}: " + " | ".join(parts))
		if message:
			lines.append(f"{labels['message']}: " + message)

	return "\n".join(lines).strip()


def location_reply(ctx: Dict[str, Any], *, lang: str) -> str:
	ctx2 = dict(ctx or {})
	ctx2.pop("event", None)
	summary = context_summary(ctx2, lang=lang)
	if summary:
		return reply_text("location_here", lang=lang) + summary
	return reply_text("location_unknown", lang=lang)


def which_field_reply(ctx: Dict[str, Any], *, lang: str) -> str:
	lang = normalize_lang(lang)
	if not isinstance(ctx, dict):
		return reply_text("field_unknown", lang=lang)

	active_field = ctx.get("active_field")
	if not isinstance(active_field, dict):
		return reply_text("field_unknown", lang=lang)

	fieldname = coerce_text(active_field.get("fieldname")).strip()
	label = coerce_text(active_field.get("label")).strip()
	value = coerce_text(active_field.get("value")).strip()
	if not fieldname and not label:
		return reply_text("field_unknown", lang=lang)

	name = label or fieldname
	if fieldname and label and fieldname != label:
		name = f"{label} ({fieldname})"

	if value and value != "[redacted]":
		value = value[:200]

	if lang == "ru":
		if value:
			return f"Сейчас вы в поле: {name}. Текущее значение: {value}."
		return f"Сейчас вы в поле: {name}."
	if lang == "en":
		if value:
			return f"You are currently in field: {name}. Current value: {value}."
		return f"You are currently in field: {name}."
	if value:
		return f"Siz hozir quyidagi maydondasiz: {name}. Joriy qiymat: {value}."
	return f"Siz hozir quyidagi maydondasiz: {name}."


def detect_event_category(event: Dict[str, Any]) -> str:
	if not isinstance(event, dict):
		return ""
	title = coerce_text(event.get("title")).lower()
	message = coerce_text(event.get("message")).lower()
	text = f"{title}\n{message}"

	if any(k in text for k in ("not permitted", "permission", "ruxsat", "доступ", "authorized", "forbidden")):
		return "permission"
	if any(k in text for k in ("mandatory", "required", "majburiy", "обязател", "is required")):
		return "mandatory"
	if any(k in text for k in ("duplicate", "already exists", "unique", "дубликат", "уже существует")):
		return "duplicate"
	if any(k in text for k in ("not found", "linkvalidation", "invalid link", "topilmadi", "не найден")):
		return "link"
	if any(k in text for k in ("validation", "invalid", "parse", "format", "неверн", "xato format")):
		return "validation"
	return "generic"


def next_step_reply(ctx: Dict[str, Any], *, lang: str) -> str:
	lang = normalize_lang(lang)
	if not isinstance(ctx, dict):
		return reply_text("next_step_unknown", lang=lang)

	steps: List[str] = []

	form = ctx.get("form")
	if isinstance(form, dict):
		missing = form.get("missing_required")
		if isinstance(missing, list):
			missing_labels: List[str] = []
			for item in missing[:6]:
				if not isinstance(item, dict):
					continue
				label = coerce_text(item.get("label") or item.get("fieldname")).strip()
				if label:
					missing_labels.append(label)
			if missing_labels:
				if lang == "ru":
					steps.append("Сначала заполните обязательные поля: " + ", ".join(missing_labels) + ".")
				elif lang == "en":
					steps.append("First fill required fields: " + ", ".join(missing_labels) + ".")
				else:
					steps.append("Avval majburiy maydonlarni to'ldiring: " + ", ".join(missing_labels) + ".")

		if form.get("is_dirty"):
			if lang == "ru":
				steps.append('Сохраните документ (кнопка "Save"), чтобы зафиксировать изменения.')
			elif lang == "en":
				steps.append('Save the document (the "Save" button) to persist current changes.')
			else:
				steps.append('Joriy o\'zgarishlarni saqlash uchun "Save" tugmasini bosing.')

	event = ctx.get("event")
	if isinstance(event, dict):
		category = detect_event_category(event)
		if category == "permission":
			if lang == "ru":
				steps.append("Проверьте роль/права пользователя для этого DocType и действия (read/write/submit).")
				steps.append("Если прав нет, попросите System Manager выдать нужные разрешения.")
			elif lang == "en":
				steps.append("Check this user's Role permissions for the DocType and action (read/write/submit).")
				steps.append("If missing, ask a System Manager to grant the required permissions.")
			else:
				steps.append("Foydalanuvchi rolida ushbu DocType uchun kerakli ruxsatlar borligini tekshiring.")
				steps.append("Ruxsat yetarli bo'lmasa, System Manager orqali berishni so'rang.")
		elif category == "duplicate":
			if lang == "ru":
				steps.append("Проверьте, не существует ли уже запись с таким же ключом/именем.")
			elif lang == "en":
				steps.append("Check whether a record with the same unique key/name already exists.")
			else:
				steps.append("Shu unique qiymat bilan yozuv oldin yaratilmaganini tekshiring.")
		elif category == "link":
			if lang == "ru":
				steps.append("Проверьте связанные поля (Link): выберите существующее значение из списка.")
			elif lang == "en":
				steps.append("Check Link fields: select an existing value from the lookup list.")
			else:
				steps.append("Link maydonlarini tekshirib, ro'yxatdan mavjud qiymatni tanlang.")
		elif category == "validation":
			if lang == "ru":
				steps.append("Сверьте формат значений полей (дата, число, email и т.д.) с требованиями формы.")
			elif lang == "en":
				steps.append("Verify field value formats (date, number, email, etc.) against form rules.")
			else:
				steps.append("Maydon formatlarini tekshiring (sana, raqam, email va h.k.).")

	active_field = ctx.get("active_field")
	if isinstance(active_field, dict):
		field_label = coerce_text(active_field.get("label") or active_field.get("fieldname")).strip()
		if field_label:
			if lang == "ru":
				steps.append(f'Начните проверку с активного поля: "{field_label}".')
			elif lang == "en":
				steps.append(f'Start checking from the active field: "{field_label}".')
			else:
				steps.append(f'Tekshiruvni aktiv "{field_label}" maydonidan boshlang.')

	unique_steps: List[str] = []
	seen = set()
	for step in steps:
		key = step.strip().lower()
		if not key or key in seen:
			continue
		seen.add(key)
		unique_steps.append(step.strip())

	if not unique_steps:
		return reply_text("next_step_unknown", lang=lang)

	intro = {
		"uz": "Hozir shu sahifa uchun tavsiya etilgan keyingi qadamlar:",
		"ru": "Рекомендуемые следующие шаги для текущей страницы:",
		"en": "Recommended next steps for this page:",
	}[lang]
	lines = [f"{i}. {step}" for i, step in enumerate(unique_steps[:5], start=1)]
	return intro + "\n" + "\n".join(lines)


def derived_hints_system_message(ctx: Dict[str, Any]) -> str:
	if not isinstance(ctx, dict):
		return ""

	lines: List[str] = []
	form = ctx.get("form")
	if isinstance(form, dict):
		if form.get("is_dirty"):
			lines.append("Unsaved changes are present in the form.")
		missing = form.get("missing_required")
		if isinstance(missing, list) and missing:
			missing_labels: List[str] = []
			for item in missing[:8]:
				if not isinstance(item, dict):
					continue
				label = coerce_text(item.get("label") or item.get("fieldname")).strip()
				if label:
					missing_labels.append(label)
			if missing_labels:
				lines.append("Missing required fields detected: " + ", ".join(missing_labels) + ".")

	event = ctx.get("event")
	if isinstance(event, dict):
		category = detect_event_category(event)
		if category == "permission":
			lines.append("Likely root cause category: permission or role access.")
		elif category == "mandatory":
			lines.append("Likely root cause category: required field validation.")
		elif category == "duplicate":
			lines.append("Likely root cause category: duplicate/unique constraint.")
		elif category == "link":
			lines.append("Likely root cause category: invalid or missing Link value.")
		elif category == "validation":
			lines.append("Likely root cause category: value format/validation mismatch.")

	active_field = ctx.get("active_field")
	if isinstance(active_field, dict):
		name = coerce_text(active_field.get("label") or active_field.get("fieldname")).strip()
		if name:
			lines.append(f"User is currently focused on field: {name}.")

	if not lines:
		return ""
	return "DERIVED DIAGNOSTIC HINTS (high-confidence, from context):\n- " + "\n- ".join(lines)


def shrink_doc(doc: Dict[str, Any], missing_required: Any | None = None) -> Dict[str, Any]:
	required_fields: List[str] = []
	if isinstance(missing_required, list):
		for item in missing_required[:50]:
			if isinstance(item, dict) and item.get("fieldname"):
				required_fields.append(str(item["fieldname"]))

	out: Dict[str, Any] = {}
	for key in required_fields:
		if key in doc:
			out[key] = doc.get(key)

	for key, value in doc.items():
		if key in out:
			continue
		if key.startswith("_") or key.startswith("__"):
			continue
		if value is None:
			continue
		if isinstance(value, (list, dict)):
			continue
		if isinstance(value, str) and len(value) > 320:
			continue
		out[key] = value
		if len(out) >= 60:
			break

	return out


def looks_truncated(reply: str) -> bool:
	text = (reply or "").strip()
	if not text:
		return True
	if len(text) < 120:
		return text[-1] not in ".!?…"
	if len(text) > 1800:
		return False
	last = text[-1]
	if last in ".!?…":
		return False
	return last.isalnum() or last in {":", ",", "-", "—"}

