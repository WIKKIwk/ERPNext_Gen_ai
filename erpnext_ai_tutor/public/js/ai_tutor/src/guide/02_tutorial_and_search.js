				this.clickPulse();
				await this.sleep(hoverPause);
				const clicked = this.performPreciseClick(resolved.target, resolved.point);
				await this.sleep(220);
				return clicked;
			}
			return true;
		}

		getElementLabel(el) {
			if (!el) return "";
			const raw =
				el.getAttribute?.("data-label") ||
				el.getAttribute?.("aria-label") ||
				el.getAttribute?.("title") ||
				el.textContent ||
				"";
			return String(raw).replace(/\s+/g, " ").trim();
		}

		isDangerActionLabel(label) {
			const text = normalizeText(label);
			if (!text) return false;
			return /\b(save|submit|saqla|saqlash|сохран|провест|отправ)\b/i.test(text);
		}

		isForbiddenActionElement(el) {
			const label = this.getElementLabel(el);
			return this.isDangerActionLabel(label);
		}

		isCreateTutorial(guide) {
			return String(guide?.tutorial?.mode || "").trim().toLowerCase() === "create_record";
		}

		doctypeToRouteSlug(doctype) {
			return String(doctype || "")
				.trim()
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-+|-+$/g, "");
		}

		getTutorialDoctype(guide) {
			return String(guide?.tutorial?.doctype || guide?.target_label || "").trim();
		}

		isOnDoctypeNewForm(doctype) {
			const slug = this.doctypeToRouteSlug(doctype);
			if (!slug) return false;
			const path = this.normalizePath(window.location.pathname || "");
			if (path.startsWith(`/app/${slug}/new-`)) return true;
			try {
				const route = Array.isArray(frappe?.get_route?.()) ? frappe.get_route() : [];
				if (!route.length) return false;
				const head = String(route[0] || "").trim().toLowerCase();
				const second = String(route[1] || "").trim().toLowerCase();
				if (head === "form" && second === String(doctype || "").trim().toLowerCase()) return true;
				if (head === slug && second.startsWith("new-")) return true;
			} catch {
				// ignore
			}
			return false;
		}

		findCreateActionButton() {
			const roots = [
				document.querySelector(".page-head .page-actions"),
				document.querySelector(".layout-main .page-actions"),
				document.querySelector(".page-actions"),
			].filter(Boolean);
			const createRe = /\b(add|new|create|yangi|qo['’]?sh|добав|созд)\b/i;
			let fallbackPrimary = null;
			for (const root of roots) {
				const nodes = root.querySelectorAll("button, a.btn, [role='button']");
				for (const node of nodes) {
					const el = getClickable(node) || node;
					if (!el || !isVisible(el)) continue;
					if (this.isForbiddenActionElement(el)) continue;
					const label = this.getElementLabel(el);
					if (!label) continue;
					if (el.matches?.(".primary-action, .btn-primary") && !fallbackPrimary) {
						fallbackPrimary = el;
					}
					if (createRe.test(label)) return el;
				}
			}
			return fallbackPrimary;
		}

		findSaveActionButton() {
			const roots = [
				document.querySelector(".page-head .page-actions"),
				document.querySelector(".layout-main .page-actions"),
				document.querySelector(".page-actions"),
			].filter(Boolean);
			for (const root of roots) {
				const nodes = root.querySelectorAll("button, a.btn, [role='button']");
				for (const node of nodes) {
					const el = getClickable(node) || node;
					if (!el || !isVisible(el)) continue;
					const label = this.getElementLabel(el);
					if (this.isDangerActionLabel(label)) return el;
				}
			}
			return null;
		}

			findFieldInput(fieldname) {
				const key = String(fieldname || "").trim();
				if (!key) return null;
				const selectors = [
				`.frappe-control[data-fieldname='${key}'] input:not([type='hidden'])`,
				`.frappe-control[data-fieldname='${key}'] textarea`,
				`.frappe-control[data-fieldname='${key}'] select`,
				`.control-input-wrapper [data-fieldname='${key}'] input:not([type='hidden'])`,
			];
			for (const sel of selectors) {
				const el = document.querySelector(sel);
				if (!el || !isVisible(el)) continue;
				if (el.disabled || el.readOnly) continue;
				return el;
				}
				return null;
			}

			getQuickEntryDialog() {
				const selectors = [
					".modal.show .quick-entry-dialog",
					".modal.show .quick-entry-layout",
					".modal.show .modal-content",
					".modal.show",
				];
				for (const sel of selectors) {
					const el = document.querySelector(sel);
					if (el && isVisible(el)) return el;
				}
				return null;
			}

			isQuickEntryOpen() {
				return Boolean(this.getQuickEntryDialog());
			}

			findQuickEntryFieldInput(fieldname) {
				const key = String(fieldname || "").trim();
				if (!key) return null;
				const dialog = this.getQuickEntryDialog();
				if (!dialog) return null;
				const selectors = [
					`.frappe-control[data-fieldname='${key}'] input:not([type='hidden'])`,
					`.frappe-control[data-fieldname='${key}'] textarea`,
					`.frappe-control[data-fieldname='${key}'] select`,
				];
				for (const sel of selectors) {
					const el = dialog.querySelector(sel);
					if (!el || !isVisible(el)) continue;
					if (el.disabled || el.readOnly) continue;
					return el;
				}
				return null;
			}

			findQuickEntryActionButton(kind = "edit_full_form") {
				const dialog = this.getQuickEntryDialog();
				if (!dialog) return null;
				const nodes = dialog.querySelectorAll("button, a.btn, [role='button']");
				const kindNorm = String(kind || "").trim().toLowerCase();
				const editRe = /\b(edit\s*full\s*form|full\s*form|to['’]?liq\s*forma|полная\s*форма)\b/i;
				const saveRe = /\b(save|submit|saqla|saqlash|сохран|провест|отправ)\b/i;
				for (const node of nodes) {
					const el = getClickable(node) || node;
					if (!el || !isVisible(el)) continue;
					const label = this.getElementLabel(el);
					if (!label) continue;
					if (kindNorm === "edit_full_form" && editRe.test(label)) return el;
					if (kindNorm === "save" && saveRe.test(label)) return el;
				}
				return null;
			}

			async fillQuickEntryFields(doctype, stage = "open_and_fill_basic") {
				const plans = this.getFormFieldSamplePlans(doctype, stage);
				let filled = 0;
				for (const plan of plans) {
					if (!this.running) break;
					const input = this.findQuickEntryFieldInput(plan.fieldname);
					if (!input) continue;
					const focused = await this.focusElement(input, String(plan.message || "Quick Entry maydonini to'ldiramiz."), {
						click: true,
						duration_ms: 240,
						pre_click_pause_ms: 100,
					});
					if (!focused) continue;
					const ok = await this.typeIntoInput(input, plan.value);
					if (ok) {
						filled += 1;
						await this.sleep(110);
					}
				}
				return filled;
			}

		async typeIntoInput(input, value) {
			if (!input || value === undefined || value === null) return false;
			const text = String(value);
			try {
				input.focus();
				if (input.tagName === "SELECT") {
					input.value = text;
					input.dispatchEvent(new Event("input", { bubbles: true }));
					input.dispatchEvent(new Event("change", { bubbles: true }));
					return true;
				}
				input.value = "";
				input.dispatchEvent(new Event("input", { bubbles: true }));
				for (const ch of text) {
					if (!this.running) return false;
					input.value += ch;
					input.dispatchEvent(new Event("input", { bubbles: true }));
					await this.sleep(18);
				}
				input.dispatchEvent(new Event("change", { bubbles: true }));
				return true;
			} catch {
				return false;
			}
		}

		getFormFieldSamplePlans(doctype, stage = "open_and_fill_basic") {
			const dt = String(doctype || "").trim();
			const lower = dt.toLowerCase();
			if (lower === "item") {
				const base = [
					{ fieldname: "item_code", value: "DEMO-ITEM-001", message: 'Item Code maydonini to\'ldiramiz.' },
					{ fieldname: "item_name", value: "Demo Item", message: "Item Name maydonini to'ldiramiz." },
					{ fieldname: "description", value: "AI Tutor orqali yaratilgan demo yozuv.", message: "Description maydonini to'ldiramiz." },
				];
				return stage === "fill_more" ? base.slice(2) : base.slice(0, 2);
			}

			const frm = window.cur_frm;
			if (!frm || String(frm.doctype || "").trim().toLowerCase() !== lower) return [];
			const fields = Array.isArray(frm.meta?.fields) ? frm.meta.fields : [];
			const plans = [];
			for (const df of fields) {
				if (!df || !df.fieldname) continue;
				if (df.hidden || df.read_only) continue;
				const ft = String(df.fieldtype || "").trim();
				if (!["Data", "Small Text", "Text", "Int", "Float", "Currency"].includes(ft)) continue;
				const fieldname = String(df.fieldname || "").trim();
				if (!fieldname || fieldname === "naming_series") continue;
				const currentVal = frm.doc ? frm.doc[fieldname] : null;
				if (currentVal !== null && currentVal !== undefined && String(currentVal).trim()) continue;
				let sample = "Demo";
				if (ft === "Int" || ft === "Float" || ft === "Currency") sample = "1";
				else sample = `Demo ${String(df.label || fieldname).trim()}`;
				plans.push({
					fieldname,
					value: sample,
					message: `${String(df.label || fieldname).trim()} maydonini to'ldiramiz.`,
				});
				if (plans.length >= 3) break;
			}
			return stage === "fill_more" ? plans.slice(1) : plans.slice(0, 2);
		}

		async fillFormFields(doctype, stage = "open_and_fill_basic") {
			const plans = this.getFormFieldSamplePlans(doctype, stage);
			let filled = 0;
			for (const plan of plans) {
				if (!this.running) break;
				const input = this.findFieldInput(plan.fieldname);
				if (!input) continue;
				const focused = await this.focusElement(input, String(plan.message || "Maydonni to'ldiramiz."), {
					click: true,
					duration_ms: 260,
					pre_click_pause_ms: 110,
				});
				if (!focused) continue;
				const ok = await this.typeIntoInput(input, plan.value);
				if (ok) {
					filled += 1;
					await this.sleep(120);
				}
			}
			return filled;
		}

			async runCreateRecordTutorial(guide) {
				if (!this.isCreateTutorial(guide)) return { ok: true, reached_target: true, message: "" };
				const doctype = this.getTutorialDoctype(guide);
				const stage = String(guide?.tutorial?.stage || "open_and_fill_basic").trim().toLowerCase();

			if (!this.isOnDoctypeNewForm(doctype)) {
				if (guide.route && !this.isAtRoute(guide.route)) {
					const openedList = await this.navigate(guide.route);
					if (!openedList) {
						return { ok: false, message: "Kerakli bo'limni ochib bo'lmadi, qayta urinib ko'ring." };
					}
				}
				const createBtn = await this.waitFor(() => this.findCreateActionButton(), 3200, 120);
				if (!createBtn) {
					return { ok: false, message: 'Yangi yozuv ochish tugmasini topa olmadim ("Add/New/Create").' };
				}
				const clicked = await this.focusElement(createBtn, 'Yangi yozuv ochish uchun "Add/New" tugmasini bosamiz.', {
					click: true,
					duration_ms: 320,
					pre_click_pause_ms: 120,
				});
					if (!clicked) {
						return { ok: false, message: "Yangi yozuv tugmasini xavfsiz bosib bo'lmadi." };
					}
					await this.waitFor(() => this.isOnDoctypeNewForm(doctype) || this.isQuickEntryOpen(), 5200, 120);
				}
				const quickEntryOpen = this.isQuickEntryOpen();
				if (!this.isOnDoctypeNewForm(doctype) && quickEntryOpen) {
					if (stage === "show_save_only") {
						const quickSaveBtn = this.findQuickEntryActionButton("save");
						if (quickSaveBtn) {
							await this.focusElement(quickSaveBtn, 'Quick Entry ichida "Save" tugmasi shu joyda (bosmayman).', {
								click: false,
								duration_ms: 240,
							});
						}
					} else {
						await this.fillQuickEntryFields(doctype, stage === "fill_more" ? "fill_more" : "open_and_fill_basic");
					}

					const fullFormBtn = this.findQuickEntryActionButton("edit_full_form");
					if (fullFormBtn) {
						const openedFullForm = await this.focusElement(
							fullFormBtn,
							'"Edit Full Form" ni bosib to\'liq formaga o\'tamiz.',
							{
								click: true,
								duration_ms: 300,
								pre_click_pause_ms: 120,
							}
						);
						if (openedFullForm) {
							await this.waitFor(() => this.isOnDoctypeNewForm(doctype), 5200, 120);
						}
					}
				}

				if (!this.isOnDoctypeNewForm(doctype) && !this.isQuickEntryOpen()) {
					return { ok: false, message: "Yangi forma ochilmadi. Iltimos yana bir bor urining." };
				}

				if (!this.isOnDoctypeNewForm(doctype) && this.isQuickEntryOpen()) {
					return {
						ok: true,
						reached_target: true,
						message: "Quick Entry oynasi ochildi. Asosiy maydonlarni to'ldirib ko'rsatdim. Davom ettirish uchun 'Edit Full Form' ni bosing.",
					};
				}

			if (stage === "show_save_only") {
				const saveBtn = await this.waitFor(() => this.findSaveActionButton(), 2000, 120);
				if (saveBtn) {
					await this.focusElement(saveBtn, 'Mana shu joyda "Save/Submit" tugmasi turadi (bosmayman).', {
						click: false,
						duration_ms: 280,
					});
				}
				return {
					ok: true,
					reached_target: true,
					message: 'Save/Submit tugmasini ko\'rsatdim. Xavfsizlik uchun uni avtomatik bosmadim.',
				};
			}

			const filled = await this.fillFormFields(doctype, stage === "fill_more" ? "fill_more" : "open_and_fill_basic");
			const saveBtn = this.findSaveActionButton();
			if (saveBtn) {
				await this.focusElement(saveBtn, 'Saqlash joyini ham ko\'rsatdim (bosmayman).', {
					click: false,
					duration_ms: 220,
				});
			}
			return {
				ok: true,
				reached_target: true,
				message:
					filled > 0
						? `${filled} ta maydonni demo tarzda to'ldirib ko'rsatdim. Keyingi qadamni ham aytsangiz davom ettiraman.`
						: "Forma ochildi, lekin avtomatik to'ldirishga mos maydon topilmadi. Qaysi maydonni to'ldiray?",
			};
		}

		getSearchQuery(guide, step) {
			const stepLabel = String(step?.label || "").trim();
			const targetLabel = String(guide?.target_label || "").trim();
			const stepScope = String(step?.scope || "").trim().toLowerCase();
			const stepNorm = normalizeText(stepLabel);
			const targetNorm = normalizeText(targetLabel);

			// If the current step is a parent/module hop (e.g. Core -> User),
			// search directly by final target to avoid wrong "Core" lookups.
			if (targetLabel && stepScope === "sidebar" && stepLabel && stepNorm && targetNorm && stepNorm !== targetNorm) {
				return targetLabel;
			}
			if (targetLabel) return targetLabel;

			const parts = this.routeToParts(guide?.route || "");
			if (!parts.length) return "";
			const routeLeaf = parts[parts.length - 1].replace(/-/g, " ").trim();
			if (routeLeaf) return routeLeaf;
			return stepLabel;
		}

		findSearchResult(query, route) {
			const target = normalizeText(query);
			const targetPath = this.normalizePath(this.routeToPath(route));
			const selectors = [
				".awesomplete ul li",
				".search-bar .awesomplete ul li",
				".search-dialog li",
				".awesomplete li",
			];
			let best = null;
			let bestScore = 0;
			for (const sel of selectors) {
				const nodes = document.querySelectorAll(sel);
				for (const node of nodes) {
					if (!isVisible(node)) continue;
					const el = getClickable(node) || node;
					const text = normalizeText(node.textContent || el.textContent || "");
					if (!text) continue;
					const candidatePath = this.getCandidatePath(el, node);
					let score = 0;

					if (targetPath) {
						if (candidatePath === targetPath) {
							score = 160;
						} else if (candidatePath) {
							continue;
						} else if (target && text === target) {
							// Some Awesomebar rows have no href/route in DOM.
							// In that case, only exact text is accepted.
							score = 154;
						} else {
							continue;
						}
					}
					if (target && text === target) score = Math.max(score, 180);
					else if (target && text.includes(target)) score = Math.max(score, 168);
					if (score > bestScore) {
						best = el;
						bestScore = score;
					}
				}
			}
			return bestScore >= 150 ? best : null;
		}

		submitSearchByEnter(input) {
			if (!input) return false;
			try {
				input.focus();
				const eventInit = {
					bubbles: true,
					cancelable: true,
					key: "Enter",
					code: "Enter",
					which: 13,
					keyCode: 13,
				};
				input.dispatchEvent(new KeyboardEvent("keydown", eventInit));
				input.dispatchEvent(new KeyboardEvent("keypress", eventInit));
				input.dispatchEvent(new KeyboardEvent("keyup", eventInit));
				return true;
			} catch {
				return false;
			}
		}

		async trySearchFallback(step, guide) {
			if (!this.running || !guide?.route) return false;
			const query = this.getSearchQuery(guide, step);
			const input = this.findSearchInput();
			if (!input || !query) return false;
			const openMessage =
				String(step?.message || "").trim() || "Qidiruv orqali topamiz.";

			await this.focusElement(input, openMessage, {
				click: true,
				duration_ms: 320,
			});
			if (!this.running) return false;

			try {
				input.focus();
				if (typeof input.select === "function") input.select();
				input.value = "";
				input.dispatchEvent(new Event("input", { bubbles: true }));
				input.value = query;
				input.dispatchEvent(new Event("input", { bubbles: true }));
				input.dispatchEvent(new Event("change", { bubbles: true }));
			} catch {
				return false;
			}

			await this.sleep(540);
			if (this.isAtRoute(guide.route)) return true;

			const result = this.findSearchResult(query, guide.route);
			if (result) {
				await this.focusElement(result, "Qidiruv natijasini bosamiz.", {
					click: true,
					duration_ms: 320,
					pre_click_pause_ms: 125,
				});
				await this.waitFor(() => this.isAtRoute(guide.route), 3200, 110);
