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

/**
 * The representation of an ASTX compiled program.
 */
export interface CompiledProgram {
  /**
   * The dictionary of expressions used in the program.
   * The expressions are stored as strings.
   */
  expressionDict: string[];
  /**
   * The dictionary of values used in the program.
   * The values are stored as strings.
   */
  valueDict: any[];
  /**
   * The dictionary of AST nodes used in the program.
   * The AST nodes are stored in a custom format.
   */
  bytecode: any[];
}

export const MAGIC_HEADER = Buffer.from([0xa5, 0x7b, 0x1c, 0x00]);
export const FORMAT_VERSION = Buffer.from([0x01]);

export const MINIMAL_AST_KEYS: Record<string, string[]> = {
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
