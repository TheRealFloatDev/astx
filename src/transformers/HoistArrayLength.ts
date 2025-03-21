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
import { NodePath } from "@babel/traverse";
import { NodeTransformer, TransformContext } from "./transformers";

export const HoistArrayLengthTransformer: NodeTransformer<t.ForStatement> = {
  key: "hoist-array-length",
  displayName: "Hoist array.length out of loop",
  nodeTypes: ["ForStatement"],
  phases: ["main", "post"],

  test(node): node is t.ForStatement {
    return (
      t.isForStatement(node) &&
      t.isBinaryExpression(node.test) &&
      node.test.operator === "<" &&
      t.isMemberExpression(node.test.right) &&
      t.isIdentifier(node.test.right.property, { name: "length" }) &&
      t.isIdentifier(node.test.right.object)
    );
  },

  transform(node, context: TransformContext): t.Statement {
    const path = context.path as NodePath<t.ForStatement>;

    if (!node.test || !t.isBinaryExpression(node.test)) {
      // We prefer to return the original node if we can't transform it
      return node;
    }

    const memberExpr = node.test.right as t.MemberExpression;
    const arrayId = memberExpr.object as t.Identifier;

    const hoistedId = context.helpers.generateUid(`${arrayId.name}_len`);

    // Replace arr.length with arr_len
    const newTest = t.binaryExpression("<", node.test.left, hoistedId);
    node.test = newTest;

    // Inject const arr_len = arr.length;
    const lengthDecl = t.variableDeclaration("const", [
      t.variableDeclarator(
        hoistedId,
        t.memberExpression(arrayId, t.identifier("length"))
      ),
    ]);

    path.insertBefore(lengthDecl);

    return node;
  },
};
