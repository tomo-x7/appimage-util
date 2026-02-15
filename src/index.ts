import { Command } from "commander";
import { installCommand } from "./cmd-install.js";
import { updateCommand } from "./cmd-update.js";
import { editCommand } from "./cmd-edit.js";
import { uninstallCommand } from "./cmd-uninstall.js";

const program = new Command();

program
	.name("appimage-util")
	.description("AppImage とデスクトップエントリの管理ユーティリティ")
	.version("1.0.0")
	.action(() => {
		program.outputHelp();
	});

program
	.command("install")
	.description("AppImage を管理下に導入し、デスクトップエントリを生成する")
	.argument("<appimage-path>", "AppImage ファイルへのパス")
	.argument("[appname]", "アプリ識別子（省略時は質問で入力）")
	.action(async (appImagePath: string, appname?: string) => {
		await installCommand(appImagePath, appname);
	});

program
	.command("update")
	.description("管理下の AppImage を新しいバージョンで更新する")
	.argument("<appimage-path>", "新しい AppImage ファイルへのパス")
	.option("--force", "同一ハッシュでも強制的に更新する", false)
	.action(async (appImagePath: string, opts: { force: boolean }) => {
		await updateCommand(appImagePath, opts.force);
	});

program
	.command("edit")
	.description("管理下のアプリのデスクトップエントリを編集する")
	.action(async () => {
		await editCommand();
	});

program
	.command("uninstall")
	.description("管理下のアプリを削除する")
	.action(async () => {
		await uninstallCommand();
	});

program.parse();