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

import { ArrowFunctionToFunctionTransformer } from "./transformers/arrowFunctionToFunctionTransformer";
import { NodeTransformer } from "./transformers/transformers";

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
