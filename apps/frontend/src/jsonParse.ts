export interface ParseResult {
  ok: boolean;
  data?: unknown;
  message?: string;
}

function stripCodeFence(text: string): string {
  const match = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1] : text;
}

function stripTrailingCommas(text: string): string {
  return text.replace(/,(\s*[}\]])/g, '$1');
}

function locate(text: string, position: number): { line: number; column: number; snippet: string } {
  const before = text.slice(0, position);
  const line = (before.match(/\n/g)?.length ?? 0) + 1;
  const lastNewline = before.lastIndexOf('\n');
  const column = position - lastNewline;

  const start = Math.max(0, position - 30);
  const end = Math.min(text.length, position + 30);
  const pointerOffset = position - start;
  const snippetLine = text.slice(start, end).replace(/\n/g, '⏎');
  const pointer = `${' '.repeat(Math.max(0, pointerOffset))}^`;
  const snippet = `${snippetLine}\n${pointer}`;

  return { line, column, snippet };
}

/** Parses a pasted/uploaded hunt export, tolerating common paste artifacts
 * (BOM, markdown code fences, trailing commas) and producing a message that
 * points at exactly where a genuine parse failure is, so a real export
 * malformation can be diagnosed instead of guessed at. */
export function parseHuntJson(raw: string): ParseResult {
  let cleaned = raw.replace(/^﻿/, '').trim();
  cleaned = stripCodeFence(cleaned).trim();

  try {
    return { ok: true, data: JSON.parse(cleaned) };
  } catch (firstError) {
    const withoutTrailingCommas = stripTrailingCommas(cleaned);
    if (withoutTrailingCommas !== cleaned) {
      try {
        return { ok: true, data: JSON.parse(withoutTrailingCommas) };
      } catch {
        // fall through to report the original error below
      }
    }

    const err = firstError as SyntaxError;
    const positionMatch = err.message.match(/position (\d+)/);
    if (positionMatch) {
      const position = Number(positionMatch[1]);
      const { line, column, snippet } = locate(cleaned, position);
      return {
        ok: false,
        message: `JSON inválido na linha ${line}, coluna ${column}:\n${snippet}\n\n(${err.message})`,
      };
    }

    return { ok: false, message: `JSON inválido: ${err.message}` };
  }
}
