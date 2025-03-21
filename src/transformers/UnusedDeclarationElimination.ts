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
import traverse from "@babel/traverse";
import { NodeTransformer, TransformContext } from "./transformers";

export const UnusedDeclarationEliminationTransformer: NodeTransformer<t.Program> =
  {
    key: "unused-declaration-elimination",
    displayName: "Remove Unused Variables and Functions",
    nodeTypes: ["Program"],
    phases: ["post"], // Run after everything else

    test(node): node is t.Program {
      return t.isProgram(node);
    },

    transform(node, _context: TransformContext): t.Node {
      const bindingsToRemove = new Set<string>();

      traverse(node, {
        Program(path) {
          const bindings = path.scope.getAllBindings();

          for (const [name, binding] of Object.entries(bindings)) {
            if (
              !binding.referenced && // <-- this is the magic
              (t.isVariableDeclarator(binding.path.node) ||
                t.isFunctionDeclaration(binding.path.node))
            ) {
              bindingsToRemove.add(name);
            }
          }
        },
      });

      if (bindingsToRemove.size === 0) return node;

      // Create a filtered body without the unused bindings
      const newBody = node.body.filter((stmt) => {
        // Handle: function foo() {}
        if (
          t.isFunctionDeclaration(stmt) &&
          stmt.id &&
          bindingsToRemove.has(stmt.id.name)
        ) {
          return false;
        }

        // Handle: const foo = ...
        if (t.isVariableDeclaration(stmt)) {
          const remainingDeclarators = stmt.declarations.filter((decl) => {
            return (
              t.isIdentifier(decl.id) && !bindingsToRemove.has(decl.id.name)
            );
          });

          if (remainingDeclarators.length === 0) return false;

          stmt.declarations = remainingDeclarators;
        }

        return true;
      });

      return t.program(newBody, node.directives, node.sourceType);
    },
  };
