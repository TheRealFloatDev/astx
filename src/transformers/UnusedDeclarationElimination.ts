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

export const UnusedDeclarationEliminationTransformer: NodeTransformer<t.Program> =
  {
    key: "unused-declaration-elimination",
    displayName: "Remove Unused Variables and Functions",
    nodeTypes: ["Program"],
    phases: ["post"],

    test(node): node is t.Program {
      return t.isProgram(node);
    },

    transform(node, context: TransformContext): t.Program {
      const programPath = context.path as NodePath<t.Program>;
      const bindings = programPath.scope.getAllBindings();
      const bindingsToRemove = new Set<string>();

      for (const [name, binding] of Object.entries(bindings)) {
        if (
          !binding.referenced &&
          (t.isVariableDeclarator(binding.path.node) ||
            t.isFunctionDeclaration(binding.path.node))
        ) {
          bindingsToRemove.add(name);
        }
      }

      if (bindingsToRemove.size === 0) return node;

      const newBody = node.body.filter((stmt) => {
        if (
          t.isFunctionDeclaration(stmt) &&
          stmt.id &&
          bindingsToRemove.has(stmt.id.name)
        ) {
          return false;
        }

        if (t.isVariableDeclaration(stmt)) {
          stmt.declarations = stmt.declarations.filter(
            (decl) =>
              !t.isIdentifier(decl.id) || !bindingsToRemove.has(decl.id.name)
          );
          return stmt.declarations.length > 0;
        }

        return true;
      });

      return t.program(newBody, node.directives, node.sourceType);
    },
  };
