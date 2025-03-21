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

import { decode } from "@msgpack/msgpack";
import { CompiledProgram, FORMAT_VERSION, MAGIC_HEADER } from ".";
import { gunzipSync } from "zlib";
import { readFileSync } from "fs";

export function loadFile(filename: string): CompiledProgram {
  const file = readFileSync(filename);
  const magic = file.subarray(0, 4);
  const version = file[4];

  if (
    magic[0] !== MAGIC_HEADER[0] ||
    magic[1] !== MAGIC_HEADER[1] ||
    magic[2] !== MAGIC_HEADER[2] ||
    magic[3] !== MAGIC_HEADER[3]
  ) {
    throw new Error("Invalid file format: bad magic number");
  }
  if (version !== FORMAT_VERSION[0]) {
    throw new Error(
      `Unsupported version: ${version} | Current version: ${FORMAT_VERSION[0]}`
    );
  }

  const compressed = file.subarray(5);
  const decoded = decode(gunzipSync(compressed));
  const [expressionDict, valueDict, bytecode] = decoded as [
    string[],
    any[],
    any[]
  ];

  return { expressionDict, valueDict, bytecode };
}
