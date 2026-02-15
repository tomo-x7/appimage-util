import { readFileSync, writeFileSync } from "fs";

export interface DesktopEntry {
	Name: string;
	Comment?: string;
	Exec: string;
	Icon?: string;
	Categories: string;
	Keywords?: string;
}

const FIXED_KEYS = {
	Version: "1.2",
	Type: "Application",
	Terminal: "false",
} as const;

/** .desktop ファイルを文字列として生成する（固定順序） */
export function serializeDesktop(entry: DesktopEntry): string {
	const lines: string[] = ["[Desktop Entry]"];

	lines.push(`Version=${FIXED_KEYS.Version}`);
	lines.push(`Type=${FIXED_KEYS.Type}`);
	lines.push(`Name=${entry.Name}`);
	if (entry.Comment) {
		lines.push(`Comment=${entry.Comment}`);
	}
	lines.push(`Exec=${entry.Exec}`);
	if (entry.Icon) {
		lines.push(`Icon=${entry.Icon}`);
	}
	lines.push(`Categories=${entry.Categories}`);
	if (entry.Keywords) {
		lines.push(`Keywords=${entry.Keywords}`);
	}
	lines.push(`Terminal=${FIXED_KEYS.Terminal}`);

	return `${lines.join("\n")}\n`;
}

/** .desktop ファイルを読み込んで DesktopEntry に変換する */
export function parseDesktop(filePath: string): DesktopEntry {
	const content = readFileSync(filePath, "utf-8");
	const kv: Record<string, string> = {};

	for (const line of content.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("[")) continue;
		const eqIdx = trimmed.indexOf("=");
		if (eqIdx < 0) continue;
		const key = trimmed.slice(0, eqIdx).trim();
		const val = trimmed.slice(eqIdx + 1).trim();
		kv[key] = val;
	}

	return {
		Name: kv.Name ?? "",
		Comment: kv.Comment || undefined,
		Exec: kv.Exec ?? "",
		Icon: kv.Icon || undefined,
		Categories: kv.Categories ?? "",
		Keywords: kv.Keywords || undefined,
	};
}

/** .desktop ファイルを書き出す */
export function writeDesktop(filePath: string, entry: DesktopEntry): void {
	writeFileSync(filePath, serializeDesktop(entry), "utf-8");
}

/** Keywords 入力を正規化する。 `,` or `;` 区切り → `foo;bar;` 形式 */
export function normalizeKeywords(input: string): string {
	const parts = input
		.split(/[,;]/)
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
	if (parts.length === 0) return "";
	return `${parts.join(";")};`;
}
