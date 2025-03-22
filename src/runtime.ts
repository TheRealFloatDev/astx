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
import { createRequire } from "module";
import path from "path";

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

type RunMode = "eval" | "scoped" | "vm";

interface RunOptions {
  mode?: RunMode;
  inject?: Record<string, any>;
}

/**
 * Runs a compiled program.
 * @param compiled The compiled program
 * @param options The run options
 * @returns The result of the program (a Promise in VM mode)
 */
export function run(compiled: CompiledProgram, options: RunOptions = {}) {
  const code = generateJSCode(compiled);
  const mode: RunMode = options.mode ?? "eval";
  const inject = options.inject ?? {};

  const defaultInjects = {
    require: typeof require !== "undefined" ? require : undefined,
    import: (path: string) => import(path), // dynamic import for ESM
    process: process,
    console: console,
  };

  const context = { ...defaultInjects, ...inject };

  if (mode !== "vm" && !context.require) {
    console.warn(
      "[ASTX Runtime] Warning: 'require' seems not to be available in the current environment."
    );
  }

  if (mode === "eval") {
    // ✅ Simple eval, runs in current scope
    Object.assign(globalThis, context); // inject into global if needed
    return eval(code);
  }

  if (mode === "scoped") {
    // ✅ Use Function constructor with manual injection
    const argNames = Object.keys(context);
    const argValues = Object.values(context);
    const fn = new Function(...argNames, code);
    return fn(...argValues);
  }

  if (mode === "vm") {
    // ✅ Node.js only sandbox
    if (
      typeof process === "undefined" ||
      typeof process.versions?.node === "undefined"
    ) {
      throw new Error("VM mode is only supported in Node.js environments.");
    }

    const directory = inject.__dirname ?? process.cwd();
    const scopedRequire = (modulePath: string) => {
      if (path.isAbsolute(modulePath) || !modulePath.startsWith(".")) {
        return require(modulePath); // absolute path or bare module
      }

      const resolved = path.resolve(directory, modulePath); // relative
      return require(resolved);
    };

    return (async () => {
      const { default: vm } = await import("vm"); // 👈 dynamic import
      const vmContext = vm.createContext({
        __dirname: directory,
        __filename: path.join(directory, "index.js"), // default filename
        ...context,
        require: scopedRequire,
      });
      const script = new vm.Script(code);
      return script.runInContext(vmContext);
    })();
  }

  throw new Error(`Unknown run mode: ${mode}`);
}
