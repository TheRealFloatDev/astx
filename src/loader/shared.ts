/*
 *   Copyright (c) 2025 Alexander Neitzel

 *   This program is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.

 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU General Public License for more details.

 *   You should have received a copy of the GNU General Public License
 *   along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/*
 *   Copyright (c) 2025 Alexander Neitzel

 *   This program is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.

 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU General Public License for more details.

 *   You should have received a copy of the GNU General Public License
 *   along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { CompiledProgram, MINIMAL_AST_KEYS } from "..";
import generate from "@babel/generator";
import { templateElement } from "@babel/types";

const RESERVED_WORDS = new Set([
  "abstract",
  "await",
  "boolean",
  "break",
  "byte",
  "case",
  "catch",
  "char",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "double",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "final",
  "finally",
  "float",
  "for",
  "function",
  "goto",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "int",
  "interface",
  "let",
  "long",
  "native",
  "new",
  "null",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "short",
  "static",
  "super",
  "switch",
  "synchronized",
  "this",
  "throw",
  "throws",
  "transient",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "volatile",
  "while",
  "with",
  "yield",
]);

function generateShortName(index: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let name = "";
  do {
    name = chars[index % chars.length] + name;
    index = Math.floor(index / chars.length) - 1;
  } while (index >= 0);

  // If the name is a reserved word, add an underscore
  if (RESERVED_WORDS.has(name)) {
    name = "_" + name;
  }

  return name;
}

function decodeToAST(compiled: CompiledProgram): any {
  const { expressionDict, valueDict, bytecode } = compiled;

  function decode(index: number): any {
    const node = bytecode[index];
    if (!Array.isArray(node)) return;

    const [typeIndex, ...args] = node;
    const type = expressionDict[typeIndex];
    let obj: any;
    if (type === "TemplateElement") {
      const [valueArg, tailArg] = args;
      obj = templateElement(valueDict[valueArg], tailArg);
      obj.type = "TemplateElement";
      return obj;
    } else {
      obj = { type };
    }

    const keys = MINIMAL_AST_KEYS[type] || [];
    keys.forEach((key: string, i: number) => {
      const arg = args[i];

      if (type === "Identifier" && key === "name") {
        if (typeof arg === "number") {
          obj.name = generateShortName(arg);
        } else {
          obj.name = arg;
        }
      } else if (
        (type === "Literal" || type.endsWith("Literal")) &&
        key === "value"
      ) {
        obj.value = valueDict[arg];
      } else if (Array.isArray(arg)) {
        obj[key] = arg.map((a) => (typeof a === "number" ? decode(a) : a));
      } else if (typeof arg === "number" && bytecode[arg]) {
        obj[key] = decode(arg);
      } else {
        obj[key] = arg;
      }
    });

    return obj;
  }

  return decode(bytecode.length - 1);
}

export function generateJSCode(compiled: CompiledProgram): string {
  const ast = decodeToAST(compiled);
  const { code } = generate(ast);
  return code;
}
