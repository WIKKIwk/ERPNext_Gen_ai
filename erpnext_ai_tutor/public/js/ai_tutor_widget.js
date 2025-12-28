/* global frappe */

(function () {
	"use strict";

	const METHOD_GET_CONFIG = "erpnext_ai_tutor.api.get_tutor_config";
	const METHOD_CHAT = "erpnext_ai_tutor.api.chat";

	const SENSITIVE_KEY_PARTS = [
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
	];

	function isDesk() {
		return typeof frappe !== "undefined" && frappe.session && frappe.get_route;
	}

	function redactKey(key) {
		const lower = String(key || "").toLowerCase();
		return SENSITIVE_KEY_PARTS.some((p) => lower.includes(p));
	}

	function sanitize(value, depth = 0, maxDepth = 6) {
		if (depth > maxDepth) return "[truncated]";
		if (Array.isArray(value)) return value.slice(0, 200).map((v) => sanitize(v, depth + 1, maxDepth));
		if (value && typeof value === "object") {
			const out = {};
			for (const [k, v] of Object.entries(value)) {
				out[k] = redactKey(k) ? "[redacted]" : sanitize(v, depth + 1, maxDepth);
			}
			return out;
		}
		if (typeof value === "string" && value.length > 4000) return value.slice(0, 4000) + "…";
		return value;
	}

	function stripHtml(html) {
		try {
			const div = document.createElement("div");
			div.innerHTML = String(html || "");
			return (div.textContent || div.innerText || "").trim();
		} catch {
			return String(html || "").trim();
		}
	}

	function guessSeverity(indicator) {
		const s = String(indicator || "").toLowerCase().trim();
		if (!s) return null;
		if (s === "red") return "error";
		if (s === "orange" || s === "yellow") return "warning";
		return null;
	}

	function nowTime() {
		try {
			return new Date().toLocaleTimeString();
		} catch {
			return "";
		}
	}

	function getFormContext(includeDocValues) {
		const frm = window.cur_frm;
		if (!frm || !frm.doctype) return null;

		const ctx = {
			doctype: frm.doctype,
			docname: frm.docname,
			is_new: Boolean(frm.is_new && frm.is_new()),
			is_dirty: Boolean(frm.is_dirty && frm.is_dirty()),
		};

		try {
			const meta = frappe.get_meta(frm.doctype);
			const requiredMissing = [];
			if (meta && Array.isArray(meta.fields)) {
				for (const df of meta.fields) {
					if (!df || !df.reqd || !df.fieldname) continue;
					const val = frm.doc ? frm.doc[df.fieldname] : null;
					const empty =
						val === null ||
						val === undefined ||
						val === "" ||
						(Array.isArray(val) && val.length === 0);
					if (empty) requiredMissing.push({ fieldname: df.fieldname, label: df.label || df.fieldname });
				}
			}
			if (requiredMissing.length) ctx.missing_required = requiredMissing.slice(0, 30);
		} catch {
			// ignore
		}

		if (includeDocValues && frm.doc) {
			ctx.doc = sanitize(frm.doc);
		}
		return ctx;
	}

	function getContextSnapshot(config, lastEvent) {
		const includeDocValues = Boolean(config?.include_doc_values);
		const snapshot = {
			route: typeof frappe.get_route === "function" ? frappe.get_route() : [],
			route_str: typeof frappe.get_route_str === "function" ? frappe.get_route_str() : "",
			url: window.location.href,
			user: frappe.session && frappe.session.user,
			event: lastEvent || null,
		};
		if (config?.include_form_context) {
			snapshot.form = getFormContext(includeDocValues);
		}
		return sanitize(snapshot);
	}

	class TutorWidget {
		constructor() {
			this.config = null;
			this.aiReady = false;
			this.isOpen = false;
			this.history = [];
			this.lastEvent = null;
			this.$root = null;
			this.$drawer = null;
			this.$body = null;
			this.$input = null;
			this.$send = null;
			this.$pill = null;
		}

		async init() {
			this.render();
			await this.loadConfig();
			this.installHooks();
		}

		render() {
			const root = document.createElement("div");
			root.className = "erpnext-ai-tutor-root";
			root.innerHTML = `
				<button class="erpnext-ai-tutor-fab" type="button" aria-label="AI Tutor">
					${frappe?.utils?.icon ? frappe.utils.icon("es-line-question", "md") : "AI"}
				</button>
				<div class="erpnext-ai-tutor-drawer erpnext-ai-tutor-hidden" role="dialog" aria-label="AI Tutor">
					<div class="erpnext-ai-tutor-header">
						<div>
							<div class="erpnext-ai-tutor-title">AI Yordamchi</div>
							<div class="erpnext-ai-tutor-subtitle">Sahifa bo‘yicha yordam</div>
						</div>
						<div class="erpnext-ai-tutor-header-spacer"></div>
						<span class="erpnext-ai-tutor-pill erpnext-ai-tutor-hidden"></span>
						<button class="erpnext-ai-tutor-close" type="button" aria-label="Yopish">
							${frappe?.utils?.icon ? frappe.utils.icon("close", "sm") : "×"}
						</button>
					</div>
					<div class="erpnext-ai-tutor-body"></div>
					<div class="erpnext-ai-tutor-footer">
						<form class="erpnext-ai-tutor-form">
							<textarea class="erpnext-ai-tutor-input" rows="1" placeholder="Savolingizni yozing..."></textarea>
							<button class="erpnext-ai-tutor-send" type="submit">Yuborish</button>
						</form>
					</div>
				</div>
			`;

			document.body.appendChild(root);
			this.$root = root;
			this.$drawer = root.querySelector(".erpnext-ai-tutor-drawer");
			this.$body = root.querySelector(".erpnext-ai-tutor-body");
			this.$input = root.querySelector(".erpnext-ai-tutor-input");
			this.$send = root.querySelector(".erpnext-ai-tutor-send");
			this.$pill = root.querySelector(".erpnext-ai-tutor-pill");

			root.querySelector(".erpnext-ai-tutor-fab").addEventListener("click", () => this.toggle());
			root.querySelector(".erpnext-ai-tutor-close").addEventListener("click", () => this.close());

			root.querySelector(".erpnext-ai-tutor-form").addEventListener("submit", async (e) => {
				e.preventDefault();
				await this.sendUserMessage();
			});

			this.$input.addEventListener("keydown", (e) => {
				if (e.key === "Enter" && !e.shiftKey) {
					e.preventDefault();
					this.sendUserMessage();
				}
			});
		}

		async loadConfig() {
			try {
				const r = await frappe.call(METHOD_GET_CONFIG);
				this.config = r?.message?.config || r?.message?.config || r?.message?.config;
				this.aiReady = Boolean(r?.message?.ai_ready);
				const enabled = r?.message?.config?.enabled;
				if (enabled === false) {
					this.$root.classList.add("erpnext-ai-tutor-hidden");
				}
			} catch {
				// keep defaults
				this.config = { enabled: true, auto_open_on_error: true, auto_open_on_warning: true, include_form_context: true, include_doc_values: true, max_context_kb: 24 };
				this.aiReady = false;
			}
		}

		installHooks() {
			if (!frappe || !frappe.msgprint || this._hooksInstalled) return;
			this._hooksInstalled = true;

			const originalMsgprint = frappe.msgprint.bind(frappe);
			frappe.msgprint = (...args) => {
				try {
					this.onMsgprint(args);
				} catch {
					// ignore
				}
				return originalMsgprint(...args);
			};

			if (frappe.show_alert) {
				const originalAlert = frappe.show_alert.bind(frappe);
				frappe.show_alert = (...args) => {
					try {
						this.onAlert(args);
					} catch {
						// ignore
					}
					return originalAlert(...args);
				};
			}

			// Catch unhandled JS errors too (best-effort).
			window.addEventListener("unhandledrejection", (event) => {
				try {
					const reason = event?.reason;
					const message = stripHtml(reason?.message || reason || "Unhandled promise rejection");
					this.handleEvent({ severity: "error", title: "Frontend xatolik", message, source: "unhandledrejection" });
				} catch {
					// ignore
				}
			});

			window.addEventListener("error", (event) => {
				try {
					const message = stripHtml(event?.message || "Frontend xatolik");
					this.handleEvent({ severity: "error", title: "Frontend xatolik", message, source: "window.error" });
				} catch {
					// ignore
				}
			});
		}

		onMsgprint(args) {
			let message = "";
			let title = "";
			let indicator = "";
			const first = args[0];
			if (typeof first === "string") {
				message = first;
				title = args[1] || "";
				indicator = args[2] || "";
			} else if (first && typeof first === "object") {
				message = first.message || first.msg || "";
				title = first.title || "";
				indicator = first.indicator || first.color || "";
			}

			const severity = guessSeverity(indicator);
			if (!severity) return;
			this.handleEvent({ severity, title: stripHtml(title), message: stripHtml(message), source: "msgprint" });
		}

		onAlert(args) {
			const first = args[0];
			let indicator = "";
			let message = "";
			if (typeof first === "string") {
				message = first;
				indicator = args[1] || "";
			} else if (first && typeof first === "object") {
				message = first.message || "";
				indicator = first.indicator || "";
			}

			const severity = guessSeverity(indicator);
			if (!severity) return;
			this.handleEvent({ severity, title: "", message: stripHtml(message), source: "alert" });
		}

		async handleEvent(ev) {
			this.lastEvent = { ...ev, at: Date.now() };
			const autoOpen =
				(ev.severity === "error" && this.config?.auto_open_on_error) ||
				(ev.severity === "warning" && this.config?.auto_open_on_warning);
			if (!autoOpen) return;

			this.open();
			this.showPill(ev.severity);
			await this.autoHelp(ev);
		}

		showPill(severity) {
			if (!this.$pill) return;
			this.$pill.classList.remove("erpnext-ai-tutor-hidden", "red", "orange");
			this.$pill.classList.add(severity === "error" ? "red" : "orange");
			this.$pill.textContent = severity === "error" ? "Xatolik" : "Ogohlantirish";
		}

		clearPill() {
			if (!this.$pill) return;
			this.$pill.classList.add("erpnext-ai-tutor-hidden");
			this.$pill.textContent = "";
		}

		open() {
			if (this.isOpen) return;
			this.isOpen = true;
			this.$drawer.classList.remove("erpnext-ai-tutor-hidden");
			setTimeout(() => this.$input && this.$input.focus(), 0);
		}

		close() {
			this.isOpen = false;
			this.$drawer.classList.add("erpnext-ai-tutor-hidden");
			this.clearPill();
		}

		toggle() {
			if (this.isOpen) this.close();
			else this.open();
		}

		append(role, content) {
			this.history.push({ role, content });
			const wrap = document.createElement("div");
			wrap.className = `erpnext-ai-tutor-message ${role}`;

			const bubble = document.createElement("div");
			bubble.className = "erpnext-ai-tutor-bubble";

			const text = document.createElement("div");
			text.className = "erpnext-ai-tutor-text";
			text.textContent = String(content ?? "");

			const meta = document.createElement("div");
			meta.className = "erpnext-ai-tutor-meta";
			meta.textContent = nowTime();

			bubble.append(text, meta);
			wrap.appendChild(bubble);
			this.$body.appendChild(wrap);
			this.$body.scrollTop = this.$body.scrollHeight;
		}

		setBusy(on) {
			if (!this.$send) return;
			this.$send.disabled = Boolean(on);
			if (on) this.$send.textContent = "…";
			else this.$send.textContent = "Yuborish";
		}

		async autoHelp(ev) {
			const msg = [
				"ERP tizimida xatolik/ogohlantirish chiqdi.",
				ev.title ? `Sarlavha: ${ev.title}` : null,
				ev.message ? `Xabar: ${ev.message}` : null,
				"",
				"Iltimos, bu nimani anglatishini o'zbekcha tushuntirib bering va shu sahifada qanday tuzatishimni kamida 5 ta qadam bilan ayting.",
			]
				.filter(Boolean)
				.join("\n");
			await this.ask(msg);
		}

		async sendUserMessage() {
			const text = String(this.$input.value || "").trim();
			if (!text) return;
			this.$input.value = "";
			await this.ask(text);
		}

		async ask(text) {
			this.append("user", text);
			this.setBusy(true);
			try {
				const ctx = getContextSnapshot(this.config, this.lastEvent);
				const history = this.history.slice(-20);
				// Remove the message we just appended (current user message) to avoid duplication.
				if (history.length && history[history.length - 1]?.role === "user") {
					history.pop();
				}
				const r = await frappe.call(METHOD_CHAT, {
					message: text,
					context: ctx,
					history,
				});
				const reply = r?.message?.reply || r?.message?.reply || r?.message?.message || r?.message;
				this.append("assistant", reply || "Javob bo‘sh keldi.");
			} catch (e) {
				this.append("assistant", "AI bilan bog‘lanishda xatolik. AI Settings (OpenAI/Gemini API key) sozlanganini tekshiring.");
			} finally {
				this.setBusy(false);
			}
		}
	}

	function boot() {
		if (!isDesk()) return;
		if (window.__erpnext_ai_tutor_widget) return;
		window.__erpnext_ai_tutor_widget = new TutorWidget();
		window.__erpnext_ai_tutor_widget.init();
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", boot);
	} else {
		boot();
	}
})();
