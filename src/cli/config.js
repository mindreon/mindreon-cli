import { homedir } from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import process from "node:process";

export const CONFIG_DIR =
    process.env.XDG_CONFIG_HOME
        ? path.join(process.env.XDG_CONFIG_HOME, "mindreon")
        : path.join(homedir(), ".config", "mindreon");

export const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export async function loadConfig() {
    try {
        const data = await fs.readFile(CONFIG_FILE, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        if (error.code === "ENOENT") {
            return {};
        }
        throw error;
    }
}

export async function saveConfig(config) {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    const current = await loadConfig();
    const next = { ...current, ...config };
    await fs.writeFile(CONFIG_FILE, JSON.stringify(next, null, 2), "utf-8");
    return next;
}
