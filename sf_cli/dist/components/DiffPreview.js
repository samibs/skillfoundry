import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { Box, Text } from 'ink';
import { colors, symbols, borders } from '../utils/theme.js';
export function parseDiff(rawDiff) {
    const files = [];
    const diffLines = rawDiff.split('\n');
    let currentFile = '';
    let currentLines = [];
    for (const line of diffLines) {
        if (line.startsWith('diff --git')) {
            if (currentFile && currentLines.length > 0) {
                files.push({ fileName: currentFile, lines: currentLines });
            }
            const match = line.match(/b\/(.+)$/);
            currentFile = match ? match[1] : 'unknown';
            currentLines = [];
        }
        else if (line.startsWith('@@')) {
            currentLines.push({ type: 'header', content: line });
        }
        else if (line.startsWith('+') && !line.startsWith('+++')) {
            currentLines.push({ type: 'add', content: line.slice(1) });
        }
        else if (line.startsWith('-') && !line.startsWith('---')) {
            currentLines.push({ type: 'remove', content: line.slice(1) });
        }
        else if (line.startsWith(' ')) {
            currentLines.push({ type: 'context', content: line.slice(1) });
        }
    }
    if (currentFile && currentLines.length > 0) {
        files.push({ fileName: currentFile, lines: currentLines });
    }
    return files;
}
export function DiffPreview({ fileName, lines, maxLines = 50 }) {
    const displayLines = lines.slice(0, maxLines);
    const truncated = lines.length > maxLines;
    const additions = lines.filter((l) => l.type === 'add').length;
    const deletions = lines.filter((l) => l.type === 'remove').length;
    return (_jsxs(Box, { flexDirection: "column", marginBottom: 1, borderStyle: borders.card, borderColor: colors.borderDim, paddingX: 1, children: [_jsxs(Box, { children: [_jsxs(Text, { bold: true, color: colors.textPrimary, children: [symbols.diamond, " ", fileName, ' '] }), _jsxs(Text, { color: colors.success, children: ["+", additions] }), _jsx(Text, { color: colors.textMuted, children: " / " }), _jsxs(Text, { color: colors.error, children: ["-", deletions] })] }), _jsxs(Box, { flexDirection: "column", paddingLeft: 1, children: [displayLines.map((line, i) => {
                        switch (line.type) {
                            case 'add':
                                return (_jsxs(Text, { color: colors.success, wrap: "truncate", children: ["+ ", line.content] }, i));
                            case 'remove':
                                return (_jsxs(Text, { color: colors.error, wrap: "truncate", children: ["- ", line.content] }, i));
                            case 'header':
                                return (_jsx(Text, { color: colors.secondary, wrap: "truncate", children: line.content }, i));
                            case 'context':
                                return (_jsxs(Text, { color: colors.textMuted, wrap: "truncate", children: ['  ', line.content] }, i));
                        }
                    }), truncated && (_jsxs(Text, { color: colors.textMuted, italic: true, children: [symbols.lineLight.repeat(20), " ", lines.length - maxLines, " more lines"] }))] })] }));
}
//# sourceMappingURL=DiffPreview.js.map