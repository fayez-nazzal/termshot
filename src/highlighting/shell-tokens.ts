import type { Highlighter, HighlightRole, Token } from "./highlighter.ts";

const OPERATORS = ["2>>", "2>&", "||", "&&", ">>", "2>", ">&", "&>", "|", ";", "&", ">", "<", "(", ")"];
const COMMAND_OPENERS = new Set(["||", "&&", "|", ";", "&", "("]);
const WORD_BREAKS = new Set([" ", "\t", "|", ";", "&", "<", ">", "(", ")", "'", '"', "$"]);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

function quotedEnd(input: string, start: number): number {
  const quote = input[start];
  let end = start + 1;
  while (end < input.length && input[end] !== quote) {
    end += quote === '"' && input[end] === "\\" ? 2 : 1;
  }
  return Math.min(end + 1, input.length);
}

function variableEnd(input: string, start: number): number {
  const next = input[start + 1];
  let end = start + 1;
  if (next === "{") {
    const close = input.indexOf("}", start);
    end = close === -1 ? input.length : close + 1;
  } else if (next !== undefined && /[?0-9]/.test(next)) {
    end = start + 2;
  } else {
    while (end < input.length && /[A-Za-z0-9_]/.test(input[end]!)) end++;
  }
  return end;
}

function wordEnd(input: string, start: number): number {
  let end = start;
  while (end < input.length && !WORD_BREAKS.has(input[end]!)) end++;
  return Math.max(end, start + 1);
}

function wordRole(word: string, commandPosition: boolean): HighlightRole {
  let role: HighlightRole = "argument";
  if (commandPosition) {
    role = ASSIGNMENT.test(word) ? "variable" : "command";
  } else if (word.startsWith("-")) {
    role = "flag";
  } else if (word.includes("/") || word.startsWith("~") || word.startsWith(".")) {
    role = "path";
  }
  return role;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let commandPosition = true;
  let atWordStart = true;
  let inAssignmentValue: boolean = false;
  let index = 0;
  while (index < input.length) {
    const char = input[index]!;
    let end = index;
    let role: HighlightRole;
    if (char === " " || char === "\t") {
      while (end < input.length && (input[end] === " " || input[end] === "\t")) end++;
      role = "whitespace";
      atWordStart = true;
      inAssignmentValue = false;
    } else if (char === "#" && atWordStart) {
      end = input.length;
      role = "comment";
    } else {
      const operator = OPERATORS.find((op) => input.startsWith(op, index) && (!op.startsWith("2") || atWordStart));
      if (operator !== undefined) {
        end = index + operator.length;
        role = "operator";
        commandPosition = COMMAND_OPENERS.has(operator) ? true : commandPosition;
        atWordStart = true;
        inAssignmentValue = false;
      } else {
        if (char === "'" || char === '"') {
          end = quotedEnd(input, index);
          role = "string";
        } else if (char === "$") {
          end = variableEnd(input, index);
          role = "variable";
        } else {
          end = wordEnd(input, index);
          role = wordRole(input.slice(index, end), commandPosition);
        }
        const isAssignment: boolean = role === "variable" && ASSIGNMENT.test(input.slice(index, end));
        const attachedValue: boolean = inAssignmentValue && (role === "string" || role === "variable");
        commandPosition = isAssignment || attachedValue ? commandPosition : false;
        inAssignmentValue = isAssignment || attachedValue;
        atWordStart = false;
      }
    }
    tokens.push({ text: input.slice(index, end), role });
    index = end;
  }
  return tokens;
}

export const shellTokens: Highlighter = { tokenize };
