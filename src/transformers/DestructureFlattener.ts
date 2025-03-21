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

export const DestructureFlattenerTransformer: NodeTransformer<t.VariableDeclarator> =
  {
    key: "destructure-flattener",
    displayName: "Flatten Object Destructuring",
    nodeTypes: ["VariableDeclarator"],
    phases: ["post"],

    test(node): node is t.VariableDeclarator {
      const tempNode = node as t.VariableDeclarator;
      return t.isObjectPattern(tempNode.id) && t.isIdentifier(tempNode.init);
    },

    transform(node, context: TransformContext): t.Node | null {
      const path = context.path as NodePath<t.VariableDeclarator>;
      const objectId = node.init as t.Identifier;
      const pattern = node.id as t.ObjectPattern;

      const kept: t.VariableDeclarator[] = [];

      for (const prop of pattern.properties) {
        if (!t.isObjectProperty(prop)) continue;

        const key = prop.key;
        const value = prop.value;

        if (!t.isIdentifier(value)) continue;

        const name = value.name;
        const binding = path.scope.getBinding(name);

        if (binding?.referenced) {
          kept.push(
            t.variableDeclarator(
              value,
              t.memberExpression(objectId, key, /* computed */ t.isLiteral(key))
            )
          );
        }
      }

      if (kept.length === 0) {
        return null; // Remove the entire destructuring
      }

      if (kept.length === 1) {
        return kept[0]; // Just one variable left
      }

      // Mutate the parent VariableDeclaration in-place
      const declPath = path.parentPath;
      if (t.isVariableDeclaration(declPath.node)) {
        const idx = declPath.node.declarations.indexOf(node);
        if (idx !== -1) {
          declPath.node.declarations.splice(idx, 1, ...kept);
        }
      }

      return null; // Remove the original destructuring node
    },
  };
