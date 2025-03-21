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
import { NodeTransformer } from "./transformers";

export const ForEachToForTransformer: NodeTransformer = {
  nodeType: "CallExpression",
  key: "forEach-to-for",
  displayName: "Convert .forEach() to for loop",

  test(node) {
    return (
      t.isCallExpression(node) &&
      t.isMemberExpression(node.callee) &&
      t.isIdentifier(node.callee.property, { name: "forEach" }) &&
      node.arguments.length === 1 &&
      (t.isFunctionExpression(node.arguments[0]) ||
        t.isArrowFunctionExpression(node.arguments[0]))
    );
  },

  transform(node) {
    const array = node.callee.object;
    const callback = node.arguments[0];

    const [itemParam, indexParam] = callback.params;

    const indexId = indexParam || t.identifier("i");
    const itemId = itemParam || t.identifier("item");

    const loopBody = [
      t.variableDeclaration("const", [
        t.variableDeclarator(itemId, t.memberExpression(array, indexId, true)),
      ]),
      ...(t.isBlockStatement(callback.body)
        ? callback.body.body
        : [t.expressionStatement(callback.body)]),
    ];

    const loop = t.forStatement(
      t.variableDeclaration("let", [
        t.variableDeclarator(indexId, t.numericLiteral(0)),
      ]),
      t.binaryExpression(
        "<",
        indexId,
        t.memberExpression(array, t.identifier("length"))
      ),
      t.updateExpression("++", indexId),
      t.blockStatement(loopBody)
    );

    return loop;
  },
};
