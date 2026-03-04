/* global frappe */

(function () {
	"use strict";

	const ns = (window.ERPNextAITutor = window.ERPNextAITutor || {});
	const isDesk = ns?.utils?.isDesk;
	if (typeof isDesk !== "function") return;

	const RUNTIME_SOURCES = {
		css: "/assets/erpnext_ai_tutor/css/ai_tutor_widget.css",
		guide: "/assets/erpnext_ai_tutor/js/ai_tutor/guide.js",
		core: "/assets/erpnext_ai_tutor/js/ai_tutor/widget_core.js",
	};

	function addRuntimeCss(token) {
		try {
			const href = `${RUNTIME_SOURCES.css}?rt=${encodeURIComponent(token)}`;
			const link = document.createElement("link");
			link.rel = "stylesheet";
			link.href = href;
			link.dataset.aiTutorRuntimeCss = "1";
			document.head.appendChild(link);
		} catch {
			// ignore
		}
	}

	function loadRuntimeScript(src, token) {
		return new Promise((resolve, reject) => {
			const script = document.createElement("script");
			script.src = `${src}?rt=${encodeURIComponent(token)}`;
			script.async = false;
			script.dataset.aiTutorRuntimeScript = "1";
			script.onload = () => resolve(true);
			script.onerror = () => reject(new Error(`Failed to load ${src}`));
			document.head.appendChild(script);
		});
	}

	async function ensureFreshRuntimeAssets() {
		if (window.__erpnext_ai_tutor_runtime_assets_ready) return true;
		if (window.__erpnext_ai_tutor_runtime_assets_promise) {
			return window.__erpnext_ai_tutor_runtime_assets_promise;
		}

		const token = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
		window.__erpnext_ai_tutor_runtime_assets_promise = (async () => {
			addRuntimeCss(token);
			await loadRuntimeScript(RUNTIME_SOURCES.guide, token);
			await loadRuntimeScript(RUNTIME_SOURCES.core, token);
			window.__erpnext_ai_tutor_runtime_assets_ready = true;
			return true;
		})()
			.catch((err) => {
				// eslint-disable-next-line no-console
				console.warn("ERPNext AI Tutor runtime asset refresh failed:", err);
				return false;
			})
			.finally(() => {
				window.__erpnext_ai_tutor_runtime_assets_promise = null;
			});

		return window.__erpnext_ai_tutor_runtime_assets_promise;
	}

	async function boot() {
		if (!isDesk()) return;
		if (window.__erpnext_ai_tutor_widget) return;
		await ensureFreshRuntimeAssets();
		const TutorWidget = ns?.TutorWidget;
		if (typeof TutorWidget !== "function") return;
		window.__erpnext_ai_tutor_widget = new TutorWidget();
		window.__erpnext_ai_tutor_widget.init();
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", boot);
	} else {
		boot();
	}
})();
