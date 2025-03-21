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

import { encode } from "@msgpack/msgpack";
import { CompiledProgram } from ".";
import { ArrowFunctionToFunctionTransformer } from "./transformers/arrowFunctionToFunctionTransformer";
import { NodeTransformer } from "./transformers/transformers";
import * as babelParser from "@babel/parser";
import { gzipSync } from "zlib";
import { writeFileSync } from "fs";

const TRANSFORMERS: NodeTransformer[] = [ArrowFunctionToFunctionTransformer];

const MINIMAL_AST_KEYS: Record<string, string[]> = {
  // Program structure
  Program: ["body", "sourceType"],
  BlockStatement: ["body"],

  // Declarations
  VariableDeclaration: ["declarations", "kind"],
  VariableDeclarator: ["id", "init"],
  FunctionDeclaration: ["id", "params", "body"],

  // Expressions
  BinaryExpression: ["left", "operator", "right"],
  UpdateExpression: ["operator", "argument", "prefix"],
  AssignmentExpression: ["left", "operator", "right"],
  CallExpression: ["callee", "arguments"],
  MemberExpression: ["object", "property", "computed"],
  ArrowFunctionExpression: ["params", "body", "expression"],
  ExpressionStatement: ["expression"],
  NewExpression: ["callee", "arguments"],
  UnaryExpression: ["operator", "argument", "prefix"],
  LogicalExpression: ["left", "operator", "right"],
  ConditionalExpression: ["test", "consequent", "alternate"],
  ObjectExpression: ["properties"],
  ArrayExpression: ["elements"],
  ClassExpression: ["id", "superClass", "body"],
  ThisExpression: [],
  AwaitExpression: ["argument"],

  // Statements
  IfStatement: ["test", "consequent", "alternate"],
  ForStatement: ["init", "test", "update", "body"],
  WhileStatement: ["test", "body"],
  ReturnStatement: ["argument"],
  ForOfStatement: ["left", "right", "body"],
  ContinueStatement: ["label"],
  BreakStatement: ["label"],
  ThrowStatement: ["argument"],
  SwitchStatement: ["discriminant", "cases"],

  // Literals and Identifiers
  Identifier: ["name"],
  Literal: ["value"],
  NumericLiteral: ["value"],
  StringLiteral: ["value"],
  BooleanLiteral: ["value"],
  NullLiteral: [],
  RegExpLiteral: ["pattern", "flags"],
  TemplateLiteral: ["quasis", "expressions"],

  // Elements
  RestElement: ["argument"],
  SpreadElement: ["argument"],
  TemplateElement: ["value", "tail"],

  // Patterns
  AssignmentPattern: ["left", "right"],
  ObjectPattern: ["properties"],

  // Other
  ObjectProperty: ["key", "value"],
  ClassBody: ["body"],
  ClassMethod: ["key", "params", "body"],
  SwitchCase: ["test", "consequent"],
  null: [],
};

function collectDeclaredVariables(ast: any): Set<string> {
  const declared = new Set<string>();
  function walk(node: any) {
    if (!node || typeof node !== "object") return;
    if (node.type === "VariableDeclarator" && node.id?.name) {
      declared.add(node.id.name);
    }
    if (
      node.type === "FunctionDeclaration" ||
      node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression"
    ) {
      if (node.id?.name) declared.add(node.id.name);
      node.params?.forEach((param: any) => {
        if (param.type === "Identifier") declared.add(param.name);
      });
    }
    for (const key in node) {
      const value = node[key];
      if (Array.isArray(value)) value.forEach(walk);
      else if (typeof value === "object" && value !== null) walk(value);
    }
  }
  walk(ast);
  return declared;
}

export function compile(jsCode: string): CompiledProgram {
  const ast = babelParser.parse(jsCode, { sourceType: "module" });
  const valueDict: any[] = [];
  const expressionDict: string[] = [];
  const exprMap = new Map<string, number>();
  const bytecode: any[] = [];

  const declaredVars = collectDeclaredVariables(ast);
  const seenVars = new Map<string, number>();
  let varCounter = 0;

  function encode(node: any): number | undefined {
    if (!node || typeof node !== "object") return;

    // Check for transformers
    for (const transformer of TRANSFORMERS) {
      if (transformer.nodeType === node.type && transformer.test(node)) {
        return encode(transformer.transform(node));
      }
    }

    // Check if type is currently unsupported
    if (node.type && !MINIMAL_AST_KEYS[node.type]) {
      console.error("Unsupported node type:", node.type);

      process.exit(1);
    }

    const type = node.type || "null";
    let typeIndex = exprMap.get(type);
    if (typeIndex === undefined) {
      typeIndex = expressionDict.length;
      exprMap.set(type, typeIndex);
      expressionDict.push(type);
    }

    const keys = MINIMAL_AST_KEYS[type] || [];
    const values: any[] = [];

    if (type === "TemplateElement") {
      let index = valueDict.findIndex(
        (v) => v && v.raw === node.value.raw && v.cooked === node.value.cooked
      );
      if (index === -1) {
        index = valueDict.length;
        valueDict.push(node.value);
      }
      values.push(index, node.tail);
      const nodeArr = [typeIndex, ...values];
      bytecode.push(nodeArr);
      return bytecode.length - 1;
    }

    for (const key of keys) {
      const value = node[key];

      if (key === "name" && type === "Identifier" && declaredVars.has(value)) {
        if (!seenVars.has(value)) {
          seenVars.set(value, varCounter++);
        }
        values.push(seenVars.get(value));
      } else if (
        key === "value" &&
        (type === "Literal" || type.endsWith("Literal"))
      ) {
        let index = valueDict.indexOf(value);
        if (index === -1) {
          index = valueDict.length;
          valueDict.push(value);
        }
        values.push(index);
      } else if (Array.isArray(value)) {
        values.push(value.map((v) => (typeof v === "object" ? encode(v) : v)));
      } else if (typeof value === "object" && value !== null) {
        values.push(encode(value));
      } else {
        values.push(value);
      }
    }

    const nodeArr = [typeIndex, ...values];
    bytecode.push(nodeArr);
    return bytecode.length - 1;
  }

  encode(ast.program); // Skip the File wrapper

  return {
    expressionDict,
    valueDict,
    bytecode,
  };
}

export function saveToFile(program: CompiledProgram, filename: string) {
  const encoded = encode([
    program.expressionDict,
    program.valueDict,
    program.bytecode,
  ]);
  const magic = Buffer.from([0xa5, 0x7b, 0x1c, 0x00]); // custom magic header
  const version = Buffer.from([0x01]); // format version
  const compressed = gzipSync(encoded);
  const full = Buffer.concat([magic, version, compressed]);
  writeFileSync(filename, full);
}
