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

			findFieldInput(fieldname, opts = {}) {
				const key = String(fieldname || "").trim();
				if (!key) return null;
				const allowHidden = Boolean(opts?.allowHidden);
				const selectors = [
					`.frappe-control[data-fieldname='${key}'] input:not([type='hidden'])`,
					`.frappe-control[data-fieldname='${key}'] textarea`,
					`.frappe-control[data-fieldname='${key}'] select`,
					`.control-input-wrapper [data-fieldname='${key}'] input:not([type='hidden'])`,
				];
				for (const sel of selectors) {
					const nodes = document.querySelectorAll(sel);
					for (const el of nodes) {
						if (!el) continue;
						if (!allowHidden && !isVisible(el)) continue;
						if (el.disabled || el.readOnly) continue;
						return el;
					}
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
						{
							fieldname: "item_code",
							label: "Item Code",
							value: "DEMO-ITEM-001",
							reason: "har bir mahsulot yagona kod bilan aniqlanishi uchun",
						},
						{
							fieldname: "item_name",
							label: "Item Name",
							value: "Demo Item",
							reason: "foydalanuvchi ro'yxatda nomini aniq ko'rishi uchun",
						},
						{
							fieldname: "item_group",
							label: "Item Group",
							value: "All Item Groups",
							reason: "mahsulotni toifaga biriktirish uchun",
						},
						{
							fieldname: "stock_uom",
							label: "Stock UOM",
							value: "Nos",
							reason: "ombor hisobi o'lchov birligida yurishi uchun",
						},
					];
					if (stage === "fill_more") {
						return [
							{
								fieldname: "description",
								label: "Description",
								value: "AI Tutor orqali yaratilgan demo yozuv.",
								reason: "kartochkada izoh saqlanishi uchun",
							},
						];
					}
					return base;
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
					const label = String(df.label || fieldname).trim();
					plans.push({ fieldname, label, value: sample, reason: "demo ko'rsatish uchun" });
					if (plans.length >= 3) break;
				}
				return stage === "fill_more" ? plans.slice(1) : plans.slice(0, 2);
			}

			async fillFormFields(doctype, stage = "open_and_fill_basic") {
				const plans = this.getFormFieldSamplePlans(doctype, stage);
				let filled = 0;
				const filledLabels = [];
				for (const plan of plans) {
					if (!this.running) break;
					const label = String(plan?.label || plan?.fieldname || "Field").trim();
					const reason = String(plan?.reason || "demo maqsadida").trim();
					const input = this.findFieldInput(plan.fieldname, { allowHidden: true });
					if (!input) {
						this.emitProgress(`⚠️ **${label}** maydoni topilmadi, keyingi qadamga o'tdim.`);
						continue;
					}
					const currentVal = String(input.value || "").trim();
					if (currentVal) {
						this.emitProgress(`ℹ️ **${label}** allaqachon to'ldirilgan, qayta yozmadim.`);
						continue;
					}
					const focused = await this.focusElement(
						input,
						`${label} maydonini to'ldiramiz.`,
						{
						click: true,
						duration_ms: 260,
						pre_click_pause_ms: 110,
						}
					);
					if (!focused) continue;
					const ok = await this.typeIntoInput(input, plan.value);
					if (ok) {
						filled += 1;
						filledLabels.push(label);
						this.emitProgress(`✅ **${label}** maydoni \`${String(plan.value || "").trim()}\` bilan to'ldirildi, sababi: ${reason}.`);
						await this.sleep(120);
					}
				}
				return { filled, filledLabels };
			}

			async runCreateRecordTutorial(guide) {
				if (!this.isCreateTutorial(guide)) return { ok: true, reached_target: true, message: "" };
				const doctype = this.getTutorialDoctype(guide);
				const stage = String(guide?.tutorial?.stage || "open_and_fill_basic").trim().toLowerCase();
				this.emitProgress(`🚀 **${doctype}** bo'yicha amaliy ko'rsatishni boshladim.`);

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
					this.emitProgress("➕ `Add/New` bosildi, endi forma turini tekshiryapman.");
					await this.waitFor(() => this.isOnDoctypeNewForm(doctype) || this.isQuickEntryOpen(), 5200, 120);
				}
				const quickEntryOpen = this.isQuickEntryOpen();
				if (!this.isOnDoctypeNewForm(doctype) && quickEntryOpen) {
					this.emitProgress('🧩 Quick Entry ochildi, to\'liq o\'rgatish uchun **Edit Full Form** ga o\'tamiz.');
					if (stage === "show_save_only") {
						const quickSaveBtn = this.findQuickEntryActionButton("save");
						if (quickSaveBtn) {
							await this.focusElement(quickSaveBtn, 'Quick Entry ichida "Save" tugmasi shu joyda (bosmayman).', {
								click: false,
								duration_ms: 240,
							});
						}
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
							this.emitProgress("📝 `Edit Full Form` bosildi, endi to'liq formani to'ldirishga o'tamiz.");
							await this.waitFor(() => this.isOnDoctypeNewForm(doctype), 5200, 120);
						}
					} else {
						return { ok: false, message: '"Edit Full Form" tugmasini topa olmadim.' };
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
					this.emitProgress('💾 `Save/Submit` joyini ko\'rsatdim, lekin xavfsizlik uchun bosmadim.');
					return {
						ok: true,
						reached_target: true,
						message: 'Save/Submit tugmasini ko\'rsatdim. Xavfsizlik uchun uni avtomatik bosmadim.',
					};
				}

				const fillResult = await this.fillFormFields(doctype, stage === "fill_more" ? "fill_more" : "open_and_fill_basic");
				const filled = Number(fillResult?.filled || 0);
				const filledLabels = Array.isArray(fillResult?.filledLabels) ? fillResult.filledLabels : [];
				const saveBtn = this.findSaveActionButton();
				if (saveBtn) {
					await this.focusElement(saveBtn, 'Saqlash joyini ham ko\'rsatdim (bosmayman).', {
						click: false,
						duration_ms: 220,
					});
				}
				this.emitProgress(
					filled > 0
						? `🎯 To'ldirilgan maydonlar: ${filledLabels.join(", ")}. Endi user shu ma'lumotlarni tekshirib davom etishi mumkin.`
						: "⚠️ To'ldirishga mos maydon topilmadi."
				);
				return {
					ok: true,
					reached_target: true,
					message:
						filled > 0
							? `${filled} ta maydonni demo tarzda to'ldirdim: ${filledLabels.join(", ")}. Keyingi qadamni aytsangiz davom ettiraman.`
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
