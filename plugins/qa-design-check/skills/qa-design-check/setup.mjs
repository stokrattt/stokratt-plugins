#!/usr/bin/env node
import { saveToken, getToken, configFile } from './lib/store.mjs';

const token = process.argv[2];

if (!token) {
    console.log(
        getToken()
            ? `Token already saved: ${configFile()}`
            : [
                  'No Figma token yet. One-time setup:',
                  '',
                  '1. Figma → avatar → Settings → Security → Personal access tokens → Generate new token',
                  '2. The only scope needed: File content: Read',
                  `3. node ${new URL(import.meta.url).pathname} figd_...`,
                  '',
                  `Stored in ${configFile()} with chmod 600, outside any repository, so it never reaches git.`,
              ].join('\n'),
    );
    process.exit(getToken() ? 0 : 1);
}

if (!/^figd_/.test(token)) {
    console.error('This does not look like a Figma token: a Figma token starts with figd_');
    process.exit(1);
}

console.log(`Token saved: ${saveToken(token)}`);
