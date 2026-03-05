import { marked } from 'marked';
let initialized = false;
async function ensureRenderer() {
    if (initialized)
        return;
    const mt = await import('marked-terminal');
    const renderer = mt.markedTerminal();
    marked.use(renderer);
    initialized = true;
}
export function renderMarkdown(text) {
    if (!text)
        return '';
    // Synchronous render — renderer should be initialized before first call
    try {
        return marked.parse(text).trimEnd();
    }
    catch {
        return text;
    }
}
export { ensureRenderer };
//# sourceMappingURL=markdown.js.map