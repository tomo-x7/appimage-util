import { input, select } from "@inquirer/prompts";
import { existsSync, statSync } from "fs";
import { extname } from "path";
import { CATEGORIES, type Category } from "./constants.js";
import { customSelect } from "./custom-select.js";
import type { DesktopEntry } from "./desktop.js";
import { normalizeKeywords } from "./desktop.js";
import type { IconCandidate } from "./icons.js";
import { extractIcons, previewIcon } from "./icons.js";
import { listApps } from "./utils.js";

export interface DesktopAnswers {
	name: string;
	comment: string;
	category: Category;
	keywords: string;
}

/** アイコン抽出結果（cleanup を呼び出し元に委譲） */
export interface IconResult {
	iconChoice: IconChoice;
	cleanup: () => void;
}

export type IconChoice =
	| { type: "extracted"; candidate: IconCandidate }
	| { type: "manual"; filePath: string; ext: string }
	| { type: "none" }
	| { type: "keep" };

/**
 * install/edit 共通のデスクトップエントリ質問を行う。
 * defaults が渡された場合は edit モード（デフォルト値あり）。
 */
export async function askDesktopEntry(defaults?: Partial<DesktopEntry>): Promise<DesktopAnswers> {
	const name = await input({
		message: "表示名 (Name):",
		default: defaults?.Name || undefined,
		required: true,
		validate: (v) => (v.trim().length > 0 ? true : "表示名は必須です"),
	});

	const comment = await input({
		message: "説明 (Comment, 空で省略):",
		default: defaults?.Comment || "",
	});

	const defaultCategory = defaults?.Categories?.replace(/;$/, "") as Category | undefined;
	const category = await select<Category>({
		message: "カテゴリ (Categories):",
		choices: CATEGORIES.map((c) => ({
			name: c,
			value: c,
		})),
		default: defaultCategory && CATEGORIES.includes(defaultCategory) ? defaultCategory : undefined,
	});

	const rawKeywords = await input({
		message: "キーワード (Keywords, カンマ or セミコロン区切り, 空で省略):",
		default: defaults?.Keywords || "",
	});
	const keywords = normalizeKeywords(rawKeywords);

	return {
		name: name.trim(),
		comment: comment.trim(),
		category,
		keywords,
	};
}

/**
 * install 時のアイコン選択を行う。
 * cleanup は呼び出し元がアイコンコピー完了後に呼ぶこと。
 */
export async function askIconForInstall(appImagePath: string): Promise<IconResult> {
	console.log("アイコンを AppImage から抽出しています...");
	const { candidates, cleanup } = await extractIcons(appImagePath);

	if (candidates.length === 0) {
		console.log("AppImage からアイコンが見つかりませんでした。");
		const iconChoice = await askIconFallback();
		cleanup();
		return { iconChoice, cleanup: () => {} };
	}

	const iconChoice = await askIconFromCandidates(candidates);
	// extracted の場合は tmp を消す前にコピーが必要なので cleanup を委譲
	return { iconChoice, cleanup };
}

/**
 * edit 時のアイコン選択を行う（4択）。
 * cleanup は呼び出し元がアイコンコピー完了後に呼ぶこと。
 */
export async function askIconForEdit(appImagePathForExtract: string): Promise<IconResult> {
	const noopCleanup = () => {};

	const action = await select<string>({
		message: "アイコンの設定:",
		choices: [
			{ name: "そのまま（現状維持）", value: "keep" },
			{ name: "手動指定（ファイルパス入力）", value: "manual" },
			{ name: "AppImage から抽出して選択", value: "extract" },
			{ name: "なし（アイコン削除）", value: "none" },
		],
	});

	switch (action) {
		case "keep":
			return { iconChoice: { type: "keep" }, cleanup: noopCleanup };
		case "manual": {
			const iconChoice = await askManualIcon();
			return { iconChoice, cleanup: noopCleanup };
		}
		case "extract": {
			console.log("アイコンを AppImage から抽出しています...");
			const { candidates, cleanup } = await extractIcons(appImagePathForExtract);
			if (candidates.length === 0) {
				console.log("AppImage からアイコンが見つかりませんでした。");
				const iconChoice = await askIconFallback();
				cleanup();
				return { iconChoice, cleanup: noopCleanup };
			}
			const iconChoice = await askIconFromCandidates(candidates);
			return { iconChoice, cleanup };
		}
		case "none":
			return { iconChoice: { type: "none" }, cleanup: noopCleanup };
		default:
			return { iconChoice: { type: "keep" }, cleanup: noopCleanup };
	}
}

