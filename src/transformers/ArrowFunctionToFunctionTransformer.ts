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

export const ArrowFunctionToFunctionTransformer: NodeTransformer<t.ArrowFunctionExpression> =
  {
    phases: ["pre"],
    nodeTypes: ["ArrowFunctionExpression"],
    key: "arrow-to-function",
    displayName: "Arrow Function to Function Expression",
    test: () => true,

    transform(node) {
      const func = t.functionExpression(
        null, // anonymous
        node.params,
        t.isBlockStatement(node.body)
          ? node.body
          : t.blockStatement([t.returnStatement(node.body)]),
        false, // not a generator
        false // not async (you could preserve node.async here if needed)
      );

      return func;
    },
  };
