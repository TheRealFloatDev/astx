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
import generate from "@babel/generator";
import { NodeTransformer, TransformContext } from "./transformers";

export const DeduplicateVariablesTransformer: NodeTransformer<t.VariableDeclaration> =
  {
    key: "deduplicate-variables",
    displayName: "Deduplicate Identical Variable Initializers",
    nodeTypes: ["VariableDeclaration"],
    phases: ["post"],

    test: () => true,

    transform(node, context): t.VariableDeclaration | null {
      const map = (context._deduplicationMap ??= new Map<
        string,
        t.Identifier
      >());
      const newDecls: t.VariableDeclarator[] = [];

      for (const decl of node.declarations) {
        if (!decl.init) {
          newDecls.push(decl);
          continue;
        }

        // Ignore unpure expressions (for now)
        if (!isSafeToDeduplicate(decl.init)) {
          newDecls.push(decl);
          continue;
        }

        const code = generate(decl.init).code;

        if (map.has(code)) {
          const existingId = map.get(code)!;
          newDecls.push(t.variableDeclarator(decl.id, existingId));
        } else {
          const dedupId = t.isIdentifier(decl.id)
            ? decl.id
            : context.helpers.generateUid("dedup");

          map.set(code, dedupId);
          newDecls.push(t.variableDeclarator(decl.id, decl.init));
        }
      }

      return t.variableDeclaration(node.kind, newDecls);
    },
  };

function isSafeToDeduplicate(node: t.Expression): boolean {
  return (
    t.isLiteral(node) ||
    t.isIdentifier(node) ||
    (t.isCallExpression(node) &&
      t.isIdentifier(node.callee) &&
      node.arguments.every((arg) => t.isLiteral(arg) || t.isIdentifier(arg)))
  );
}
