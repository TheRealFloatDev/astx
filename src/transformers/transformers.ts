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

import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";

export type Phase = "pre" | "main" | "post";

export interface TransformContext {
  /**
   * The AST of the program
   */
  ast: t.File;
  /**
   * The current phase of the transformer
   */
  phase: Phase;
  /**
   * The parent node of the current node
   */
  parent?: t.Node;
  /**
   * The declared variables in the current scope
   */
  declaredVars: Set<string>;
  /**
   * The current path in the AST
   * @see https://babeljs.io/docs/en/babel-traverse#path
   */
  path: NodePath<any>;
  /**
   * Helper functions to generate unique identifiers and replace nodes
   */
  helpers: {
    /**
     * Generates a unique identifier
     * @param base The base name of the identifier
     */
    generateUid(base?: string): t.Identifier;
    /**
     * Replaces a node in the AST with another node
     * @param from The node to replace
     * @param to The node to replace with
     * @returns void
     */
    replaceNode: (from: t.Node, to: t.Node | t.Node[]) => void;
    /**
     * Inserts a node before the current node
     * @param node The node to insert
     * @returns void
     */
    insertBefore: (node: t.Node) => void;
    /**
     * Inserts a node after the current node
     * @param node The node to insert
     * @returns void
     */
    insertAfter: (node: t.Node) => void;
  };

  /**
   * Shared data between transformers and phases, e.g. for deduplication
   */
  sharedData: Record<string, any>;
}

export interface NodeTransformer<TNode extends t.Node = t.Node> {
  key: string;
  displayName: string;

  // Optional: Limits the node types this transformer applies to
  nodeTypes?: TNode["type"][];

  // Optional: Which phases this transformer runs in (default: all)
  phases?: Phase[];

  // Required: Checks if this transformer should run on a given node
  test: (node: t.Node, context: TransformContext) => boolean;

  // Required: Transforms the node
  transform: (
    node: TNode,
    context: TransformContext
  ) => t.Node | t.Node[] | null;
}
