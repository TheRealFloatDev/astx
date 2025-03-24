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

export const RestoreExportedNamesTransformer: NodeTransformer<
  t.ExportNamedDeclaration | t.ExportSpecifier
> = {
  key: "restore-exported-names",
  displayName: "Restore names of exported declarations",
  nodeTypes: ["ExportNamedDeclaration", "ExportSpecifier"],
  phases: ["post"],

  test: () => true,

  transform(
    node,
    context: TransformContext
  ): t.ExportNamedDeclaration | t.ExportSpecifier {
    if (t.isExportSpecifier(node)) {
      return transformExportSpecifier(node, context);
    } else {
      return transformExportedName(node, context);
    }
  },
};

function transformExportedName(
  node: t.ExportNamedDeclaration,
  context: TransformContext
): t.ExportNamedDeclaration {
  if (!node.declaration) return node;

  if (
    t.isFunctionDeclaration(node.declaration) &&
    t.isIdentifier(node.declaration.id)
  ) {
    context.declaredVars.delete(node.declaration.id.name);
  } else if (t.isVariableDeclaration(node.declaration)) {
    for (const declaration of node.declaration.declarations) {
      if (t.isIdentifier(declaration.id)) {
        context.declaredVars.delete(declaration.id.name);
      }
    }
  }

  return node;
}

function transformExportSpecifier(
  node: t.ExportSpecifier,
  context: TransformContext
): t.ExportSpecifier {
  if (t.isIdentifier(node.exported)) {
    context.declaredVars.delete(node.exported.name);
  }

  return node;
}
