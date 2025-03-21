# astx (Abstract Syntax Tree Executable)
A **very early** stage project to compile and run JavaScript to an AST-based binary format.

The goal is to drastically reduce the size of JS files by compiling them to a binary format.
This is not a replacement for minification or obfuscation, but because of its binary format it is harder to reverse engineer similar to other compiled languages.

ASTX is a binary format that represents an Abstract Syntax Tree (AST) of a JavaScript program.
The AST is serialized to a binary format that can be executed by the ASTX runtime.
That means that every JavaScript program can be compiled to an ASTX binary file and executed by the ASTX runtime library from within a JavaScript environment.

This project is inspired by [WebAssembly](https://webassembly.org/), but it is not meant to be a replacement for it.

## Benefits of working with an AST-based binary format
- **Size**: The binary format is smaller than the original JavaScript source code.
- **Feature support**: Since we are working on the JavaScript AST, we can support all JavaScript features. (Some features **might** not be fully supported yet)
- **Performance**: The ASTX runtime can optimize the execution of the program.
- **Security**: The binary format is harder to reverse engineer than the original JavaScript source code.
- **Optimization**: The ASTX compiler has *theoretically* all the benefits of a compiler, like optimizations and dead code elimination.
- **Runtime Independence**: The ASTX runtime can theoretically be implemented in any language, not just JavaScript (although **this** implementation is in JavaScript).

## Installation
```bash
npm install astx
```

## Usage

### Compiling
```javascript
import { compile, saveToFile } from 'astx';

const program = compile(`
  function main() {
    return 1 + 2;
  }
`);

saveToFile(program, 'program.astx');
```

### Running
```javascript
import { loadFromFile, run } from 'astx';

const program = loadFromFile('program.astx');
const result = run(program); 
// or
run(program)
```

## License
This project is licensed under the GPL-3.0 License - see the [LICENSE](LICENSE) file for details.

