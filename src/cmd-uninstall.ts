import { confirm } from "@inquirer/prompts";
import { existsSync, rmSync, unlinkSync } from "fs";
import { selectApp } from "./prompts.js";
import { appDir, generatedDesktopPath } from "./utils.js";

export async function uninstallCommand(): Promise<void> {
	// 1. appname を選択（壊れたエントリも許可）
	const appname = await selectApp({
		message: "削除するアプリを選択:",
		allowBroken: true,
	});
	if (!appname) return;

	// 2. 確認
	const proceed = await confirm({
		message: `${appname} を削除します`,
		default: false,
	});
	if (!proceed) {
		console.log("キャンセルしました。");
		return;
	}

	// --- 実操作 ---

	// 生成 desktop を削除
	const genDesktop = generatedDesktopPath(appname);
	if (existsSync(genDesktop)) {
		unlinkSync(genDesktop);
	}

	// アプリディレクトリを削除
	const dir = appDir(appname);
	if (existsSync(dir)) {
		rmSync(dir, { recursive: true, force: true });
	}

	console.log(`✓ ${appname} を削除しました`);
}
