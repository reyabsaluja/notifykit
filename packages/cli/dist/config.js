import { existsSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
export function defineConfig(config) {
    return config;
}
const DEFAULT_CONFIG_PATHS = [
    "notifykit.config.ts",
    "notifykit.config.js",
    "notifykit.config.mjs",
];
export async function loadConfig(cwd, explicitPath) {
    const candidate = explicitPath
        ? resolve(cwd, explicitPath)
        : findDefaultConfigPath(cwd);
    if (!candidate) {
        throw new ConfigError(`No NotifyKit config found. Expected one of: ${DEFAULT_CONFIG_PATHS.join(", ")} in ${cwd}`);
    }
    if (!existsSync(candidate) || !statSync(candidate).isFile()) {
        throw new ConfigError(`Config file not found: ${candidate}`);
    }
    const url = pathToFileURL(candidate).href;
    const mod = (await import(url));
    const config = mod.default ?? mod.config;
    if (!config) {
        throw new ConfigError(`Config file ${candidate} must default-export a config object (use defineConfig()).`);
    }
    validateConfigShape(config, candidate);
    return { config, path: candidate };
}
function findDefaultConfigPath(cwd) {
    for (const name of DEFAULT_CONFIG_PATHS) {
        const full = resolve(cwd, name);
        if (existsSync(full))
            return full;
    }
    return null;
}
function validateConfigShape(config, path) {
    if (!config || typeof config !== "object") {
        throw new ConfigError(`Config at ${path} is not an object.`);
    }
    const c = config;
    if (!Array.isArray(c.notifications)) {
        throw new ConfigError(`Config at ${path} is missing a "notifications" array.`);
    }
    for (const [i, def] of c.notifications.entries()) {
        if (!def || typeof def !== "object") {
            throw new ConfigError(`Config at ${path}: notifications[${i}] is not an object.`);
        }
        const d = def;
        if (typeof d.id !== "string") {
            throw new ConfigError(`Config at ${path}: notifications[${i}] is missing "id".`);
        }
        if (!d.payload || typeof d.payload !== "object") {
            throw new ConfigError(`Config at ${path}: notification "${d.id}" is missing "payload".`);
        }
        if (!Array.isArray(d.channels)) {
            throw new ConfigError(`Config at ${path}: notification "${d.id}" is missing "channels".`);
        }
    }
}
export class ConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = "ConfigError";
    }
}
//# sourceMappingURL=config.js.map