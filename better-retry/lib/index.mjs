import z from "@deepseek-ai/schemastery";
import { randomUUID } from "node:crypto";
const BUILTINS = ["too many pending requests, please retry later", "our servers are currently overloaded. please try again later"].map((pattern, index) => ({
	id: index === 0 ? "builtin-pending" : "builtin-overloaded",
	pattern,
	mode: "contains",
	provider: "*",
	code: "PI_AI_ERROR",
	enabled: true,
	sample: pattern,
	builtin: true
}));
/** Keep diagnostic words in order; remove only known request-specific fields. */
function normalizeMessage(message) {
	return String(message ?? "").trim().replace(/^(?:unknown|server_error):\s*/i, "").replace(/\b(?:trace|correlation|request)[-_ ]?id\s*[:=]\s*[^\s,)]+/gi, "").replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "").replace(/\(\s*\)/g, "").replace(/\s+/g, " ").replace(/[.。]+$/, "").trim().toLowerCase();
}
/** Longest contiguous word sequence, never an unordered bag of common words. */
function commonStableFragment(messages) {
	const values = messages.map(normalizeMessage).filter(Boolean);
	if (!values.length) return "";
	const words = values[0].split(" ").slice(0, 128);
	for (let length = words.length; length > 0; length--) for (let start = 0; start + length <= words.length; start++) {
		const candidate = words.slice(start, start + length).join(" ");
		if (values.every((value) => value.includes(candidate))) return candidate;
	}
	return "";
}
function usefulFragment(pattern) {
	const value = normalizeMessage(pattern);
	return value.length >= 24 && value.split(" ").length >= 3 && !/^(?:please )?(?:try again|retry)(?: later)?$/.test(value);
}
/** Legacy strings become independent exact normalized patterns, even if short. */
function customPatterns(settings) {
	const patterns = (settings.patterns ?? []).map((rule) => ({
		...rule,
		builtin: false
	}));
	for (const [index, message] of (settings.rules ?? []).entries()) {
		const pattern = normalizeMessage(message);
		if (pattern && !patterns.some((rule) => rule.pattern === pattern && rule.provider === "*")) patterns.push({
			id: `legacy-${index}`,
			pattern,
			mode: "exact",
			provider: "*",
			code: "PI_AI_ERROR",
			enabled: true,
			sample: pattern,
			builtin: false
		});
	}
	return patterns;
}
function effectivePatterns(settings) {
	return [...BUILTINS.map((rule) => ({
		...rule,
		enabled: !(settings.disabledBuiltins ?? []).includes(rule.id)
	})), ...customPatterns(settings)];
}
function ineligibleReason(message, code) {
	if (code !== "PI_AI_ERROR") return code === "RATE_LIMIT" ? "already-native" : "unsupported-code";
	if (/\b(?:unauthorized|forbidden|invalid api key|authentication failed|insufficient (?:quota|balance|credits)|quota exceeded|invalid request|cancelled|canceled)\b/i.test(message)) return "non-transient";
	return null;
}
function matchesPattern(message, code, provider, rule) {
	if (!rule.enabled || rule.code !== code || rule.provider !== "*" && rule.provider !== provider) return false;
	const value = normalizeMessage(message);
	const pattern = normalizeMessage(rule.pattern);
	if (!pattern || ineligibleReason(message, code)) return false;
	return rule.mode === "exact" ? value === pattern : usefulFragment(pattern) && value.includes(pattern);
}
function matchingPattern(settings, message, code, provider = "") {
	return effectivePatterns(settings).find((rule) => matchesPattern(message, code, provider, rule)) ?? null;
}
//#endregion
//#region src/runtime.js
const CHANNEL = "/dsh-better-retry";
function text(value, label, max = 4096) {
	if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${label}: expected 1–${max} characters`);
	return value.trim();
}
function inputSample(input) {
	return {
		message: text(input.message, "message"),
		code: text(input.code, "code", 100),
		provider: typeof input.provider === "string" && input.provider.trim() ? text(input.provider, "provider", 200) : "*"
	};
}
/** One runtime owns the saved rules, bounded observed samples and serialized writes. */
function createRuntime(scope) {
	const recent = [];
	let pending = Promise.resolve();
	const settings = () => scope.get();
	const list = () => ({
		rules: effectivePatterns(settings()),
		recent: [...recent]
	});
	const observe = (failure, provider) => {
		if (typeof failure?.message !== "string" || failure.message.length > 4096) return;
		const message = normalizeMessage(failure.message);
		const code = String(failure.code ?? "");
		if (recent.some((item) => item.message === message && item.provider === provider && item.code === code)) return;
		recent.unshift({
			message,
			code,
			provider
		});
		recent.splice(100);
	};
	const preview = (input) => {
		const sample = inputSample(input);
		const normalized = normalizeMessage(sample.message);
		const reason = ineligibleReason(sample.message, sample.code);
		const existing = matchingPattern(settings(), sample.message, sample.code, sample.provider);
		const patterns = effectivePatterns(settings());
		const pool = [...recent, ...patterns.map((rule) => ({
			message: rule.sample,
			code: rule.code,
			provider: rule.provider
		}))].filter((item) => item.code === sample.code && item.provider === sample.provider);
		const candidates = [...new Set(pool.map((item) => commonStableFragment([normalized, item.message])))].filter((value) => usefulFragment(value) && value !== normalized && value.length >= normalized.length * .6).sort((a, b) => b.length - a.length);
		const pattern = input.pattern === void 0 ? normalized : normalizeMessage(text(input.pattern, "pattern"));
		const mode = input.mode ?? "exact";
		if (!["exact", "contains"].includes(mode)) throw new Error("Unknown matching mode");
		const rule = {
			id: "",
			pattern,
			mode,
			code: sample.code,
			provider: sample.provider,
			enabled: true,
			sample: normalized
		};
		const valid = !reason && !!pattern && (mode === "exact" || usefulFragment(pattern)) && matchesPattern(sample.message, sample.code, sample.provider, rule);
		return {
			...sample,
			normalized,
			pattern,
			mode,
			reason,
			valid,
			existing,
			suggestion: candidates[0] ?? null,
			matches: pool.filter((item) => matchesPattern(item.message, item.code, item.provider, rule)).slice(0, 10)
		};
	};
	const save = async (patterns, disabledBuiltins) => {
		await scope.update({
			rules: [],
			patterns: patterns.map(({ builtin, ...rule }) => rule),
			disabledBuiltins
		});
		return list();
	};
	const mutate = async (endpoint, input) => {
		const current = settings();
		let patterns = customPatterns(current);
		let disabled = [...current.disabledBuiltins ?? []];
		if (endpoint === "add") {
			const proposal = preview(input);
			if (!proposal.valid) throw new Error(proposal.reason ?? "Pattern must match the selected message; use a specific contiguous phrase");
			let rule = patterns.find((rule) => rule.pattern === proposal.pattern && rule.mode === proposal.mode && rule.provider === proposal.provider && rule.code === proposal.code);
			if (rule) rule.enabled = true;
			else {
				rule = {
					id: randomUUID(),
					pattern: proposal.pattern,
					mode: proposal.mode,
					code: proposal.code,
					provider: proposal.provider,
					sample: proposal.normalized,
					enabled: true
				};
				patterns.push(rule);
			}
			await save(patterns, disabled);
			const match = matchingPattern(settings(), proposal.message, proposal.code, proposal.provider);
			if (!match) throw new Error("Saved rule is not effective; check the settings provider");
			return {
				...list(),
				matched: match
			};
		}
		const id = text(input.id, "id", 200);
		if (endpoint === "toggle" && typeof input.enabled !== "boolean") throw new Error("enabled must be boolean");
		if (BUILTINS.some((rule) => rule.id === id)) {
			if (endpoint === "delete") throw new Error("Built-in rules can be disabled, not deleted");
			disabled = disabled.filter((value) => value !== id);
			if (!input.enabled) disabled.push(id);
		} else {
			const rule = patterns.find((rule) => rule.id === id);
			if (!rule) throw new Error("Rule no longer exists; refresh the list");
			if (endpoint === "delete") patterns = patterns.filter((rule) => rule.id !== id);
			else rule.enabled = input.enabled;
		}
		return save(patterns, disabled);
	};
	return {
		observe,
		match: (failure, provider) => matchingPattern(settings(), failure.message, failure.code, provider),
		async handle(endpoint, input = {}) {
			try {
				if (endpoint === "list") return {
					ok: true,
					value: list()
				};
				if (endpoint === "preview" || endpoint === "test") return {
					ok: true,
					value: preview(input)
				};
				if (![
					"add",
					"toggle",
					"delete"
				].includes(endpoint)) throw new Error("Unknown retry endpoint");
				const work = pending.then(() => mutate(endpoint, input));
				pending = work.catch(() => void 0);
				return {
					ok: true,
					value: await work
				};
			} catch (error) {
				return {
					ok: false,
					error: {
						code: "better-retry/invalid",
						message: error instanceof Error ? error.message : String(error),
						details: {}
					}
				};
			}
		}
	};
}
//#endregion
//#region src/index.js
const name = "dsh-better-retry";
const inject = [
	"llm",
	"settings",
	"connection"
];
const patternSchema = z.object({
	id: z.string(),
	pattern: z.string(),
	mode: z.union([z.const("exact"), z.const("contains")]),
	code: z.string(),
	provider: z.string(),
	enabled: z.boolean(),
	sample: z.string()
});
const settingsSchema = z.object({
	rules: z.array(z.string()).default([]),
	patterns: z.array(patternSchema).default([]),
	disabledBuiltins: z.array(z.string()).default([])
});
function apply(ctx) {
	const runtime = createRuntime(ctx.settings.register("dsh-better-retry", settingsSchema, { base: {
		rules: [],
		patterns: [],
		disabledBuiltins: []
	} }));
	ctx.effect(() => ctx.connection.rpc.handle(CHANNEL, (endpoint, input) => runtime.handle(endpoint, input)));
	ctx.on("llm/stream", (options, next) => rewriteStream(next(), runtime, options.provider ?? ""));
}
/** Classification keeps the original message and metadata; DSH owns the retry loop. */
async function* rewriteStream(source, runtime, provider) {
	for await (const chunk of source) {
		if (chunk?.type === "finish" && chunk.reason?.kind === "error") {
			const failure = chunk.reason.failure;
			if (failure) {
				runtime.observe(failure, provider);
				if (runtime.match(failure, provider)) {
					yield {
						...chunk,
						reason: {
							...chunk.reason,
							failure: {
								...failure,
								code: "RATE_LIMIT"
							}
						}
					};
					continue;
				}
			}
		}
		yield chunk;
	}
}
//#endregion
export { apply, inject, name };

//# sourceMappingURL=index.mjs.map