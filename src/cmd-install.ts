import { confirm, input } from "@inquirer/prompts";
import { chmodSync, copyFileSync, existsSync, mkdirSync, unlinkSync } from "fs";
import { basename, join } from "path";
import { APPIMAGE_ROOT, DESKTOP_DIR } from "./constants.js";
import type { DesktopEntry } from "./desktop.js";
import { writeDesktop } from "./desktop.js";
import { askDesktopEntry, askIconForInstall } from "./prompts.js";
import {
	appDir,
	appImagePath,
	checkAppnameConflict,
	desktopPath,
	generatedDesktopPath,
	resolvePath,
	validateAppname,
} from "./utils.js";

export async function installCommand(rawPath: string, rawAppname?: string): Promise<void> {
	// 1. AppImage パスの解決と検証
	const srcAppImage = resolvePath(rawPath);
	if (!existsSync(srcAppImage)) {
		console.error(`エラー: AppImage が見つかりません: ${srcAppImage}`);
		process.exit(1);
	}

	// 2. appname の取得と検証
	let appname: string;
	if (rawAppname) {
		appname = rawAppname;
	} else {
		appname = await input({
			message: "appname (識別子, 例: my-app):",
			validate: (v) => {
				const trimmed = v.trim();
				const valid = validateAppname(trimmed);
				if (valid !== true) return valid;
				const conflict = checkAppnameConflict(trimmed);
				if (conflict !== true) return conflict;
				return true;
			},
		});
		appname = appname.trim();
	}

	// CLIから渡された場合も検証
	const nameValid = validateAppname(appname);
	if (nameValid !== true) {
		console.error(`エラー: ${nameValid}`);
		process.exit(1);
	}
	const nameConflict = checkAppnameConflict(appname);
	if (nameConflict !== true) {
		console.error(`エラー: ${nameConflict}`);
		process.exit(1);
	}

	// 3. デスクトップエントリの質問
	const answers = await askDesktopEntry();

	// 4. アイコン選択
	const iconChoice = await askIconForInstall(srcAppImage);

	// --- 全質問完了。以下は実操作 ---

	const dir = appDir(appname);
	const destAppImage = appImagePath(appname);
	const destDesktop = desktopPath(appname);
	const genDesktop = generatedDesktopPath(appname);

	console.log(`\nインストールを実行します...`);

	// 手順1: ディレクトリ作成
	mkdirSync(dir, { recursive: true });
	mkdirSync(DESKTOP_DIR, { recursive: true });

	// 手順2: AppImage をコピーして実行権付与
	copyFileSync(srcAppImage, destAppImage);
	chmodSync(destAppImage, 0o755);

	// 手順2: アイコンをコピー
	let iconAbsPath: string | undefined;
	if (iconChoice.type === "extracted") {
		const ext = iconChoice.candidate.ext;
		const destIcon = join(dir, `icon.${ext}`);
		copyFileSync(iconChoice.candidate.absolutePath, destIcon);
		iconAbsPath = destIcon;
	} else if (iconChoice.type === "manual") {
		const destIcon = join(dir, `icon.${iconChoice.ext}`);
		copyFileSync(iconChoice.filePath, destIcon);
		iconAbsPath = destIcon;
	}

	// 手順3: .desktop ファイル作成
	const entry: DesktopEntry = {
		Name: answers.name,
		Comment: answers.comment || undefined,
		Exec: destAppImage,
		Icon: iconAbsPath,
		Categories: `${answers.category};`,
		Keywords: answers.keywords || undefined,
	};
	writeDesktop(destDesktop, entry);

	// 手順4: 生成 desktop にコピー
	copyFileSync(destDesktop, genDesktop);

	console.log(`✓ ${appname} をインストールしました`);
	console.log(`  AppImage: ${destAppImage}`);
	console.log(`  Desktop:  ${genDesktop}`);

	// 手順5: 元の AppImage を削除
	const shouldDelete = await confirm({
		message: `元の AppImage を削除します`,
		default: true,
	});

	if (shouldDelete) {
		unlinkSync(srcAppImage);
		console.log(`✓ 元の AppImage を削除しました: ${basename(srcAppImage)}`);
	} else {
		console.log(`元の AppImage は残しました: ${srcAppImage}`);
	}
}
