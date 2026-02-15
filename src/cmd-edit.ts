import { copyFileSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import fg from "fast-glob";
import type { DesktopEntry } from "./desktop.js";
import { parseDesktop, writeDesktop } from "./desktop.js";
import { askDesktopEntry, askIconForEdit } from "./prompts.js";
import { selectApp } from "./prompts.js";
import { appDir, appImagePath, desktopPath, generatedDesktopPath } from "./utils.js";

export async function editCommand(): Promise<void> {
	// 1. appname を選択
	const appname = await selectApp({
		message: "編集するアプリを選択:",
		allowBroken: false,
	});
	if (!appname) return;

	const destDesktop = desktopPath(appname);
	if (!existsSync(destDesktop)) {
		console.error(`エラー: desktop ファイルが見つかりません: ${destDesktop}`);
		process.exit(1);
	}

	// 2. 既存の desktop を読み込む
	const existing = parseDesktop(destDesktop);

	// 3. install と同等の質問（デフォルト値を既存から）
	const answers = await askDesktopEntry(existing);

	// 4. アイコン選択（4択: そのまま/手動/抽出/なし）
	const iconChoice = await askIconForEdit(appImagePath(appname));

	// --- 実操作 ---

	const dir = appDir(appname);
	let iconAbsPath: string | undefined = existing.Icon;

	if (iconChoice.type === "extracted") {
		// 既存アイコンを削除
		removeExistingIcons(dir);
		const ext = iconChoice.candidate.ext;
		const destIcon = join(dir, `icon.${ext}`);
		copyFileSync(iconChoice.candidate.absolutePath, destIcon);
		iconAbsPath = destIcon;
	} else if (iconChoice.type === "manual") {
		removeExistingIcons(dir);
		const destIcon = join(dir, `icon.${iconChoice.ext}`);
		copyFileSync(iconChoice.filePath, destIcon);
		iconAbsPath = destIcon;
	} else if (iconChoice.type === "none") {
		removeExistingIcons(dir);
		iconAbsPath = undefined;
	}
	// type === "keep" の場合は何もしない

	// desktop を更新
	const entry: DesktopEntry = {
		Name: answers.name,
		Comment: answers.comment || undefined,
		Exec: appImagePath(appname),
		Icon: iconAbsPath,
		Categories: `${answers.category};`,
		Keywords: answers.keywords || undefined,
	};
	writeDesktop(destDesktop, entry);

	// 生成 desktop にコピー
	const genDesktop = generatedDesktopPath(appname);
	copyFileSync(destDesktop, genDesktop);

	console.log(`✓ ${appname} のデスクトップエントリを更新しました`);
}

/** アプリディレクトリ内の既存 icon.* を削除する */
function removeExistingIcons(dir: string): void {
	const icons = fg.sync("icon.*", { cwd: dir, absolute: true });
	for (const iconFile of icons) {
		unlinkSync(iconFile);
	}
}
