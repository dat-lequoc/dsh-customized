window.__ModuleLoader__.load({
	id: "dsh-better-retry",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react = require("react");
		react = __toESM(react, 1);
		//#region src/components.js
		const h = react.default.createElement;
		const box = {
			border: "1px solid var(--dsw-alias-outline-primary, currentColor)",
			borderRadius: 8,
			padding: 12,
			marginTop: 10,
			minWidth: 0
		};
		const row = {
			display: "flex",
			flexWrap: "wrap",
			gap: 8,
			alignItems: "center"
		};
		const field = {
			display: "block",
			width: "100%",
			boxSizing: "border-box",
			padding: 6,
			color: "inherit",
			background: "transparent"
		};
		const codeStyle = {
			whiteSpace: "pre-wrap",
			overflowWrap: "anywhere",
			display: "block",
			margin: "6px 0"
		};
		const button = (label, onClick, disabled = false) => h("button", {
			type: "button",
			onClick,
			disabled,
			style: {
				cursor: disabled ? "default" : "pointer",
				padding: "4px 8px"
			}
		}, label);
		const detail = (label, content) => h("div", null, h("strong", null, label), h("code", { style: codeStyle }, content));
		const errorText = (error) => error instanceof Error ? error.message : String(error);
		/** Private interaction state; all decisions and persistence are made on Host. */
		function PatternEditor({ t, call, seed, onSaved, onClose }) {
			const [message, setMessage] = react.default.useState(seed?.message ?? "");
			const [code, setCode] = react.default.useState(seed?.code ?? "PI_AI_ERROR");
			const [provider, setProvider] = react.default.useState("*");
			const [pattern, setPattern] = react.default.useState("");
			const [mode, setMode] = react.default.useState("exact");
			const [preview, setPreview] = react.default.useState(null);
			const [busy, setBusy] = react.default.useState(false);
			const [error, setError] = react.default.useState("");
			const request = (nextPattern = pattern, nextMode = mode) => ({
				message,
				code,
				provider,
				mode: nextMode,
				...nextPattern ? { pattern: nextPattern } : {}
			});
			const runPreview = async (nextPattern = pattern, nextMode = mode) => {
				setBusy(true);
				setError("");
				setPreview(null);
				try {
					const result = await call("preview", request(nextPattern, nextMode));
					setPattern(result.pattern);
					setPreview(result);
				} catch (error) {
					setError(errorText(error));
				} finally {
					setBusy(false);
				}
			};
			const edit = (setter) => (event) => {
				setter(event.target.value);
				setPreview(null);
			};
			const save = async () => {
				setBusy(true);
				setError("");
				try {
					await onSaved(await call("add", request()));
				} catch (error) {
					setError(errorText(error));
				} finally {
					setBusy(false);
				}
			};
			return h("section", {
				style: box,
				"aria-label": t("preview")
			}, h("label", null, t("message"), h("textarea", {
				value: message,
				rows: 3,
				maxLength: 4096,
				style: field,
				onChange: (event) => {
					setMessage(event.target.value);
					setPattern("");
					setPreview(null);
				}
			})), h("label", null, t("code"), h("input", {
				value: code,
				style: field,
				onChange: edit(setCode)
			})), h("label", null, t("provider"), h("input", {
				value: provider,
				style: field,
				onChange: edit(setProvider)
			})), h("label", null, t("mode"), h("select", {
				value: mode,
				style: field,
				onChange: edit(setMode)
			}, h("option", { value: "exact" }, t("exact")), h("option", { value: "contains" }, t("contains")))), h("label", null, t("pattern"), h("textarea", {
				value: pattern,
				rows: 2,
				maxLength: 4096,
				style: field,
				onChange: edit(setPattern)
			})), h("div", { style: row }, button(busy ? t("loading") : t("preview"), () => runPreview(), busy || !message.trim()), button(t("cancel"), onClose, busy)), error && h("p", { role: "alert" }, error), preview && h("div", { "aria-live": "polite" }, detail(t("normalized"), preview.normalized), h("p", null, preview.reason ? t(preview.reason) : t(preview.valid ? "valid" : "invalid")), h("p", null, preview.existing ? `${t("matched")}: ${preview.existing.pattern}` : t("noMatch")), preview.suggestion && h("div", null, detail(t("suggestion"), preview.suggestion), button(t("useSuggestion"), () => {
				setMode("contains");
				setPattern(preview.suggestion);
				runPreview(preview.suggestion, "contains");
			}, busy)), h("p", null, t("samples")), preview.matches.length ? h("ul", null, ...preview.matches.map((item, index) => h("li", { key: index }, h("code", { style: codeStyle }, item.message)))) : h("p", null, t("noSamples")), h("p", null, t("future")), button(t("save"), save, busy || !preview.valid)));
		}
		function RuleList({ t, rules, busy, mutate }) {
			return h("div", null, ...rules.map((rule) => h("article", {
				key: rule.id,
				style: box
			}, h("div", { style: row }, h("strong", null, t(rule.builtin ? "builtin" : "custom")), h("span", null, t(rule.enabled ? "enabled" : "disabled"))), h("code", { style: codeStyle }, rule.pattern), h("p", null, `${t(rule.mode)} · ${rule.code} · ${rule.provider}`), h("div", { style: row }, button(t(rule.enabled ? "disable" : "enable"), () => mutate("toggle", {
				id: rule.id,
				enabled: !rule.enabled
			}), busy), !rule.builtin && button(t("delete"), () => mutate("delete", { id: rule.id }), busy)))));
		}
		function RuleManager({ t, call }) {
			const [data, setData] = react.default.useState(null);
			const [busy, setBusy] = react.default.useState(false);
			const [error, setError] = react.default.useState("");
			const [notice, setNotice] = react.default.useState("");
			const [adding, setAdding] = react.default.useState(false);
			const [message, setMessage] = react.default.useState("");
			const [provider, setProvider] = react.default.useState("*");
			const [testResult, setTestResult] = react.default.useState(null);
			const mutate = async (endpoint, payload = {}) => {
				setBusy(true);
				setError("");
				setTestResult(null);
				try {
					const result = await call(endpoint, payload);
					setData(result);
					setNotice(endpoint === "list" ? "" : t("updated"));
				} catch (error) {
					setError(errorText(error));
				} finally {
					setBusy(false);
				}
			};
			react.default.useEffect(() => {
				let active = true;
				call("list").then((result) => {
					if (active) setData(result);
				}, (error) => {
					if (active) setError(errorText(error));
				});
				return () => {
					active = false;
				};
			}, [call]);
			const test = async () => {
				setBusy(true);
				setError("");
				try {
					setTestResult(await call("test", {
						message,
						code: "PI_AI_ERROR",
						provider
					}));
				} catch (error) {
					setError(errorText(error));
				} finally {
					setBusy(false);
				}
			};
			return h("section", {
				style: {
					minWidth: 0,
					padding: 8
				},
				"aria-label": t("section")
			}, h("h2", null, t("section")), h("p", null, t("description")), h("p", null, t("sampleNote")), h("div", { style: row }, button(t("refresh"), () => mutate("list"), busy), button(t("manual"), () => setAdding(true), busy)), error && h("p", { role: "alert" }, `${t("error")}: ${error}`), notice && h("p", { role: "status" }, notice), adding && h(PatternEditor, {
				t,
				call,
				onClose: () => setAdding(false),
				onSaved: (result) => {
					setData(result);
					setAdding(false);
					setNotice(t("saved"));
					setTestResult(null);
				}
			}), data ? h(RuleList, {
				t,
				rules: data.rules,
				busy,
				mutate
			}) : !error && h("p", null, t("loading")), h("section", { style: box }, h("h3", null, t("testTitle")), h("label", null, t("message"), h("textarea", {
				value: message,
				rows: 3,
				style: field,
				maxLength: 4096,
				onChange: (event) => {
					setMessage(event.target.value);
					setTestResult(null);
				}
			})), h("label", null, t("provider"), h("input", {
				value: provider,
				style: field,
				onChange: (event) => {
					setProvider(event.target.value);
					setTestResult(null);
				}
			})), button(t("test"), test, busy || !message.trim()), testResult && h("div", { role: "status" }, detail(t("normalized"), testResult.normalized), h("p", null, testResult.reason ? t(testResult.reason) : testResult.existing ? `${t("matched")}: ${testResult.existing.pattern}` : t("noMatch")))));
		}
		function BetterTurnError({ node, t, call }) {
			const [editing, setEditing] = react.default.useState(false);
			const [managing, setManaging] = react.default.useState(false);
			const [saved, setSaved] = react.default.useState(false);
			const data = node.data;
			return h("div", { style: {
				overflowWrap: "anywhere",
				margin: "8px 0"
			} }, h("div", { style: row }, h("strong", { style: { color: "var(--dsw-alias-state-error-primary)" } }, t("title")), h("span", null, data.message), h("code", null, data.code), button(t("add"), () => {
				setEditing(true);
				setSaved(false);
			}), button(t("manage"), () => setManaging((value) => !value))), saved && h("p", { role: "status" }, t("saved")), editing && h(PatternEditor, {
				t,
				call,
				seed: data,
				onClose: () => setEditing(false),
				onSaved: () => {
					setEditing(false);
					setSaved(true);
				}
			}), managing && h(RuleManager, {
				t,
				call
			}));
		}
		//#endregion
		//#region src/locale.js
		const NS = "dsh-better-retry";
		const dictionaries = {
			zh: {
				title: "本轮运行失败",
				add: "纳入自动重试",
				manage: "管理消息模式",
				section: "自动重试",
				description: "每条消息模式独立生效。仅将匹配的 PI_AI_ERROR 交给 DSH 重试；实际次数和等待时间由模型服务的重试策略决定。",
				future: "保存后影响后续请求，不会自动恢复已经结束的回合。",
				loading: "正在读取…",
				error: "操作失败",
				refresh: "刷新列表",
				enabled: "已启用",
				disabled: "已停用",
				enable: "启用",
				disable: "停用",
				delete: "删除",
				builtin: "内置",
				custom: "自定义",
				pattern: "消息模式",
				provider: "服务商 ID（* 表示所有服务商）",
				code: "错误码",
				exact: "规范化后完整匹配",
				contains: "包含连续片段",
				mode: "匹配方式",
				message: "错误消息样本",
				preview: "预览匹配",
				save: "确认纳入自动重试",
				cancel: "关闭预览",
				normalized: "规范化消息",
				suggestion: "相似样本的连续公共片段",
				useSuggestion: "采用此片段并重新预览",
				valid: "该模式能匹配当前错误",
				invalid: "模式不能匹配当前错误，或片段过于宽泛",
				matched: "当前命中模式",
				noMatch: "当前没有启用的模式匹配这条消息",
				saved: "已保存，Host 已确认该错误能命中规则",
				updated: "规则已更新",
				samples: "本进程近期错误与已保存样本中的匹配项",
				noSamples: "没有额外样本；以当前错误验证匹配。",
				sampleNote: "只参考本进程最近 100 种错误和已保存样本；不会自动扫描全部会话，也不会自动扩大已有规则。",
				manual: "添加消息模式",
				testTitle: "测试消息是否命中",
				test: "测试",
				"already-native": "该错误已是 RATE_LIMIT，由 DSH 原有重试策略处理，无需重复纳入。",
				"unsupported-code": "当前插件仅重新分类 PI_AI_ERROR；其他错误码遵循 DSH 原有策略。",
				"non-transient": "该消息包含身份验证、余额、无效请求或取消错误，不作为临时错误纳入。",
				hostUnavailable: "无法访问重试管理接口，请确认 Host 已加载新版插件后刷新页面。"
			},
			en: {
				title: "This turn failed",
				add: "Enable automatic retry",
				manage: "Manage message patterns",
				section: "Automatic retry",
				description: "Each pattern works independently. Matching PI_AI_ERROR failures use DSH retry; the provider policy owns retry limits and delays.",
				future: "Saved rules affect future requests; closed turns are not restarted.",
				loading: "Loading…",
				error: "Operation failed",
				refresh: "Refresh list",
				enabled: "Enabled",
				disabled: "Disabled",
				enable: "Enable",
				disable: "Disable",
				delete: "Delete",
				builtin: "Built-in",
				custom: "Custom",
				pattern: "Message pattern",
				provider: "Provider ID (* for all providers)",
				code: "Error code",
				exact: "Normalized full match",
				contains: "Contains contiguous phrase",
				mode: "Match mode",
				message: "Error message sample",
				preview: "Preview match",
				save: "Confirm automatic retry",
				cancel: "Close preview",
				normalized: "Normalized message",
				suggestion: "Contiguous phrase from similar samples",
				useSuggestion: "Use phrase and preview again",
				valid: "This pattern matches the selected error",
				invalid: "Pattern does not match this error or is too broad",
				matched: "Currently matching pattern",
				noMatch: "No enabled pattern currently matches this message",
				saved: "Saved; Host confirmed this error matches a rule",
				updated: "Rules updated",
				samples: "Matches among recent process errors and saved samples",
				noSamples: "No additional samples; match verified against this error.",
				sampleNote: "Uses the last 100 distinct errors in this process and saved samples. Does not scan all sessions or broaden saved rules automatically.",
				manual: "Add a message pattern",
				testTitle: "Test a message",
				test: "Test",
				"already-native": "RATE_LIMIT already uses the native DSH retry policy; no additional rule is needed.",
				"unsupported-code": "This plugin reclassifies PI_AI_ERROR only; other codes follow native DSH policy.",
				"non-transient": "Authentication, balance, invalid request or cancellation errors are not eligible.",
				hostUnavailable: "Retry management is unavailable. Load the updated Host plugin and refresh this page."
			}
		};
		//#endregion
		//#region src/client.js
		const inject = [
			"slots",
			"locale",
			"connection"
		];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, dictionaries), "dsh-better-retry: locale");
			const call = async (endpoint, payload = {}) => {
				const result = await ctx.connection.rpc.call("/dsh-better-retry", endpoint, payload);
				if (!result.ok) throw new Error(result.error.message);
				return result.value;
			};
			ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
				name: "conversation.chat.node",
				key: "turn-error",
				priority: -1,
				locale: NS,
				inject: () => ({ call })
			}, BetterTurnError));
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: NS,
				order: 35,
				locale: NS,
				label: () => ctx.locale.bind(NS)("section"),
				inject: () => ({ call })
			}, RuleManager));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map