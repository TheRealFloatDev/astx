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
import { NodePath } from "@babel/traverse";

export const HoistArrayLengthTransformer: NodeTransformer<t.ForStatement> = {
  key: "hoist-array-length",
  displayName: "Hoist array.length out of loop",
  nodeTypes: ["ForStatement"],
  phases: ["main"],

  test(node): node is t.ForStatement {
    if (!t.isForStatement(node)) return false;

    const test = node.test;
    if (!t.isBinaryExpression(test)) return false;

    const right = test.right;

    // Match: i < arr.length
    const isSimple =
      test.operator === "<" &&
      t.isMemberExpression(right) &&
      t.isIdentifier(right.property, { name: "length" }) &&
      t.isIdentifier(right.object);

    // Match: i <= arr.length - 1
    const isMinusOne =
      (test.operator === "<=" || test.operator === "<") &&
      t.isBinaryExpression(right) &&
      right.operator === "-" &&
      t.isMemberExpression(right.left) &&
      t.isIdentifier(right.left.property, { name: "length" }) &&
      t.isIdentifier(right.left.object) &&
      t.isNumericLiteral(right.right, { value: 1 });

    return isSimple || isMinusOne;
  },

  transform(node, context: TransformContext): t.Statement {
    const path = context.path as NodePath<t.ForStatement>;
    const test = node.test as t.BinaryExpression;

    let arrayId: t.Identifier;

    // Handle: i < arr.length
    if (t.isMemberExpression(test.right)) {
      arrayId = test.right.object as t.Identifier;
    }

    // Handle: i <= arr.length - 1 → normalize to i < arr.length
    else if (
      t.isBinaryExpression(test.right) &&
      t.isMemberExpression(test.right.left) &&
      test.operator === "<="
    ) {
      arrayId = test.right.left.object as t.Identifier;
      node.test = t.binaryExpression(
        "<",
        test.left,
        t.identifier("___placeholder")
      );
    }

    // Handle: i < arr.length - 1 → normalize to i <= arr.length
    else if (
      t.isBinaryExpression(test.right) &&
      t.isMemberExpression(test.right.left) &&
      test.operator === "<"
    ) {
      arrayId = test.right.left.object as t.Identifier;
      node.test = t.binaryExpression(
        "<=",
        test.left,
        t.identifier("___placeholder")
      );
    } else {
      return node; // Shouldn't happen due to test() guard
    }

    const hoistedId = context.helpers.generateUid(`${arrayId.name}_len`);

    if (!node.test || !t.isBinaryExpression(node.test)) {
      // We cannot hoist the array length out of the loop - just return the original node
      return node;
    }

    // Update test to use hoisted identifier
    node.test.right = hoistedId;

    const decl = t.variableDeclaration("const", [
      t.variableDeclarator(
        hoistedId,
        t.memberExpression(arrayId, t.identifier("length"))
      ),
    ]);

    path.insertBefore(decl);

    return node;
  },
};
