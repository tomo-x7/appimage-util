import { homedir } from "os";
import { join } from "path";

export const APPIMAGE_ROOT = join(homedir(), ".appimages");
export const DESKTOP_DIR = join(homedir(), ".local", "share", "applications");

export const APPNAME_REGEX = /^[a-z0-9][a-z0-9_-]{0,62}$/;

export const CATEGORIES = [
	"Development",
	"Education",
	"Games",
	"Graphics",
	"Internet",
	"Multimedia",
	"Office",
	"Science",
	"Settings",
	"System",
	"Utilities",
] as const;

export type Category = (typeof CATEGORIES)[number];
