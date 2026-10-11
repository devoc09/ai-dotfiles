/**
 * Plan quota for the active provider in Pi's footer status row.
 *
 * Sources:
 * - ChatGPT/Codex plan windows from the ChatGPT backend usage endpoint.
 *   Pi's own `openai` OAuth credential is enforced to api.openai.com and is
 *   rejected there, so the Codex CLI credential is the one that answers.
 * - OpenCode Go plan windows from its usage endpoint.
 *
 * Both endpoints are undocumented and rate limited, so results are cached for
 * a minute and only refetched when the cache is stale.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const STATUS_KEY = "quota";
const CACHE_MS = 60_000;
const REQUEST_TIMEOUT_MS = 15_000;
const WARN_REMAINING_PCT = 25;
const CRITICAL_REMAINING_PCT = 10;

const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const OPENCODE_GO_USAGE_URL = "https://opencode.ai/zen/go/v1/usage";

type Theme = ExtensionContext["ui"]["theme"];
type ThemeColor = Parameters<Theme["fg"]>[0];

interface QuotaWindow {
	label: string;
	remainingPct: number;
	/** Epoch milliseconds, or null when the API reports no reset. */
	resetsAt: number | null;
	limited: boolean;
}

interface Quota {
	source: string;
	windows: QuotaWindow[];
}

type QuotaProvider = "codex" | "opencode-go";

interface FetchResult {
	status: number;
	data?: any;
}

function quotaProvider(providerId: string): QuotaProvider | undefined {
	if (providerId === "openai" || providerId === "openai-codex") return "codex";
	if (providerId === "opencode-go") return "opencode-go";
	return undefined;
}

async function getJson(url: string, headers: Record<string, string>): Promise<FetchResult> {
	try {
		const response = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
		return { status: response.status, data: response.ok ? await response.json() : undefined };
	} catch {
		return { status: 0 };
	}
}

function clampPercent(value: number): number {
	return Math.max(0, Math.min(100, value));
}

function isOffline(): boolean {
	const value = process.env.PI_OFFLINE?.toLowerCase();
	return value === "1" || value === "true" || value === "yes";
}

/** Prefer the relative reset the API sends; it is immune to local clock skew. */
function resetTime(resetAfterSeconds: unknown, resetAtSeconds: unknown): number | null {
	const after = Number(resetAfterSeconds);
	if (Number.isFinite(after) && after > 0) return Date.now() + after * 1000;
	const at = Number(resetAtSeconds);
	return Number.isFinite(at) && at > 0 ? at * 1000 : null;
}

function windowLabel(seconds: unknown): string {
	const value = Number(seconds);
	if (!Number.isFinite(value) || value <= 0) return "quota";
	if (value < 3600) return `${Math.round(value / 60)}m`;
	if (value < 86400) return `${Math.round(value / 3600)}h`;
	return `${Math.round(value / 86400)}d`;
}

function formatDuration(ms: number): string {
	const minutes = Math.max(0, Math.round(ms / 60_000));
	if (minutes < 60) return `${minutes}m`;
	const hours = minutes / 60;
	if (hours < 48) return `${hours.toFixed(1)}h`;
	const days = hours / 24;
	return days < 10 ? `${days.toFixed(1)}d` : `${Math.round(days)}d`;
}

/** The `chatgpt_account_id` claim, which Pi's own Codex provider also reads. */
function jwtAuthClaim(token: string): Record<string, unknown> | undefined {
	const payload = token.split(".")[1];
	if (!payload) return undefined;
	try {
		return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))["https://api.openai.com/auth"];
	} catch {
		return undefined;
	}
}

function codexCliCredential(): { token: string; accountId?: string } | undefined {
	try {
		const auth = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".codex", "auth.json"), "utf8"));
		const token = auth?.tokens?.access_token;
		if (typeof token !== "string") return undefined;
		const accountId = auth?.tokens?.account_id;
		return { token, accountId: typeof accountId === "string" ? accountId : undefined };
	} catch {
		return undefined;
	}
}

