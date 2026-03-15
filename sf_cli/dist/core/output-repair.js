// Output repair — recovers truncated or malformed LLM responses.
// Structural repair only: brackets, fences, trailing commas.
// Never modifies content between delimiters.
// Temperature decay: retry with progressively lower temperatures on malformed output.
import { getLogger } from '../utils/logger.js';
// Default temperature decay sequence for retrying malformed output
export const TEMPERATURE_DECAY = [0.7, 0.4, 0.1];
/**
 * Repair malformed JSON: close unclosed brackets/braces,
 * remove trailing commas, strip markdown fences around JSON.
 */
export function repairJSON(raw) {
    const fixes = [];
    let text = raw.trim();
    // Strip markdown JSON fences (```json ... ```)
    const fenceMatch = text.match(/^```(?:json|JSON)?\s*\n([\s\S]*?)(?:```\s*)?$/);
    if (fenceMatch) {
        text = fenceMatch[1].trim();
        // Check if closing fence was missing
        if (!raw.trimEnd().endsWith('```')) {
            fixes.push('Stripped unclosed markdown JSON fence');
        }
        else {
            fixes.push('Stripped markdown JSON fences');
        }
    }
    // Remove trailing commas before } or ]
    const trailingCommaPattern = /,\s*([}\]])/g;
    const commaCount = (text.match(trailingCommaPattern) || []).length;
    if (commaCount > 0) {
        text = text.replace(trailingCommaPattern, '$1');
        fixes.push(`Removed ${commaCount} trailing comma(s)`);
    }
    // Count and close unclosed brackets/braces
    // Track nesting order with a stack so closers are applied in correct order
    const stack = [];
    let inString = false;
    let escape = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (escape) {
            escape = false;
            continue;
        }
        if (ch === '\\' && inString) {
            escape = true;
            continue;
        }
        if (ch === '"') {
            inString = !inString;
            continue;
        }
        if (inString)
            continue;
        if (ch === '{')
            stack.push('{');
        else if (ch === '}') {
            if (stack.length > 0 && stack[stack.length - 1] === '{')
                stack.pop();
        }
        else if (ch === '[')
            stack.push('[');
        else if (ch === ']') {
            if (stack.length > 0 && stack[stack.length - 1] === '[')
                stack.pop();
        }
    }
    // Close unclosed strings (if we ended inside a string)
    if (inString) {
        text += '"';
        fixes.push('Closed unclosed string literal');
    }
    // Remove any trailing comma before we close
    text = text.replace(/,\s*$/, '');
    // Close unclosed structures in reverse nesting order
    if (stack.length > 0) {
        let braces = 0;
        let brackets = 0;
        const closers = [];
        for (let i = stack.length - 1; i >= 0; i--) {
            if (stack[i] === '{') {
                closers.push('}');
                braces++;
            }
            else {
                closers.push(']');
                brackets++;
            }
        }
        text += closers.join('');
        if (brackets > 0)
            fixes.push(`Closed ${brackets} unclosed bracket(s)`);
        if (braces > 0)
            fixes.push(`Closed ${braces} unclosed brace(s)`);
    }
    return {
        repaired: text,
        fixes,
        wasRepaired: fixes.length > 0,
    };
}
/**
 * Detect and close unclosed markdown code fences.
 * Handles ``` with optional language identifier.
 */
export function repairCodeBlocks(raw) {
    const fixes = [];
    const fencePattern = /^(`{3,})\w*\s*$/gm;
    const fences = [];
    let match;
    while ((match = fencePattern.exec(raw)) !== null) {
        fences.push({ index: match.index, marker: match[1] });
    }
    // Odd number of fences = unclosed block
    if (fences.length % 2 !== 0) {
        const lastFence = fences[fences.length - 1];
        fixes.push(`Closed unclosed code block (${lastFence.marker})`);
        return {
            repaired: raw + '\n' + lastFence.marker,
            fixes,
            wasRepaired: true,
        };
    }
    return { repaired: raw, fixes, wasRepaired: false };
}
/**
 * Orchestrator: attempt JSON repair, then code block repair.
 * Logs all repairs to session log.
 */
export function repairLLMOutput(raw) {
    const allFixes = [];
    let text = raw;
    // Try JSON repair if the content looks like JSON
    const trimmed = text.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('```json')) {
        const jsonResult = repairJSON(text);
        if (jsonResult.wasRepaired) {
            text = jsonResult.repaired;
            allFixes.push(...jsonResult.fixes);
        }
    }
    // Try code block repair
    const codeResult = repairCodeBlocks(text);
    if (codeResult.wasRepaired) {
        text = codeResult.repaired;
        allFixes.push(...codeResult.fixes);
    }
    if (allFixes.length > 0) {
        const log = getLogger();
        for (const fix of allFixes) {
            log.info('repair', 'output_repaired', { fix });
        }
    }
    return {
        repaired: text,
        fixes: allFixes,
        wasRepaired: allFixes.length > 0,
    };
}
/**
 * Validate that a string is parseable JSON.
 */
export function isValidJSON(text) {
    try {
        JSON.parse(text);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Retry an LLM call with progressively lower temperatures when output is malformed.
 * On each failed attempt:
 *   1. Try to repair the output structurally
 *   2. If repair succeeds and validates, return it
 *   3. Otherwise, retry with next lower temperature
 *   4. After all attempts, return the best repair or throw
 */
export async function withTemperatureDecay(opts) {
    const log = getLogger();
    const temps = opts.temperatures ?? TEMPERATURE_DECAY;
    const validate = opts.validate ?? isValidJSON;
    const attemptRepair = opts.attemptRepair ?? true;
    let bestRepair = null;
    for (let i = 0; i < temps.length; i++) {
        const temp = temps[i];
        try {
            const raw = await opts.callLLM(temp);
            // If output validates directly, return it
            if (validate(raw)) {
                return {
                    output: raw,
                    temperature: temp,
                    attempt: i + 1,
                    repaired: false,
                    fixes: [],
                };
            }
            // Attempt structural repair
            if (attemptRepair) {
                const repairResult = repairLLMOutput(raw);
                if (validate(repairResult.repaired)) {
                    return {
                        output: repairResult.repaired,
                        temperature: temp,
                        attempt: i + 1,
                        repaired: true,
                        fixes: repairResult.fixes,
                    };
                }
                // Track the best repair in case all attempts fail
                if (!bestRepair || repairResult.fixes.length > 0) {
                    bestRepair = {
                        output: repairResult.repaired,
                        temperature: temp,
                        attempt: i + 1,
                        repaired: repairResult.wasRepaired,
                        fixes: repairResult.fixes,
                    };
                }
            }
            log.warn('repair', 'temperature_decay_retry', {
                attempt: i + 1,
                temperature: temp,
                nextTemperature: i < temps.length - 1 ? temps[i + 1] : 'none',
            });
        }
        catch (err) {
            log.error('repair', 'temperature_decay_error', {
                attempt: i + 1,
                temperature: temp,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
    // All attempts failed — return best repair if we have one
    if (bestRepair) {
        log.warn('repair', 'temperature_decay_exhausted', {
            attempts: temps.length,
            returningBestRepair: true,
        });
        return bestRepair;
    }
    throw new Error(`Temperature decay exhausted after ${temps.length} attempts. No valid or repairable output produced.`);
}
//# sourceMappingURL=output-repair.js.map