/** 候補からアイコンを選択する（p キーでプレビュー） */
async function askIconFromCandidates(candidates: IconCandidate[]): Promise<IconChoice> {
	const choices = [
		...candidates.map((c, i) => ({
			name: c.label,
			value: `select:${i}` as string,
		})),
		{ name: "--- 手動で指定 ---", value: "manual" as string },
		{ name: "--- アイコンなし ---", value: "none" as string },
	];

	const answer = await customSelect<string>({
		message: "アイコンを選択してください:",
		choices,
		onPreview: (value) => {
			if (value.startsWith("select:")) {
				const idx = Number.parseInt(value.replace("select:", ""), 10);
				const candidate = candidates[idx];
				if (candidate) {
					previewIcon(candidate.absolutePath);
				}
			}
		},
	});

	if (answer === "manual") {
		return await askManualIcon();
	}
	if (answer === "none") {
		return { type: "none" };
	}

	const idx = Number.parseInt(answer.replace("select:", ""), 10);
	const candidate = candidates[idx];
	if (!candidate) {
		return { type: "none" };
	}
	return { type: "extracted", candidate };
}

/** 手動指定でアイコンパスを入力する */
async function askManualIcon(): Promise<IconChoice> {
	const filePath = await input({
		message: "アイコンファイルのパス (png/svg):",
		validate: (v) => {
			const trimmed = v.trim();
			if (!trimmed) return "パスを入力してください";
			const ext = extname(trimmed).slice(1).toLowerCase();
			if (ext !== "png" && ext !== "svg") return "png または svg ファイルのみ対応しています";
			if (!existsSync(trimmed)) return "ファイルが見つかりません";
			if (!statSync(trimmed).isFile()) return "ファイルを指定してください";
			return true;
		},
	});

	const resolved = filePath.trim();
	const ext = extname(resolved).slice(1).toLowerCase();
	return { type: "manual", filePath: resolved, ext };
}

/** アイコンが見つからなかった場合のフォールバック（手動/なし） */
async function askIconFallback(): Promise<IconChoice> {
	const action = await select<string>({
		message: "アイコンの設定:",
		choices: [
			{ name: "手動で指定する", value: "manual" },
			{ name: "アイコンなしで作成する", value: "none" },
		],
	});
	if (action === "manual") {
		return await askManualIcon();
	}
	return { type: "none" };
}

/** update/edit/uninstall 用の appname 選択プロンプト */
export async function selectApp(options?: { message?: string; allowBroken?: boolean }): Promise<string | null> {
	const apps = listApps();
	const { message = "アプリを選択:", allowBroken = false } = options ?? {};

	if (apps.length === 0) {
		console.log("管理下のアプリがありません。");
		return null;
	}

	const filterable = allowBroken ? apps : apps.filter((a) => !a.broken);
	const brokenOnly = apps.filter((a) => a.broken);

	if (filterable.length === 0 && !allowBroken) {
		console.log("操作可能なアプリがありません。");
		if (brokenOnly.length > 0) {
			console.log(`(壊れたエントリ: ${brokenOnly.map((a) => a.appname).join(", ")})`);
		}
		return null;
	}

	const choices = apps.map((a) => ({
		name: a.broken ? `${a.appname} (broken)` : a.appname,
		value: a.appname,
		disabled: !allowBroken && a.broken ? "(壊れたエントリ)" : (false as const),
	}));

	const selected = await select<string>({
		message,
		choices,
	});

	return selected;
}