function codexWindows(rateLimit: any): QuotaWindow[] {
	const windows: QuotaWindow[] = [];
	for (const raw of [rateLimit?.primary_window, rateLimit?.secondary_window]) {
		const used = Number(raw?.used_percent);
		if (!Number.isFinite(used)) continue;
		windows.push({
			label: windowLabel(raw?.limit_window_seconds),
			remainingPct: clampPercent(100 - used),
			resetsAt: resetTime(raw?.reset_after_seconds, raw?.reset_at),
			limited: Boolean(rateLimit?.limit_reached),
		});
	}
	return windows;
}

async function codexQuota(ctx: ExtensionContext): Promise<Quota | undefined> {
	const candidates: { token: string; accountId?: string; source: string }[] = [];
	for (const provider of ["openai-codex", "openai"]) {
		const token = await ctx.modelRegistry.getApiKeyForProvider(provider).catch(() => undefined);
		if (typeof token !== "string" || token.split(".").length !== 3) continue;
		const accountId = jwtAuthClaim(token)?.chatgpt_account_id;
		candidates.push({
			token,
			accountId: typeof accountId === "string" ? accountId : undefined,
			source: `pi /login ${provider}`,
		});
	}
	const cli = codexCliCredential();
	if (cli) candidates.push({ ...cli, source: "codex CLI login" });

	for (const candidate of candidates) {
		const { data } = await getJson(CODEX_USAGE_URL, {
			Authorization: `Bearer ${candidate.token}`,
			Accept: "application/json",
			...(candidate.accountId ? { "ChatGPT-Account-Id": candidate.accountId } : {}),
		});
		const windows = codexWindows(data?.rate_limit);
		if (windows.length > 0) return { source: candidate.source, windows };
	}
	return undefined;
}

function opencodeGoWindows(usage: any): QuotaWindow[] {
	const windows: QuotaWindow[] = [];
	// The API names its windows but does not report their length, so they keep
	// their own labels instead of being converted to a duration.
	for (const [key, label] of [
		["rolling", "roll"],
		["weekly", "wk"],
		["monthly", "mo"],
	] as const) {
		const raw = usage?.[key];
		const percent = Number(raw?.percent);
		if (!Number.isFinite(percent)) continue;
		const resetsAt = Date.parse(String(raw?.resetsAt));
		windows.push({
			label,
			remainingPct: clampPercent(100 - percent),
			resetsAt: Number.isFinite(resetsAt) ? resetsAt : null,
			limited: typeof raw?.status === "string" && raw.status !== "ok",
		});
	}
	return windows;
}

async function opencodeGoQuota(ctx: ExtensionContext): Promise<Quota | undefined> {
	const key =
		process.env.OPENCODE_GO_API_KEY ??
		(await ctx.modelRegistry.getApiKeyForProvider("opencode-go").catch(() => undefined)) ??
		process.env.OPENCODE_API_KEY;
	if (!key) return undefined;

	const { data } = await getJson(OPENCODE_GO_USAGE_URL, {
		Authorization: `Bearer ${key}`,
		Accept: "application/json",
	});
	const windows = opencodeGoWindows(data?.usage);
	return windows.length > 0 ? { source: "opencode-go API key", windows } : undefined;
}

function windowColor(window: QuotaWindow): ThemeColor {
	if (window.limited || window.remainingPct < CRITICAL_REMAINING_PCT) return "error";
	if (window.remainingPct < WARN_REMAINING_PCT) return "warning";
	return "text";
}

function render(quota: Quota | undefined, theme: Theme): string | undefined {
	if (!quota) return undefined;
	const now = Date.now();
	return quota.windows
		.map((window) => {
			const reset = window.resetsAt ? theme.fg("dim", ` (${formatDuration(window.resetsAt - now)})`) : "";
			return (
				theme.fg("dim", `${window.label} `) +
				theme.fg(windowColor(window), `${Math.round(window.remainingPct)}%`) +
				reset
			);
		})
		.join(theme.fg("dim", " · "));
}

