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

export const InlineArrowToFunctionTransformer: NodeTransformer<t.ArrowFunctionExpression> =
  {
    key: "inline-arrow-to-function",
    displayName: "Inline Arrow to Function Expression",
    nodeTypes: ["ArrowFunctionExpression"],
    phases: ["pre"],
    test: () => true,

    transform(node): t.FunctionExpression {
      const body = t.isBlockStatement(node.body)
        ? node.body
        : t.blockStatement([t.returnStatement(node.body)]);

      return t.functionExpression(
        null,
        node.params,
        body,
        node.generator ?? false,
        node.async ?? false
      );
    },
  };
