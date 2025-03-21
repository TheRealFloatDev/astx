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

/**
 * The representation of an ASTX compiled program.
 */
export interface CompiledProgram {
  /**
   * The dictionary of expressions used in the program.
   * The expressions are stored as strings.
   */
  expressionDict: string[];
  /**
   * The dictionary of values used in the program.
   * The values are stored as strings.
   */
  valueDict: any[];
  /**
   * The dictionary of AST nodes used in the program.
   * The AST nodes are stored in a custom format.
   */
  bytecode: any[];
}
