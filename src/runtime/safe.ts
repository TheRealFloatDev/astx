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

import { CompiledProgram } from "..";
import { generateJSCode } from "../loader";

/**
 * Safely runs a compiled program with error handling.
 *
 * Compared to the `run` function, this function does not support any different modes or dependency/context injection.
 *
 * @param compiled The compiled program
 * @returns The result of the program
 */
export function safeRun(compiled: CompiledProgram) {
  const code = generateJSCode(compiled);

  try {
    return eval(code);
  } catch (error) {
    console.error("[ASTX Runtime] Error occurred during safeRun:", error);
    throw error;
  }
}
