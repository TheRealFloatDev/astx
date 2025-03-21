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

export const LogicalSimplificationTransformer: NodeTransformer<
  t.UnaryExpression | t.BinaryExpression
> = {
  key: "logical-simplification",
  displayName: "Simplify Boolean Expressions",
  nodeTypes: ["UnaryExpression", "BinaryExpression"],
  phases: ["main"],

  test(node): node is t.UnaryExpression | t.BinaryExpression {
    return (
      (t.isUnaryExpression(node) && node.operator === "!") ||
      (t.isBinaryExpression(node) &&
        (node.operator === "===" || node.operator === "!=="))
    );
  },

  transform(node, _context: TransformContext): t.Expression {
    // Simplify: !!x → x
    if (
      t.isUnaryExpression(node) &&
      node.operator === "!" &&
      t.isUnaryExpression(node.argument) &&
      node.argument.operator === "!"
    ) {
      return node.argument.argument;
    }

    // Simplify: !true → false, !false → true
    if (
      t.isUnaryExpression(node) &&
      node.operator === "!" &&
      t.isBooleanLiteral(node.argument)
    ) {
      return t.booleanLiteral(!node.argument.value);
    }

    // Simplify: x === true → x
    if (
      t.isBinaryExpression(node) &&
      node.operator === "===" &&
      t.isBooleanLiteral(node.right) &&
      t.isExpression(node.left)
    ) {
      return node.right.value
        ? node.left
        : t.unaryExpression("!", node.left, true);
    }

    // Simplify: x === false → !x
    if (
      t.isBinaryExpression(node) &&
      node.operator === "===" &&
      t.isBooleanLiteral(node.left)
    ) {
      return node.left.value
        ? node.right
        : t.unaryExpression("!", node.right, true);
    }

    // Simplify: x !== true → !x
    if (
      t.isBinaryExpression(node) &&
      node.operator === "!==" &&
      t.isBooleanLiteral(node.right) &&
      t.isExpression(node.left)
    ) {
      return node.right.value
        ? t.unaryExpression("!", node.left, true)
        : node.left;
    }

    // Simplify: false !== x → x
    if (
      t.isBinaryExpression(node) &&
      node.operator === "!==" &&
      t.isBooleanLiteral(node.left)
    ) {
      return node.left.value
        ? t.unaryExpression("!", node.right, true)
        : node.right;
    }

    return node;
  },
};
