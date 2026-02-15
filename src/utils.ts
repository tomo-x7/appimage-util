import { existsSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";
import { APPIMAGE_ROOT, APPNAME_REGEX, DESKTOP_DIR } from "./constants.js";

/** appname を検証する。不正なら理由文字列を返す */
export function validateAppname(name: string): string | true {
	if (!APPNAME_REGEX.test(name)) {
		return "appname は小文字英数字・ドット・アンダースコア・ハイフンのみ使用可能です (例: my-app)";
	}
	return true;
}

/** 既存 appname と重複チェック。重複していれば理由を返す */
export function checkAppnameConflict(name: string): string | true {
	const dir = join(APPIMAGE_ROOT, name);
	if (existsSync(dir)) {
		return `appname '${name}' は既に存在します`;
	}
	return true;
}

/** appname のディレクトリパスを返す */
export function appDir(appname: string): string {
	return join(APPIMAGE_ROOT, appname);
}

/** appname の AppImage ファイルパスを返す */
export function appImagePath(appname: string): string {
	return join(appDir(appname), `${appname}.appimage`);
}

/** appname の原本 desktop ファイルパスを返す */
export function desktopPath(appname: string): string {
	return join(appDir(appname), `${appname}.desktop`);
}

/** 生成 desktop のパスを返す */
export function generatedDesktopPath(appname: string): string {
	return join(DESKTOP_DIR, `generated.${appname}.desktop`);
}

/** アプリ一覧を取得する。壊れたエントリには broken フラグを付ける */
export function listApps(): { appname: string; broken: boolean }[] {
	if (!existsSync(APPIMAGE_ROOT)) return [];
	const entries = readdirSync(APPIMAGE_ROOT, { withFileTypes: true });
	return entries
		.filter((e) => e.isDirectory() && !e.name.startsWith("."))
		.map((e) => {
			const dp = join(APPIMAGE_ROOT, e.name, `${e.name}.desktop`);
			return { appname: e.name, broken: !existsSync(dp) };
		})
		.sort((a, b) => a.appname.localeCompare(b.appname));
}

/** パスを cwdベースで解決する */
export function resolvePath(p: string): string {
	return resolve(process.cwd(), p);
}
