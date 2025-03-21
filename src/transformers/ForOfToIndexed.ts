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

export const ForOfToIndexedTransformer: NodeTransformer<t.ForOfStatement> = {
  key: "for-of-to-indexed",
  displayName: "Convert for...of to indexed loop",
  nodeTypes: ["ForOfStatement"],
  phases: ["main"],

  test(node): node is t.ForOfStatement {
    // Only apply if iterating over an Identifier (simple array)
    return (
      t.isForOfStatement(node) &&
      t.isIdentifier(node.right) &&
      (t.isVariableDeclaration(node.left) || t.isIdentifier(node.left))
    );
  },

  transform(node, context: TransformContext): t.Statement {
    const arrayId = node.right as t.Identifier;
    const indexId = context.helpers.generateUid("i");

    const itemBinding = t.isVariableDeclaration(node.left)
      ? (node.left.declarations[0].id as t.Identifier)
      : (node.left as t.Identifier);

    const arrayAccess = t.memberExpression(arrayId, indexId, true);

    const valueDecl = t.variableDeclaration("const", [
      t.variableDeclarator(itemBinding, arrayAccess),
    ]);

    const newBody = t.isBlockStatement(node.body)
      ? t.blockStatement([valueDecl, ...node.body.body])
      : t.blockStatement([valueDecl, node.body]);

    return t.forStatement(
      t.variableDeclaration("let", [
        t.variableDeclarator(indexId, t.numericLiteral(0)),
      ]),
      t.binaryExpression(
        "<",
        indexId,
        t.memberExpression(arrayId, t.identifier("length"))
      ),
      t.updateExpression("++", indexId),
      newBody
    );
  },
};
