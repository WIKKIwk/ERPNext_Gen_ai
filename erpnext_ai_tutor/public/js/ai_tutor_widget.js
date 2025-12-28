/* global frappe */

(function () {
	"use strict";

	const METHOD_GET_CONFIG = "erpnext_ai_tutor.api.get_tutor_config";
	const METHOD_CHAT = "erpnext_ai_tutor.api.chat";

	const STORAGE_VERSION = 1;
	const STORAGE_KEY_PREFIX = "erpnext_ai_tutor:";
	const MAX_CONVERSATIONS = 20;
	const MAX_MESSAGES_PER_CONVERSATION = 200;
	const AUTO_HELP_COOLDOWN_MS = 45 * 1000;
	const AUTO_HELP_RATE_WINDOW_MS = 60 * 1000;
	const AUTO_HELP_RATE_MAX = 3;
	const AUTO_HELP_FAILURE_COOLDOWN_MS = 2 * 60 * 1000;

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

	function formatTime(ts) {
		try {
			return new Date(ts).toLocaleTimeString();
		} catch {
			return nowTime();
		}
	}

	function makeId(prefix = "chat") {
		const rand = Math.random().toString(16).slice(2, 10);
		return `${prefix}_${Date.now().toString(16)}_${rand}`;
	}

	function clip(text, max = 60) {
		const s = String(text ?? "").replace(/\s+/g, " ").trim();
		if (!s) return "";
		if (s.length <= max) return s;
		return s.slice(0, max - 1) + "…";
	}

	function getPageHeading() {
		const selectors = [
			".page-title .title-text",
			".page-head .title-text",
			".page-title h1",
			".page-head h1",
			".page-head h3",
			".page-title",
		];
		for (const sel of selectors) {
			const el = document.querySelector(sel);
			if (!el) continue;
			const text = (el.textContent || "").replace(/\s+/g, " ").trim();
			if (!text) continue;
			if (text.length > 140) continue;
			return text;
		}
		return "";
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
		const page_heading = getPageHeading();
		const snapshot = {
			route: typeof frappe.get_route === "function" ? frappe.get_route() : [],
			route_str: typeof frappe.get_route_str === "function" ? frappe.get_route_str() : "",
			page_title: document.title || "",
			page_heading: page_heading || "",
			hash: window.location.hash || "",
			pathname: window.location.pathname || "",
			search: window.location.search || "",
			url: window.location.href,
			user: frappe.session && frappe.session.user,
			event: lastEvent || null,
		};
		if (config?.include_form_context) {
			snapshot.form = getFormContext(includeDocValues);
		}
		return sanitize(snapshot);
	}

	function getStorageKey() {
		const user = frappe?.session?.user || "Guest";
		return `${STORAGE_KEY_PREFIX}${window.location.host}:${user}:v${STORAGE_VERSION}`;
	}

	class TutorWidget {
		constructor() {
			this.config = null;
			this.aiReady = false;
			this.isOpen = false;
			this.isBusy = false;
			this.history = [];
			this.conversations = [];
			this.activeConversationId = null;
			this.lastEvent = null;
			this.lastAutoHelpKey = "";
			this.lastAutoHelpAt = 0;
			this.autoHelpDisabledUntil = 0;
			this.autoHelpTimestamps = [];
			this.suppressEventsUntil = 0;
			this.$root = null;
			this.$drawer = null;
			this.$body = null;
			this.$history = null;
			this.$footer = null;
			this.$input = null;
			this.$send = null;
			this.$pill = null;
			this.$historyBtn = null;
			this.$newChatBtn = null;
			this.$typing = null;
			this.activeField = null;
		}

		async init() {
			this.render();
			this.loadChatState();
			await this.loadConfig();
			this.installHooks();
			this.installContextCapture();
			this.ensureConversation();
			this.renderActiveConversation();
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
						<button class="erpnext-ai-tutor-icon-btn erpnext-ai-tutor-history-btn" type="button" aria-label="Chatlar tarixi">
							${frappe?.utils?.icon ? frappe.utils.icon("es-line-time", "sm") : "🕘"}
						</button>
						<button class="erpnext-ai-tutor-icon-btn erpnext-ai-tutor-new-btn" type="button" aria-label="Yangi chat">
							${frappe?.utils?.icon ? frappe.utils.icon("es-line-add", "sm") : "+"}
						</button>
						<button class="erpnext-ai-tutor-close" type="button" aria-label="Yopish">
							${frappe?.utils?.icon ? frappe.utils.icon("close", "sm") : "×"}
						</button>
					</div>
					<div class="erpnext-ai-tutor-body"></div>
					<div class="erpnext-ai-tutor-history erpnext-ai-tutor-hidden"></div>
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
			this.$history = root.querySelector(".erpnext-ai-tutor-history");
			this.$footer = root.querySelector(".erpnext-ai-tutor-footer");
			this.$input = root.querySelector(".erpnext-ai-tutor-input");
			this.$send = root.querySelector(".erpnext-ai-tutor-send");
			this.$pill = root.querySelector(".erpnext-ai-tutor-pill");
			this.$historyBtn = root.querySelector(".erpnext-ai-tutor-history-btn");
			this.$newChatBtn = root.querySelector(".erpnext-ai-tutor-new-btn");

			root.querySelector(".erpnext-ai-tutor-fab").addEventListener("click", () => this.toggle());
			root.querySelector(".erpnext-ai-tutor-close").addEventListener("click", () => this.close());
			this.$historyBtn.addEventListener("click", () => this.toggleHistory());
			this.$newChatBtn.addEventListener("click", () => this.newChat());

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

		loadChatState() {
			try {
				const raw = window.localStorage ? window.localStorage.getItem(getStorageKey()) : null;
				if (!raw) return;
				const parsed = JSON.parse(raw);
				if (!parsed || parsed.version !== STORAGE_VERSION) return;
				if (Array.isArray(parsed.conversations)) this.conversations = parsed.conversations;
				if (typeof parsed.active_conversation_id === "string") {
					this.activeConversationId = parsed.active_conversation_id;
				}
			} catch {
				// ignore
			}
		}

		saveChatState() {
			if (!window.localStorage) return;
			const payload = {
				version: STORAGE_VERSION,
				active_conversation_id: this.activeConversationId,
				conversations: this.conversations,
			};
			try {
				window.localStorage.setItem(getStorageKey(), JSON.stringify(payload));
			} catch {
				// Quota exceeded or storage blocked; try to prune and retry once.
				try {
					this.pruneChatState();
					window.localStorage.setItem(getStorageKey(), JSON.stringify(payload));
				} catch {
					// ignore
				}
			}
		}

		pruneChatState() {
			// Keep only the most recent conversations/messages to avoid storage bloat.
			const convs = Array.isArray(this.conversations) ? this.conversations : [];
			convs.sort((a, b) => (b?.updated_at || 0) - (a?.updated_at || 0));
			const trimmed = convs.slice(0, MAX_CONVERSATIONS);
			for (const c of trimmed) {
				if (Array.isArray(c.messages)) {
					c.messages = c.messages.slice(-MAX_MESSAGES_PER_CONVERSATION);
				} else {
					c.messages = [];
				}
			}
			this.conversations = trimmed;
		}

		getActiveConversation() {
			if (!this.activeConversationId) return null;
			return this.conversations.find((c) => c && c.id === this.activeConversationId) || null;
		}

		ensureConversation() {
			if (!Array.isArray(this.conversations)) this.conversations = [];
			if (this.getActiveConversation()) return;
			if (this.conversations.length) {
				// fall back to most recent
				this.conversations.sort((a, b) => (b?.updated_at || 0) - (a?.updated_at || 0));
				this.activeConversationId = this.conversations[0]?.id || null;
				return;
			}
			this.newChat({ render: false });
		}

		newChat(opts = { render: true }) {
			const id = makeId("tutor");
			const now = Date.now();
			const conversation = {
				id,
				title: "Yangi chat",
				created_at: now,
				updated_at: now,
				messages: [],
			};
			this.conversations.unshift(conversation);
			this.activeConversationId = id;
			this.pruneChatState();
			this.saveChatState();
			if (opts.render) {
				this.hideHistory();
				this.renderActiveConversation();
				this.open();
			}
		}

		setConversationTitleIfNeeded(message) {
			const conv = this.getActiveConversation();
			if (!conv) return;
			if (conv.title && conv.title !== "Yangi chat") return;

			const isAuto = String(message || "").trim().startsWith("ERP tizimida xatolik/ogohlantirish chiqdi.");
			if (isAuto && this.lastEvent) {
				const prefix = this.lastEvent.severity === "error" ? "Xatolik" : "Ogohlantirish";
				const title = clip(this.lastEvent.title || this.lastEvent.message || "", 48);
				conv.title = title ? `${prefix}: ${title}` : `${prefix}`;
			} else {
				conv.title = clip(message, 48) || "Yangi chat";
			}
		}

		renderActiveConversation() {
			const conv = this.getActiveConversation();
			this.history = [];
			this.$body.innerHTML = "";
			if (!conv) return;

			const messages = Array.isArray(conv.messages) ? conv.messages : [];
			for (const m of messages) {
				if (!m || !m.role) continue;
				this.history.push({ role: m.role, content: m.content });
				this.appendToDOM(m.role, m.content, m.ts, { animate: false });
			}
			this.$body.scrollTop = this.$body.scrollHeight;
		}

		appendToDOM(role, content, ts, opts = { animate: true }) {
			const wrap = document.createElement("div");
			wrap.className = `erpnext-ai-tutor-message ${role}`;
			if (opts?.animate) wrap.classList.add("is-new");

			const bubble = document.createElement("div");
			bubble.className = "erpnext-ai-tutor-bubble";

			const text = document.createElement("div");
			text.className = "erpnext-ai-tutor-text";
			text.textContent = String(content ?? "");

			const meta = document.createElement("div");
			meta.className = "erpnext-ai-tutor-meta";
			const metaTime = document.createElement("span");
			metaTime.className = "erpnext-ai-tutor-meta-time";
			metaTime.textContent = ts ? formatTime(ts) : nowTime();

			const metaStatus = document.createElement("span");
			metaStatus.className = "erpnext-ai-tutor-meta-status";

			meta.append(metaTime, metaStatus);

			bubble.append(text, meta);
			wrap.appendChild(bubble);
			this.$body.appendChild(wrap);
			return wrap;
		}

		showTyping() {
			this.hideTyping();
			if (!this.$body) return;

			const wrap = document.createElement("div");
			wrap.className = "erpnext-ai-tutor-message assistant erpnext-ai-tutor-typing";

			const bubble = document.createElement("div");
			bubble.className = "erpnext-ai-tutor-bubble";

			const dots = document.createElement("div");
			dots.className = "erpnext-ai-tutor-typing-dots";

			for (let i = 0; i < 3; i++) {
				const dot = document.createElement("span");
				dot.className = "erpnext-ai-tutor-typing-dot";
				dots.appendChild(dot);
			}

			bubble.appendChild(dots);
			wrap.appendChild(bubble);
			this.$body.appendChild(wrap);
			this.$typing = wrap;
			this.$body.scrollTop = this.$body.scrollHeight;
		}

		hideTyping() {
			if (!this.$typing) return;
			try {
				this.$typing.remove();
			} catch {
				// ignore
			}
			this.$typing = null;
		}

		toggleHistory() {
			if (!this.$history || !this.$body) return;
			const isHidden = this.$history.classList.contains("erpnext-ai-tutor-hidden");
			if (isHidden) this.showHistory();
			else this.hideHistory();
		}

		showHistory() {
			this.renderHistoryList();
			this.$history.classList.remove("erpnext-ai-tutor-hidden");
			this.$body.classList.add("erpnext-ai-tutor-hidden");
			this.$footer.classList.add("erpnext-ai-tutor-hidden");
		}

		hideHistory() {
			this.$history.classList.add("erpnext-ai-tutor-hidden");
			this.$body.classList.remove("erpnext-ai-tutor-hidden");
			this.$footer.classList.remove("erpnext-ai-tutor-hidden");
		}

		renderHistoryList() {
			if (!this.$history) return;
			const convs = Array.isArray(this.conversations) ? [...this.conversations] : [];
			convs.sort((a, b) => (b?.updated_at || 0) - (a?.updated_at || 0));

			if (!convs.length) {
				this.$history.innerHTML = `<div class="erpnext-ai-tutor-history-empty">Hozircha chat yo‘q.</div>`;
				return;
			}

			const rows = convs
				.map((c) => {
					const title = clip(c?.title || "Chat", 60);
					const meta = c?.updated_at ? formatTime(c.updated_at) : "";
					const active = c?.id === this.activeConversationId ? "active" : "";
					return `
						<button class="erpnext-ai-tutor-history-item ${active}" type="button" data-id="${String(c?.id || "")}">
							<div class="erpnext-ai-tutor-history-item-title">${title}</div>
							<div class="erpnext-ai-tutor-history-item-meta">${meta}</div>
						</button>
					`;
				})
				.join("");

			this.$history.innerHTML = `
				<div class="erpnext-ai-tutor-history-title-row">
					<div class="erpnext-ai-tutor-history-title">Chatlar</div>
				</div>
				<div class="erpnext-ai-tutor-history-list">${rows}</div>
			`;

			for (const el of this.$history.querySelectorAll(".erpnext-ai-tutor-history-item")) {
				el.addEventListener("click", () => {
					const id = el.getAttribute("data-id");
					if (!id) return;
					this.activeConversationId = id;
					this.saveChatState();
					this.hideHistory();
					this.renderActiveConversation();
					this.open();
				});
			}
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

		installContextCapture() {
			if (this._contextCaptureInstalled) return;
			this._contextCaptureInstalled = true;

			const handler = (ev) => {
				try {
					this.captureActiveField(ev?.target);
				} catch {
					// ignore
				}
			};

			document.addEventListener("focusin", handler, true);
			document.addEventListener("input", handler, true);
		}

		captureActiveField(target) {
			if (!target || typeof target.closest !== "function") return;
			if (target.closest(".erpnext-ai-tutor-drawer")) return;

			const tag = String(target.tagName || "").toLowerCase();
			const isInputLike =
				tag === "input" ||
				tag === "textarea" ||
				tag === "select" ||
				Boolean(target.isContentEditable);
			if (!isInputLike) return;

			const wrapper = target.closest("[data-fieldname]");
			const fieldname = wrapper?.dataset?.fieldname || target.getAttribute("name") || target.id || "";
			let label = "";

			try {
				const df = window.cur_frm?.fields_dict?.[fieldname]?.df;
				label = df?.label || "";
			} catch {
				// ignore
			}

			if (!label && wrapper) {
				const labelEl = wrapper.querySelector("label");
				label = (labelEl?.textContent || "").trim();
			}

			if (!label) {
				label =
					(target.getAttribute("aria-label") || "").trim() ||
					(target.getAttribute("placeholder") || "").trim() ||
					(label || "");
			}

			let value = "";
			try {
				if (fieldname && window.cur_frm?.doc && Object.prototype.hasOwnProperty.call(window.cur_frm.doc, fieldname)) {
					const v = window.cur_frm.doc[fieldname];
					if (typeof v === "string" || typeof v === "number") value = String(v);
				} else if (typeof target.value === "string") {
					value = target.value;
				}
			} catch {
				// ignore
			}

			const safeFieldname = String(fieldname || "");
			const safeLabel = String(label || "");
			const isSensitive = redactKey(safeFieldname) || redactKey(safeLabel);
			const safeValue = isSensitive ? "[redacted]" : clip(value, 140);

			this.activeField = {
				fieldname: safeFieldname,
				label: safeLabel,
				value: safeValue,
				at: Date.now(),
			};
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

		fingerprintEvent(ev) {
			const severity = String(ev?.severity || "").trim().toLowerCase();
			const title = stripHtml(ev?.title || "").replace(/\s+/g, " ").trim().slice(0, 140);
			const message = stripHtml(ev?.message || "").replace(/\s+/g, " ").trim().slice(0, 260);
			return `${severity}|${title}|${message}`;
		}

		canAutoHelpNow(eventKey) {
			const now = Date.now();
			if (document.visibilityState === "hidden") return false;
			if (this.isBusy) return false;
			if (this.autoHelpDisabledUntil && now < this.autoHelpDisabledUntil) return false;
			if (eventKey && this.lastAutoHelpKey === eventKey && now - this.lastAutoHelpAt < AUTO_HELP_COOLDOWN_MS) {
				return false;
			}

			this.autoHelpTimestamps = (this.autoHelpTimestamps || []).filter((t) => now - t < AUTO_HELP_RATE_WINDOW_MS);
			if (this.autoHelpTimestamps.length >= AUTO_HELP_RATE_MAX) {
				this.autoHelpDisabledUntil = now + AUTO_HELP_FAILURE_COOLDOWN_MS;
				return false;
			}

			this.lastAutoHelpKey = eventKey || "";
			this.lastAutoHelpAt = now;
			this.autoHelpTimestamps.push(now);
			return true;
		}

		async handleEvent(ev) {
			const now = Date.now();
			if ((ev?.source === "msgprint" || ev?.source === "alert") && now < (this.suppressEventsUntil || 0)) {
				return;
			}
			this.lastEvent = { ...ev, at: Date.now() };
			const autoOpen =
				(ev.severity === "error" && this.config?.auto_open_on_error) ||
				(ev.severity === "warning" && this.config?.auto_open_on_warning);
			if (!autoOpen) return;

			this.open();
			this.showPill(ev.severity);

			const key = this.fingerprintEvent(ev);
			if (!this.canAutoHelpNow(key)) return;
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
			this.hideTyping();
		}

		toggle() {
			if (this.isOpen) this.close();
			else this.open();
		}

		append(role, content) {
			this.ensureConversation();
			this.setConversationTitleIfNeeded(role === "user" ? content : "");

			const ts = Date.now();
			this.history.push({ role, content });
			const el = this.appendToDOM(role, content, ts, { animate: true });

			const conv = this.getActiveConversation();
			if (conv) {
				if (!Array.isArray(conv.messages)) conv.messages = [];
				conv.messages.push({ role, content, ts });
				conv.updated_at = ts;
				conv.messages = conv.messages.slice(-MAX_MESSAGES_PER_CONVERSATION);
				this.pruneChatState();
				this.saveChatState();
			}
			this.$body.scrollTop = this.$body.scrollHeight;
			return el;
		}

		setMessageStatus(messageEl, status) {
			if (!messageEl) return;
			messageEl.classList.remove("sending", "sent", "failed");
			if (status) messageEl.classList.add(status);
		}

		setBusy(on) {
			if (!this.$send) return;
			this.isBusy = Boolean(on);
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
			await this.ask(msg, { source: "auto" });
		}

		async sendUserMessage() {
			if (this.isBusy) return;
			const text = String(this.$input.value || "").trim();
			if (!text) return;
			this.$input.value = "";
			await this.ask(text, { source: "user" });
		}

		async ask(text, opts = { source: "user" }) {
			if (this.isBusy) return;
			this.hideHistory();
			const userEl = this.append("user", text);
			this.setBusy(true);
			this.showTyping();
			this.setMessageStatus(userEl, "sending");
			this.suppressEventsUntil = Date.now() + 8000;
			try {
				const ctx = getContextSnapshot(this.config, this.lastEvent);
				if (this.activeField) ctx.active_field = sanitize(this.activeField);
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
				let replyText = "";
				if (typeof r?.message?.reply === "string") replyText = r.message.reply;
				else if (typeof r?.message?.message === "string") replyText = r.message.message;
				else if (typeof r?.message === "string") replyText = r.message;
				replyText = String(replyText ?? "").trim();
				if (!replyText) {
					throw new Error("EMPTY_REPLY");
				}
				this.hideTyping();
				this.setMessageStatus(userEl, "sent");
				this.append("assistant", replyText);
			} catch (e) {
				this.hideTyping();
				this.setMessageStatus(userEl, "failed");
				const isEmptyReply = String(e?.message || "") === "EMPTY_REPLY";
				if (opts?.source === "auto") {
					this.autoHelpDisabledUntil = Date.now() + AUTO_HELP_FAILURE_COOLDOWN_MS;
					return;
				}
				this.append(
					"assistant",
					isEmptyReply
						? "AI javob bermadi. Iltimos qayta urinib ko'ring."
						: "AI bilan bog‘lanishda xatolik. AI Settings (OpenAI/Gemini API key) sozlanganini tekshiring."
				);
			} finally {
				this.hideTyping();
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
