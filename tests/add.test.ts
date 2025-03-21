/*
 *   Copyright (c) 2023 Garmingo
 *   All rights reserved.
 *   Unauthorized use, reproduction, and distribution of this source code is strictly prohibited.
 */
import { add } from '../src';

test('adds two numbers correctly', () => {
  const result = add(2, 3);
  expect(result).toBe(5);
});