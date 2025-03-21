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

import { decode } from "@msgpack/msgpack";
import {
  CompiledProgram,
  FORMAT_VERSION,
  MAGIC_HEADER,
  MINIMAL_AST_KEYS,
} from ".";
import { gunzipSync } from "zlib";
import { readFileSync } from "fs";
import generate from "@babel/generator";
import { templateElement } from "@babel/types";

function generateShortName(index: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let name = "";
  do {
    name = chars[index % chars.length] + name;
    index = Math.floor(index / chars.length) - 1;
  } while (index >= 0);
  return name;
}

export function loadFromFile(filename: string): CompiledProgram {
  const file = readFileSync(filename);
  const magic = file.subarray(0, 4);
  const version = file[4];

  if (
    magic[0] !== MAGIC_HEADER[0] ||
    magic[1] !== MAGIC_HEADER[1] ||
    magic[2] !== MAGIC_HEADER[2] ||
    magic[3] !== MAGIC_HEADER[3]
  ) {
    throw new Error("Invalid file format: bad magic number");
  }
  if (version !== FORMAT_VERSION[0]) {
    throw new Error(
      `Unsupported version: ${version} | Current version: ${FORMAT_VERSION[0]}`
    );
  }

  const compressed = file.subarray(5);
  const decoded = decode(gunzipSync(compressed));
  const [expressionDict, valueDict, bytecode] = decoded as [
    string[],
    any[],
    any[]
  ];

  return { expressionDict, valueDict, bytecode };
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

export function run(compiled: CompiledProgram) {
  const code = generateJSCode(compiled);

  const fn = new Function(code);
  return fn();
}
