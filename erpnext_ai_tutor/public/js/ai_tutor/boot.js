/* global frappe */

(function () {
	"use strict";

	const ns = (window.ERPNextAITutor = window.ERPNextAITutor || {});
	const isDesk = ns?.utils?.isDesk;
	const TutorWidget = ns?.TutorWidget;
	if (typeof isDesk !== "function" || typeof TutorWidget !== "function") return;

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
