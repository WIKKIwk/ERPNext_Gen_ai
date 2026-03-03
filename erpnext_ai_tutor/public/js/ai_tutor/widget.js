/* global frappe */

(function () {
	"use strict";

	const ns = (window.ERPNextAITutor = window.ERPNextAITutor || {});
	// Compatibility shim:
	// Core widget implementation moved to widget_core.js to keep this file small.
	if (!ns.TutorWidget) {
		// eslint-disable-next-line no-console
		console.warn("ERPNext AI Tutor: widget_core.js is missing or loaded after widget.js.");
	}
})();
