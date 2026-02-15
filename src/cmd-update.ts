import { confirm } from "@inquirer/prompts";
import { chmodSync, copyFileSync, existsSync, renameSync, unlinkSync } from "fs";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { basename } from "path";
import { selectApp } from "./prompts.js";
import { appImagePath, resolvePath } from "./utils.js";

export async function updateCommand(rawPath: string, force: boolean): Promise<void> {
	// 1. 新しい AppImage パスの解決と検証
	const srcAppImage = resolvePath(rawPath);
	if (!existsSync(srcAppImage)) {
		console.error(`エラー: AppImage が見つかりません: ${srcAppImage}`);
		process.exit(1);
	}

	// 2. 更新対象 appname を選択
	const appname = await selectApp({
		message: "更新するアプリを選択:",
		allowBroken: false,
	});
	if (!appname) return;

	const existingAppImage = appImagePath(appname);
	if (!existsSync(existingAppImage)) {
		console.error(`エラー: 既存の AppImage が見つかりません: ${existingAppImage}`);
		process.exit(1);
	}

	// 3. SHA-256 でハッシュ比較
	const oldHash = computeSha256(existingAppImage);
	const newHash = computeSha256(srcAppImage);

	if (oldHash === newHash) {
		if (!force) {
			console.log("新旧の AppImage は同一です（SHA-256 一致）。");
			console.log("強制的に更新するには --force オプションを指定してください。");
			return;
		}
		console.warn("⚠ 新旧の AppImage は同一ですが、--force により続行します。");
	}

	// 4. 確認
	const proceed = await confirm({
		message: `${appname} を ${basename(srcAppImage)} で上書きします`,
		default: false,
	});
	if (!proceed) {
		console.log("キャンセルしました。");
		return;
	}

	// --- 実操作 ---

	const oldBackup = existingAppImage.replace(/\.appimage$/, ".old.appimage");

	// 既存の .old があれば削除
	if (existsSync(oldBackup)) {
		unlinkSync(oldBackup);
	}

	// 手順1: 既存を .old にリネーム
	renameSync(existingAppImage, oldBackup);

	// 手順2: 新しい AppImage をコピーして実行権付与
	copyFileSync(srcAppImage, existingAppImage);
	chmodSync(existingAppImage, 0o755);

	// 元ファイルを削除
	unlinkSync(srcAppImage);

	console.log(`✓ ${appname} を更新しました`);
	console.log(`  バックアップ: ${oldBackup}`);
}

function computeSha256(filePath: string): string {
	const data = readFileSync(filePath);
	return createHash("sha256").update(data).digest("hex");
}
