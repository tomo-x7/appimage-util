import { confirm, input, select } from "@inquirer/prompts";
import { existsSync, statSync } from "fs";
import { extname } from "path";
import { CATEGORIES, type Category } from "./constants.js";
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
	iconChoice: IconChoice;
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
		iconChoice: { type: "none" }, // placeholder — アイコンは別途質問
	};
}

/**
 * install 時のアイコン選択を行う。
 * AppImage から抽出して候補を提示。候補がなければ手動/なしを選択。
 */
export async function askIconForInstall(appImagePath: string): Promise<IconChoice> {
	console.log("アイコンを AppImage から抽出しています...");
	const { candidates, cleanup } = await extractIcons(appImagePath);

	try {
		if (candidates.length === 0) {
			console.log("AppImage からアイコンが見つかりませんでした。");
			return await askIconFallback();
		}
		return await askIconFromCandidates(candidates);
	} finally {
		cleanup();
	}
}

/**
 * edit 時のアイコン選択を行う（4択）。
 */
export async function askIconForEdit(appImagePathForExtract: string): Promise<IconChoice> {
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
			return { type: "keep" };
		case "manual":
			return await askManualIcon();
		case "extract": {
			console.log("アイコンを AppImage から抽出しています...");
			const { candidates, cleanup } = await extractIcons(appImagePathForExtract);
			try {
				if (candidates.length === 0) {
					console.log("AppImage からアイコンが見つかりませんでした。");
					return await askIconFallback();
				}
				return await askIconFromCandidates(candidates);
			} finally {
				cleanup();
			}
		}
		case "none":
			return { type: "none" };
		default:
			return { type: "keep" };
	}
}

/** 候補からアイコンを選択する（プレビュー機能付き） */
async function askIconFromCandidates(candidates: IconCandidate[]): Promise<IconChoice> {
	while (true) {
		const choices = [
			...candidates.map((c, i) => ({
				name: c.label,
				value: `select:${i}`,
			})),
			{ name: "--- プレビューする ---", value: "preview" },
			{ name: "--- 手動で指定 ---", value: "manual" },
			{ name: "--- アイコンなし ---", value: "none" },
		];

		const answer = await select<string>({
			message: "アイコンを選択してください:",
			choices,
		});

		if (answer === "preview") {
			const previewIdx = await select<string>({
				message: "プレビューするアイコンを選択:",
				choices: candidates.map((c, i) => ({
					name: c.label,
					value: String(i),
				})),
			});
			const idx = Number.parseInt(previewIdx, 10);
			const candidate = candidates[idx];
			if (candidate) {
				console.log(`プレビュー中: ${candidate.label}`);
				previewIcon(candidate.absolutePath);
			}
			// プレビュー後は再度選択に戻る
			continue;
		}

		if (answer === "manual") {
			return await askManualIcon();
		}

		if (answer === "none") {
			return { type: "none" };
		}

		// select:N の場合
		const idx = Number.parseInt(answer.replace("select:", ""), 10);
		const candidate = candidates[idx];
		if (!candidate) continue;

		// 選択後のプレビュー確認
		const wantPreview = await confirm({
			message: "このアイコンをプレビューしますか？",
			default: false,
		});

		if (wantPreview) {
			previewIcon(candidate.absolutePath);
			const adopt = await confirm({
				message: "このアイコンを採用しますか？",
				default: true,
			});
			if (!adopt) continue; // 再選択
		}

		return { type: "extracted", candidate };
	}
}

/** 手動指定でアイコンパスを入力する */
async function askManualIcon(): Promise<IconChoice> {
	while (true) {
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

		const wantPreview = await confirm({
			message: "このアイコンをプレビューしますか？",
			default: false,
		});
		if (wantPreview) {
			previewIcon(resolved);
			const adopt = await confirm({
				message: "このアイコンを採用しますか？",
				default: true,
			});
			if (!adopt) continue; // 再入力
		}

		return { type: "manual", filePath: resolved, ext };
	}
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
