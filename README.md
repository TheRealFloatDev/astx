# astx (Abstract Syntax Tree Executable)
This is a template for creating a npm library.

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

