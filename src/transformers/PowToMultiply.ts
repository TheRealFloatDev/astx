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

export const PowToMultiplyTransformer: NodeTransformer<t.CallExpression> = {
  key: "pow-to-multiply",
  displayName: "Replace Math.pow(x, n) with x * x",
  nodeTypes: ["CallExpression"],
  phases: ["main"],

  test(node): node is t.CallExpression {
    return (
      t.isCallExpression(node) &&
      t.isMemberExpression(node.callee) &&
      t.isIdentifier(node.callee.object, { name: "Math" }) &&
      t.isIdentifier(node.callee.property, { name: "pow" }) &&
      node.arguments.length === 2 &&
      t.isNumericLiteral(node.arguments[1]) &&
      Number.isInteger(node.arguments[1].value) &&
      node.arguments[1].value >= 2 &&
      node.arguments[1].value <= 5 // We can adjust this cap if you want
    );
  },

  transform(node, context: TransformContext): t.Expression {
    const base = node.arguments[0] as t.Expression;
    const exponent = (node.arguments[1] as t.NumericLiteral).value;

    // Expand: x * x * x * ...
    let expr: t.Expression = base;
    for (let i = 1; i < exponent; i++) {
      expr = t.binaryExpression("*", expr, base);
    }

    return expr;
  },
};
