import * as readline from "readline";

export interface SelectChoice<T> {
	name: string;
	value: T;
	disabled?: string | boolean;
}

interface SelectOptions<T> {
	message: string;
	choices: SelectChoice<T>[];
	default?: T;
	/** 有効な候補にカーソルを合わせた状態で p を押したとき呼ばれる */
	onPreview?: (value: T) => void;
}

/**
 * カスタム select プロンプト。
 * - 上下キーでカーソル移動
 * - Enter で確定
 * - p キーでプレビュー（onPreview が設定されている場合）
 */
export function customSelect<T>(options: SelectOptions<T>): Promise<T> {
	return new Promise((resolve) => {
		const { message, choices, onPreview } = options;
		const enabledIndices = choices.map((c, i) => (c.disabled ? -1 : i)).filter((i) => i >= 0);
		if (enabledIndices.length === 0) {
			throw new Error("選択可能な候補がありません");
		}

		// デフォルト値に合致するインデックスを探す
		let cursorPos = 0;
		if (options.default !== undefined) {
			const defIdx = enabledIndices.findIndex((i) => choices[i].value === options.default);
			if (defIdx >= 0) cursorPos = defIdx;
		}

		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
			terminal: false,
		});

		const wasRaw = process.stdin.isRaw;
		if (process.stdin.isTTY) {
			process.stdin.setRawMode(true);
		}
		process.stdin.resume();

		function render(initial = false) {
			const lines: string[] = [];

			// ヘッダー
			const helpText = onPreview ? " (↑↓: 移動, Enter: 決定, p: プレビュー)" : " (↑↓: 移動, Enter: 決定)";
			lines.push(`\x1b[1m? ${message}\x1b[0m${helpText}`);

			for (let ei = 0; ei < enabledIndices.length; ei++) {
				const ci = enabledIndices[ei];
				const choice = choices[ci];
				if (choice.disabled) continue;
				const cursor = ei === cursorPos ? "\x1b[36m❯\x1b[0m" : " ";
				const label = ei === cursorPos ? `\x1b[36m${choice.name}\x1b[0m` : choice.name;
				lines.push(`${cursor} ${label}`);
			}

			// disabled choices at the end
			for (const choice of choices) {
				if (!choice.disabled) continue;
				const reason = typeof choice.disabled === "string" ? choice.disabled : "";
				lines.push(`  \x1b[2m${choice.name} ${reason}\x1b[0m`);
			}

			const output = lines.join("\n");
			if (!initial) {
				// 前回の描画をクリア
				const totalLines = choices.length + 1; // +1 for header
				process.stdout.write(`\x1b[${totalLines}A\x1b[J`);
			}
			process.stdout.write(`${output}\n`);
		}

		function cleanup() {
			process.stdin.removeListener("data", onData);
			if (process.stdin.isTTY) {
				process.stdin.setRawMode(wasRaw ?? false);
			}
			rl.close();
		}

		function onData(data: Buffer) {
			const key = data.toString();

			// Ctrl+C
			if (key === "\x03") {
				cleanup();
				// グローバルハンドラに任せる（一貫性のため）
				process.kill(process.pid, "SIGINT");
				return;
			}

			// Enter
			if (key === "\r" || key === "\n") {
				cleanup();
				const selectedIdx = enabledIndices[cursorPos];
				const result = choices[selectedIdx].value;
				// 最終行に選択結果を表示
				const totalLines = choices.length + 1;
				process.stdout.write(`\x1b[${totalLines}A\x1b[J`);
				process.stdout.write(`\x1b[1m? ${message}\x1b[0m \x1b[36m${choices[selectedIdx].name}\x1b[0m\n`);
				resolve(result);
				return;
			}

			// Arrow Up / k
			if (key === "\x1b[A" || key === "k") {
				cursorPos = (cursorPos - 1 + enabledIndices.length) % enabledIndices.length;
				render();
				return;
			}

			// Arrow Down / j
			if (key === "\x1b[B" || key === "j") {
				cursorPos = (cursorPos + 1) % enabledIndices.length;
				render();
				return;
			}

			// p: preview
			if (key === "p" && onPreview) {
				const selectedIdx = enabledIndices[cursorPos];
				onPreview(choices[selectedIdx].value);
				return;
			}
		}

		process.stdin.on("data", onData);
		render(true);
	});
}
