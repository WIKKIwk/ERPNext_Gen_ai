from __future__ import annotations

import re


CYRILLIC_RE = re.compile(r"[\u0400-\u04FF]")
UZ_CYRILLIC_HINT_RE = re.compile(r"[ўқғҳЎҚҒҲ]")
EN_HINT_RE = re.compile(
	r"\b(the|and|or|but|what|why|how|where|when|who|which|hi|hello|hey|please|thanks|thx|thank\s+you)\b",
	re.IGNORECASE,
)
LANG_REQUEST_EN_RE = re.compile(
	r"(?:^|\b)(english|in\s+english|speak\s+english|respond\s+in\s+english|ingliz|inglizcha|en)(?:\b|$)",
	re.IGNORECASE,
)
LANG_REQUEST_RU_RE = re.compile(
	r"(?:^|\b)(russian|in\s+russian|speak\s+russian|respond\s+in\s+russian|ruscha|ru)(?:\b|$)|по[-\s]?русски|русск",
	re.IGNORECASE,
)
LANG_REQUEST_UZ_RE = re.compile(
	r"(?:^|\b)(uzbek|o['’]zbek|o‘zbek|uzbekcha|o['’]zbekcha|o‘zbekcha|uz)(?:\b|$)|o['’]zbek|o‘zbek|по[-\s]?узбекски",
	re.IGNORECASE,
)


def normalize_lang(lang: str | None) -> str:
	raw = (lang or "").strip().lower()
	if not raw:
		return "uz"
	raw = raw.replace("_", "-").split("-", 1)[0]
	if raw in {"uz", "ru", "en"}:
		return raw
	return "uz"


def normalize_emoji_style(style: str | None) -> str:
	raw = (style or "").strip().lower()
	if raw in {"off", "soft", "warm"}:
		return raw
	return "soft"


def detect_user_lang(user_message: str, *, fallback: str) -> str:
	text = (user_message or "").strip()
	if not text:
		return fallback

	if LANG_REQUEST_EN_RE.search(text):
		return "en"
	if LANG_REQUEST_RU_RE.search(text):
		return "ru"
	if LANG_REQUEST_UZ_RE.search(text):
		return "uz"

	if CYRILLIC_RE.search(text):
		return "uz" if UZ_CYRILLIC_HINT_RE.search(text) else "ru"

	if EN_HINT_RE.search(text):
		return "en"

	return fallback


def detect_requested_lang(user_message: str) -> str | None:
	text = (user_message or "").strip()
	if not text:
		return None
	if LANG_REQUEST_EN_RE.search(text):
		return "en"
	if LANG_REQUEST_RU_RE.search(text):
		return "ru"
	if LANG_REQUEST_UZ_RE.search(text):
		return "uz"
	return None


def language_policy_system_message(*, fallback: str) -> str:
	fallback = normalize_lang(fallback)
	fallback_label = {"uz": "Uzbek (uz)", "ru": "Russian (ru)", "en": "English (en)"}[fallback]
	return (
		"LANGUAGE POLICY:\n"
		"- Reply in the same language as the user's last message.\n"
		"- If the user explicitly requests a language, follow it.\n"
		f"- If the user's message is language-ambiguous (numbers/code), default to {fallback_label}.\n"
		"- Do not mix languages unless the user does.\n"
		"- Exception: when referencing UI buttons/labels, you may quote the exact on-screen label even if it's in another language.\n"
		"- This policy overrides other language instructions.\n"
	)


def language_for_response_system_message(*, lang: str, fallback: str) -> str:
	lang = normalize_lang(lang or fallback)
	if lang == "ru":
		return "For this response: reply in Russian (ru). Do not reply in Uzbek or English."
	if lang == "en":
		return "For this response: reply in English (en). Do not reply in Uzbek or Russian."
	return "For this response: reply in Uzbek (uz). Do not reply in Russian or English."


def reply_text(key: str, *, lang: str, emoji_style: str = "soft") -> str:
	lang = normalize_lang(lang)
	emoji_style = normalize_emoji_style(emoji_style)
	if key == "greeting":
		greetings = {
			"off": {
				"uz": "Salom! Yordam berishga tayyorman, nimadan boshlaymiz?",
				"ru": "Привет! Я рядом, чем помочь в первую очередь?",
				"en": "Hi! I'm here to help. What should we start with?",
			},
			"soft": {
				"uz": "Salom 🙂 Men yoningizdaman, nimadan boshlaymiz?",
				"ru": "Привет 🙂 Я рядом, с чего начнём?",
				"en": "Hi 🙂 I'm right here with you. What should we start with?",
			},
			"warm": {
				"uz": "Salom 😊 Men doim yoningizdaman. Nima bo'lsa ham birga hal qilamiz ✨",
				"ru": "Привет 😊 Я рядом и помогу шаг за шагом. Всё решим вместе ✨",
				"en": "Hi 😊 I'm here for you. We'll solve it together, step by step ✨",
			},
		}
		selected = greetings.get(emoji_style, greetings["soft"])
		return selected.get(lang) or selected.get("uz") or ""

	table = {
		"disabled": {
			"uz": "AI Tutor o'chirilgan (AI Tutor Settings).",
			"ru": "AI Tutor отключен (AI Tutor Settings).",
			"en": "AI Tutor is disabled (AI Tutor Settings).",
		},
		"empty_message": {
			"uz": "Xabar bo'sh bo'lmasin.",
			"ru": "Сообщение не должно быть пустым.",
			"en": "Message can't be empty.",
		},
		"continue_request": {
			"uz": "Davom ettiring va javobni to'liq yakunlang.",
			"ru": "Продолжите и полностью завершите ответ.",
			"en": "Continue and finish the answer completely.",
		},
		"location_here": {
			"uz": "Siz hozir shu joydasiz:\n",
			"ru": "Вы сейчас здесь:\n",
			"en": "You're here:\n",
		},
		"location_unknown": {
			"uz": (
				"Hozirgi sahifani aniqlay olmadim. Iltimos sahifani yangilang "
				"yoki qaysi sahifada ekaningizni ayting (masalan: Item, Sales Invoice, Chart of Accounts)."
			),
			"ru": (
				"Не удалось определить текущую страницу. Обновите страницу "
				"или скажите, на какой странице вы сейчас (например: Item, Sales Invoice, Chart of Accounts)."
			),
			"en": (
				"I couldn't detect your current page. Please refresh the page "
				"or tell me which page you're on (e.g., Item, Sales Invoice, Chart of Accounts)."
			),
		},
		"field_unknown": {
			"uz": "Hozir aktiv maydonni aniq topa olmadim. Biror maydonni tanlab yana so'rang.",
			"ru": "Не удалось определить активное поле. Выберите поле и спросите ещё раз.",
			"en": "I couldn't detect the active field. Click a field and ask again.",
		},
		"next_step_unknown": {
			"uz": "Kontekst yetarli emas. Qaysi xatoni yoki qaysi sahifani tuzatayotganingizni yozing.",
			"ru": "Недостаточно контекста. Уточните ошибку или страницу, которую вы исправляете.",
			"en": "Not enough context. Tell me the exact error or page you're trying to fix.",
		},
	}
	return table.get(key, {}).get(lang) or table.get(key, {}).get("uz") or ""
