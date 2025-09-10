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

import { decode as msgpackDecode } from "@msgpack/msgpack";
import { decompress } from "brotli";
import { CompiledProgram, MAGIC_HEADER, FORMAT_VERSION } from "..";

export function loadFromBuffer(buffer: Buffer): CompiledProgram {
  const magic = buffer.subarray(0, 4);
  const version = buffer[4];

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

  const compressed = buffer.subarray(5);
  const decoded = msgpackDecode(Buffer.from(decompress(compressed)));
  const [expressionDict, valueDict, bytecode] = decoded as [
    string[],
    any[],
    any[]
  ];

  return { expressionDict, valueDict, bytecode };
}
