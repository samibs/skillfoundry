import { marked, type MarkedExtension } from 'marked';

let initialized = false;

async function ensureRenderer(): Promise<void> {
  if (initialized) return;
  const mt = await import('marked-terminal');
  const renderer = mt.markedTerminal() as MarkedExtension;
  marked.use(renderer);
  initialized = true;
}

export function renderMarkdown(text: string): string {
  if (!text) return '';
  // Synchronous render — renderer should be initialized before first call
  try {
    return (marked.parse(text) as string).trimEnd();
  } catch {
    return text;
  }
}

export { ensureRenderer };
