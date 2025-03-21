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

import * as t from "@babel/types";
import { NodeTransformer, TransformContext } from "./transformers";

export const ConstantFoldingTransformer: NodeTransformer<t.BinaryExpression> = {
  key: "constant-folding",
  displayName:
    "Constant Folding (Compile-time Evaluation of Binary Expressions)",
  nodeTypes: ["BinaryExpression"],
  phases: ["pre", "main", "post"], // Explcitly run in all phases

  test(node): node is t.BinaryExpression {
    return (
      t.isBinaryExpression(node) &&
      isLiteral(node.left) &&
      isLiteral(node.right)
    );
  },

  transform(node, _context: TransformContext): t.Expression {
    const left = node.left as
      | t.NumericLiteral
      | t.StringLiteral
      | t.BooleanLiteral;
    const right = node.right as
      | t.NumericLiteral
      | t.StringLiteral
      | t.BooleanLiteral;

    const folded = evaluateBinaryExpression(
      node.operator,
      left.value,
      right.value
    );

    if (typeof folded === "number") return t.numericLiteral(folded);
    if (typeof folded === "string") return t.stringLiteral(folded);
    if (typeof folded === "boolean") return t.booleanLiteral(folded);

    return node; // fallback
  },
};

// Helper: Check if it's a literal we can evaluate
function isLiteral(
  node: t.Node
): node is t.NumericLiteral | t.StringLiteral | t.BooleanLiteral {
  return (
    t.isNumericLiteral(node) ||
    t.isStringLiteral(node) ||
    t.isBooleanLiteral(node)
  );
}

// Helper: Evaluate known binary operations
function evaluateBinaryExpression(
  op: t.BinaryExpression["operator"],
  left: any,
  right: any
): any {
  switch (op) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return right !== 0 ? left / right : NaN;
    case "%":
      return right !== 0 ? left % right : NaN;
    case "**":
      return Math.pow(left, right);
    case "==":
      return left == right;
    case "===":
      return left === right;
    case "!=":
      return left != right;
    case "!==":
      return left !== right;
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    case ">":
      return left > right;
    case ">=":
      return left >= right;
    default:
      return undefined;
  }
}
