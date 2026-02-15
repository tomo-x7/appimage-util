import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "fs";
import { basename, extname, join } from "path";
import { execSync, spawn } from "child_process";
import fg from "fast-glob";
import { imageSize } from "image-size";

export interface IconCandidate {
	/** tmp展開先からの相対パス */
	relativePath: string;
	/** 絶対パス（tmp内） */
	absolutePath: string;
	/** 拡張子 (png / svg) */
	ext: string;
	/** PNG の場合の幅（不明なら undefined） */
	width?: number;
	/** PNG の場合の高さ（不明なら undefined） */
	height?: number;
	/** スコア（高い方が優先） */
	score: number;
	/** 表示用ラベル */
	label: string;
}

/**
 * AppImage を tmp に展開してアイコン候補を返す。
 * 呼び出し後は cleanup() で展開先を削除すること。
 */
export async function extractIcons(
	appImagePath: string,
): Promise<{ candidates: IconCandidate[]; cleanup: () => void; extractDir: string }> {
	const tmpBase = join("/tmp", `appimage-util-${process.pid}-${Date.now()}`);
	mkdirSync(tmpBase, { recursive: true });

	// AppImage を tmp にコピーして実行権付与
	const tmpAppImage = join(tmpBase, basename(appImagePath));
	copyFileSync(appImagePath, tmpAppImage);
	chmodSync(tmpAppImage, 0o755);

	// --appimage-extract で展開
	try {
		execSync(`"${tmpAppImage}" --appimage-extract`, {
			cwd: tmpBase,
			stdio: "pipe",
			timeout: 30_000,
		});
	} catch {
		return {
			candidates: [],
			cleanup: () => rmSync(tmpBase, { recursive: true, force: true }),
			extractDir: tmpBase,
		};
	}

	const squashfsRoot = join(tmpBase, "squashfs-root");
	if (!existsSync(squashfsRoot)) {
		return {
			candidates: [],
			cleanup: () => rmSync(tmpBase, { recursive: true, force: true }),
			extractDir: tmpBase,
		};
	}

	// アイコン候補を探索
	const candidates = await findIconCandidates(squashfsRoot);

	return {
		candidates,
		cleanup: () => rmSync(tmpBase, { recursive: true, force: true }),
		extractDir: tmpBase,
	};
}

async function findIconCandidates(squashfsRoot: string): Promise<IconCandidate[]> {
	const results: IconCandidate[] = [];

	// .DirIcon をチェック
	const dirIconPath = join(squashfsRoot, ".DirIcon");
	if (existsSync(dirIconPath)) {
		const resolved = checkImageType(dirIconPath);
		if (resolved) {
			const relPath = ".DirIcon";
			const info = getImageInfo(dirIconPath, resolved);
			results.push({
				relativePath: relPath,
				absolutePath: dirIconPath,
				ext: resolved,
				width: info?.width,
				height: info?.height,
				score: 100,
				label: formatLabel(relPath, resolved, info?.width, info?.height),
			});
		}
	}

	// glob patterns（優先度順）
	const patterns: { glob: string; score: number }[] = [
		{ glob: "usr/share/icons/hicolor/**/apps/*.{png,svg}", score: 80 },
		{ glob: "usr/share/pixmaps/*.{png,svg}", score: 60 },
		{ glob: "**/icons/**/apps/*.{png,svg}", score: 40 },
	];

	const seen = new Set<string>();

	for (const { glob, score } of patterns) {
		const files = await fg(glob, { cwd: squashfsRoot, absolute: false });
		for (const f of files) {
			if (seen.has(f)) continue;
			seen.add(f);
			const absPath = join(squashfsRoot, f);
			const ext = extname(f).slice(1).toLowerCase();
			if (ext !== "png" && ext !== "svg") continue;
			const info = getImageInfo(absPath, ext);
			results.push({
				relativePath: f,
				absolutePath: absPath,
				ext,
				width: info?.width,
				height: info?.height,
				score: computeScore(score, ext, info?.width),
				label: formatLabel(f, ext, info?.width, info?.height),
			});
		}
	}

	// 追加：*icon* を含むもの（上記に含まれないもの）
	const iconWild = await fg("**/*icon*.{png,svg}", { cwd: squashfsRoot, absolute: false });
	for (const f of iconWild) {
		if (seen.has(f)) continue;
		seen.add(f);
		const absPath = join(squashfsRoot, f);
		const ext = extname(f).slice(1).toLowerCase();
		if (ext !== "png" && ext !== "svg") continue;
		const info = getImageInfo(absPath, ext);
		results.push({
			relativePath: f,
			absolutePath: absPath,
			ext,
			width: info?.width,
			height: info?.height,
			score: computeScore(20, ext, info?.width),
			label: formatLabel(f, ext, info?.width, info?.height),
		});
	}

	// スコア降順ソート → 最大10件
	results.sort((a, b) => b.score - a.score);
	return results.slice(0, 10);
}

function computeScore(baseScore: number, ext: string, width?: number): number {
	let score = baseScore;
	// PNG を SVG より優先（互換性重視）
	if (ext === "png") {
		score += 5;
		// サイズが大きいほど優先
		if (width) {
			score += Math.min(width / 10, 30);
		}
	}
	// SVG はボーナス小
	if (ext === "svg") {
		score += 2;
	}
	return score;
}

/** ファイルの実体が png/svg かを判定する（拡張子がない場合用） */
function checkImageType(filePath: string): string | null {
	const ext = extname(filePath).slice(1).toLowerCase();
	if (ext === "png" || ext === "svg") return ext;

	// 拡張子がない場合、マジックバイトで判定
	try {
		const buf = readFileSync(filePath, { flag: "r" });
		if (buf.length >= 8) {
			// PNG: 89 50 4E 47
			if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
				return "png";
			}
		}
		// SVG: テキストで <svg を含むか
		const head = buf.subarray(0, Math.min(buf.length, 1024)).toString("utf-8");
		if (head.includes("<svg")) {
			return "svg";
		}
	} catch {
		// ignore
	}
	return null;
}

/** PNG のサイズ情報を取得する */
function getImageInfo(filePath: string, ext: string): { width?: number; height?: number } | null {
	if (ext !== "png") return null;
	try {
		const buf = readFileSync(filePath);
		const result = imageSize(new Uint8Array(buf));
		return { width: result.width, height: result.height };
	} catch {
		return null;
	}
}

function formatLabel(relPath: string, ext: string, width?: number, height?: number): string {
	const sizeStr = width && height ? ` (${width}x${height})` : "";
	return `${relPath}${sizeStr}`;
}

/** xdg-open でプレビューを開く（非同期、失敗しても続行） */
export function previewIcon(filePath: string): void {
	try {
		const child = spawn("xdg-open", [filePath], {
			detached: true,
			stdio: "ignore",
		});
		child.unref();
	} catch {
		console.warn("プレビューの起動に失敗しました");
	}
}
