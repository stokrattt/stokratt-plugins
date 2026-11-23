import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export const CONFIG_DIR = join(homedir(), '.config', 'qa-design-check');

const ensure = (dir) => {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
};

const readJson = (file, fallback) => {
    try {
        return JSON.parse(readFileSync(file, 'utf8'));
    } catch {
        return fallback;
    }
};

const writeJson = (file, data) => {
    ensure(join(file, '..'));
    writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 });
};

export const configFile = () => join(CONFIG_DIR, 'config.json');

export function readSettings() {
    return readJson(configFile(), {});
}

export function saveToken(token) {
    const settings = readSettings();
    settings.figmaToken = token;
    writeJson(configFile(), settings);
    return configFile();
}

/**
 * The token never lives in a repo, the skill may be installed anywhere, and
 * a project's env file belongs to that project only.
 */
export function getToken() {
    return process.env.FIGMA_TOKEN || readSettings().figmaToken || null;
}

const acceptedFile = (fileKey, nodeId) => join(CONFIG_DIR, 'accepted', `${fileKey}-${nodeId.replace(':', '-')}.json`);

export function readAccepted(fileKey, nodeId, lastModified) {
    const entries = readJson(acceptedFile(fileKey, nodeId), []);
    // A reworked mock invalidates old agreements, show those deviations again.
    return entries.filter((e) => !lastModified || e.frameLastModified === lastModified);
}

export function saveAccepted(fileKey, nodeId, entries) {
    writeJson(acceptedFile(fileKey, nodeId), entries);
    return acceptedFile(fileKey, nodeId);
}

export const acceptKey = (finding) => `${finding.figmaId}|${finding.prop}|${finding.expected}|${finding.actual}`;

export function runDir(stamp) {
    const dir = join(CONFIG_DIR, 'runs', stamp);
    ensure(dir);
    return dir;
}

/** Remembers which clicks opened the state a mock depicts, so later runs skip the hunt. */
export function readStatePath(fileKey, nodeId) {
    return readJson(join(CONFIG_DIR, 'cache', `${fileKey}-${nodeId.replace(':', '-')}.json`), null);
}

export function saveStatePath(fileKey, nodeId, steps) {
    writeJson(join(CONFIG_DIR, 'cache', `${fileKey}-${nodeId.replace(':', '-')}.json`), steps);
}