export default function (pi: ExtensionAPI) {
	let cache: { provider: QuotaProvider; at: number; quota: Quota | undefined } | undefined;
	let inFlight: Promise<void> | undefined;
	let timer: ReturnType<typeof setInterval> | undefined;

	function paint(ctx: ExtensionContext, quota: Quota | undefined): void {
		ctx.ui.setStatus(STATUS_KEY, render(quota, ctx.ui.theme));
	}

	function activeProvider(ctx: ExtensionContext): QuotaProvider | undefined {
		const model = ctx.model;
		const provider = model ? quotaProvider(model.provider) : undefined;
		// An API-key OpenAI setup bills per token, so plan windows would mislead.
		const supported =
			provider === "opencode-go" || (provider === "codex" && model !== undefined && ctx.modelRegistry.isUsingOAuth(model));
		return supported ? provider : undefined;
	}

	/** Reuse the cached windows, but recompute the reset countdown. */
	function repaint(ctx: ExtensionContext): void {
		const provider = activeProvider(ctx);
		if (provider && cache?.provider === provider) paint(ctx, cache.quota);
	}

	async function update(ctx: ExtensionContext, force = false): Promise<void> {
		const provider = activeProvider(ctx);
		// PI_OFFLINE promises the user no automatic network activity.
		if (!provider || isOffline()) {
			ctx.ui.setStatus(STATUS_KEY, undefined);
			return;
		}
		if (!force && cache?.provider === provider && Date.now() - cache.at < CACHE_MS) {
			paint(ctx, cache.quota);
			return;
		}
		if (inFlight) return inFlight;

		inFlight = (async () => {
			let quota: Quota | undefined;
			try {
				quota = provider === "codex" ? await codexQuota(ctx) : await opencodeGoQuota(ctx);
			} catch {
				quota = undefined;
			}
			cache = { provider, at: Date.now(), quota };
			paint(ctx, quota);
			inFlight = undefined;
		})();
		return inFlight;
	}

	pi.on("session_start", (_event, ctx) => {
		// Print and JSON runs would pay for a request no one can see.
		if (ctx.mode !== "tui" && ctx.mode !== "rpc") return;
		void update(ctx, true);
		// The countdown drifts; the windows themselves only change while working.
		timer ??= setInterval(() => repaint(ctx), CACHE_MS);
	});

	pi.on("model_select", (_event, ctx) => {
		if (ctx.mode !== "tui" && ctx.mode !== "rpc") return;
		// Never hold up the UI for a status line.
		void update(ctx, true);
	});

	pi.on("turn_end", (_event, ctx) => {
		if (ctx.mode !== "tui" && ctx.mode !== "rpc") return;
		void update(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		if (timer) clearInterval(timer);
		timer = undefined;
		cache = undefined;
		ctx.ui.setStatus(STATUS_KEY, undefined);
	});

	pi.registerCommand("quota", {
		description: "Show plan usage windows for the active provider",
		handler: async (_args, ctx) => {
			await update(ctx, true);
			const provider = activeProvider(ctx);
			const quota = provider && cache?.provider === provider ? cache.quota : undefined;
			if (!quota) {
				ctx.ui.notify(`No quota data for ${ctx.model?.provider ?? "this model"}.`, "warning");
				return;
			}
			const now = Date.now();
			const details = quota.windows.map((window) => {
				const reset = window.resetsAt ? `, resets in ${formatDuration(window.resetsAt - now)}` : "";
				return `${window.label} ${Math.round(window.remainingPct)}% left${reset}${window.limited ? " (limited)" : ""}`;
			});
			ctx.ui.notify(`${quota.source}\n${details.join("\n")}`, "info");
		},
	});
}
