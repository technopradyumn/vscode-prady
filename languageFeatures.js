const path = require('path');

const BUILTIN_METHODS = {
  Array: [
    ['len', 'fn len() -> Int'],
    ['push', 'fn push(value: Any)'],
    ['pop', 'fn pop() -> Any'],
    ['shift', 'fn shift() -> Any'],
    ['unshift', 'fn unshift(value: Any)'],
    ['indexOf', 'fn indexOf(value: Any) -> Int'],
    ['includes', 'fn includes(value: Any) -> Bool'],
    ['join', 'fn join(separator: String) -> String'],
    ['reverse', 'fn reverse()'],
    ['sort', 'fn sort()'],
    ['map', 'fn map(callback: Function) -> Array'],
    ['filter', 'fn filter(callback: Function) -> Array'],
    ['reduce', 'fn reduce(callback: Function) -> Any'],
    ['forEach', 'fn forEach(callback: Function)'],
  ],
  String: [
    ['len', 'fn len() -> Int'],
    ['toUpperCase', 'fn toUpperCase() -> String'],
    ['toLowerCase', 'fn toLowerCase() -> String'],
    ['trim', 'fn trim() -> String'],
    ['split', 'fn split(separator: String) -> Array'],
    ['includes', 'fn includes(value: String) -> Bool'],
    ['indexOf', 'fn indexOf(value: String) -> Int'],
    ['startsWith', 'fn startsWith(value: String) -> Bool'],
    ['endsWith', 'fn endsWith(value: String) -> Bool'],
    ['replace', 'fn replace(from: String, to: String) -> String'],
    ['substring', 'fn substring(start: Int, end: Int) -> String'],
    ['slice', 'fn slice(start: Int, end: Int) -> String'],
    ['charAt', 'fn charAt(index: Int) -> String'],
    ['concat', 'fn concat(value: String) -> String'],
    ['repeat', 'fn repeat(count: Int) -> String'],
  ],
  Map: [
    ['set', 'fn set(key: Any, value: Any)'],
    ['get', 'fn get(key: Any) -> Any'],
    ['has', 'fn has(key: Any) -> Bool'],
    ['delete', 'fn delete(key: Any) -> Bool'],
    ['keys', 'fn keys() -> Array'],
    ['values', 'fn values() -> Array'],
    ['entries', 'fn entries() -> Array'],
    ['size', 'fn size() -> Int'],
    ['clear', 'fn clear()'],
  ],
  Set: [
    ['add', 'fn add(value: Any)'],
    ['has', 'fn has(value: Any) -> Bool'],
    ['delete', 'fn delete(value: Any) -> Bool'],
    ['values', 'fn values() -> Array'],
    ['size', 'fn size() -> Int'],
    ['clear', 'fn clear()'],
  ],
  Stack: [
    ['push', 'fn push(value: Any)'],
    ['pop', 'fn pop() -> Any'],
    ['peek', 'fn peek() -> Any'],
    ['isEmpty', 'fn isEmpty() -> Bool'],
    ['size', 'fn size() -> Int'],
  ],
  Queue: [
    ['enqueue', 'fn enqueue(value: Any)'],
    ['dequeue', 'fn dequeue() -> Any'],
    ['push', 'fn push(value: Any)'],
    ['pop', 'fn pop() -> Any'],
    ['peek', 'fn peek() -> Any'],
    ['isEmpty', 'fn isEmpty() -> Bool'],
    ['size', 'fn size() -> Int'],
    ['clear', 'fn clear()'],
    ['toArray', 'fn toArray() -> Array'],
  ],
};

function closingBrace(source, openIndex) {
  let depth = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (char === '\\') i += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      i += 1;
    } else if (char === '/' && next === '*') {
      blockComment = true;
      i += 1;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}' && --depth === 0) {
      return i;
    }
  }
  return -1;
}

function findTypeBody(source, typeName) {
  const escaped = typeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const declaration = new RegExp(`\\b(?:class|struct)\\s+${escaped}\\b[^\\{]*\\{`, 'g');
  const match = declaration.exec(source);
  if (!match) return null;
  const openIndex = source.indexOf('{', match.index);
  const closeIndex = closingBrace(source, openIndex);
  return closeIndex < 0 ? null : source.slice(openIndex + 1, closeIndex);
}

function inferReceiverType(source, receiver, offset) {
  if (receiver === 'self' || receiver === 'this') {
    const declaration = /\b(?:class|struct)\s+([A-Za-z_]\w*)\b[^{]*\{/g;
    let match;
    let owner = null;
    while ((match = declaration.exec(source)) && match.index < offset) {
      const openIndex = source.indexOf('{', match.index);
      const closeIndex = closingBrace(source, openIndex);
      if (closeIndex >= offset) {
        owner = match[1];
        break;
      }
      if (closeIndex < 0) break;
      declaration.lastIndex = closeIndex + 1;
    }
    if (owner) return owner;
  }

  const escaped = receiver.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const prefix = source.slice(0, offset);
  const collectionOrString = new RegExp(`\\b(?:let|const)\\s+(?:mut\\s+)?${escaped}\\s*=\\s*(\\[|["'])`);
  const literal = collectionOrString.exec(prefix);
  if (literal) return literal[1] === '[' ? 'Array' : 'String';
  const declarations = [
    new RegExp(`\\b(?:let|const)\\s+(?:mut\\s+)?${escaped}\\s*:\\s*([A-Za-z_]\\w*)`, 'g'),
    new RegExp(`\\b(?:let|const)\\s+(?:mut\\s+)?${escaped}\\s*=\\s*([A-Za-z_]\\w*)\\s*(?:\\(|\\{)`, 'g'),
    new RegExp(`\\b[A-Za-z_]\\w*\\s*\\([^)]*\\b${escaped}\\s*:\\s*([A-Za-z_]\\w*)`, 'g'),
  ];
  for (const expression of declarations) {
    let match;
    let type = null;
    while ((match = expression.exec(prefix))) type = match[1];
    if (type) return type;
  }
  return null;
}

function getMemberSignatures(source, typeName, offset = source.length) {
  const builtins = BUILTIN_METHODS[typeName] || [];
  const body = findTypeBody(source, typeName);
  const members = builtins.map(([name, signature]) => ({ name, signature, kind: 'method' }));
  if (!body) return members;

  let depth = 0;
  let inBlockComment = false;
  for (const line of body.split(/\r?\n/)) {
    if (depth === 0) {
      const method = line.match(/^\s*(?:(?:pub|async)\s+)*fn\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?:->\s*([^{\n]+))?/);
      if (method) {
        const parameters = method[2].trim();
        const returnType = method[3] ? ` -> ${method[3].trim()}` : '';
        members.push({
          name: method[1],
          signature: `fn ${method[1]}(${parameters})${returnType}`,
          kind: 'method',
        });
      } else {
        const field = line.match(/^\s*(?:(?:pub|mut)\s+)*([A-Za-z_]\w*)\s*:\s*([^,\n;]+)/);
        if (field) {
          members.push({
            name: field[1],
            signature: `${field[1]}: ${field[2].trim()}`,
            kind: 'field',
          });
        }
      }
    }

    let quote = null;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = line[i + 1];
      if (inBlockComment) {
        if (char === '*' && next === '/') {
          inBlockComment = false;
          i += 1;
        }
        continue;
      }
      if (quote) {
        if (char === '\\') i += 1;
        else if (char === quote) quote = null;
        continue;
      }
      if (char === '/' && next === '/') break;
      if (char === '/' && next === '*') {
        inBlockComment = true;
        i += 1;
      } else if (char === '"' || char === "'") quote = char;
      else if (char === '{') depth += 1;
      else if (char === '}') depth = Math.max(0, depth - 1);
    }
  }

  const seen = new Set();
  return members.filter((member) => {
    if (seen.has(member.name)) return false;
    seen.add(member.name);
    return true;
  });
}

function extractWorkspaceDeclarations(source) {
  const declarations = [];
  let depth = 0;
  let inBlockComment = false;
  for (const line of source.split(/\r?\n/)) {
    if (depth === 0) {
      const match = line.match(/^\s*(?:(?:pub|export|async)\s+)*(class|struct|interface|trait|enum|fn)\s+([A-Za-z_]\w*)\s*(?:<[^>]*>)?\s*(?:\(([^)]*)\))?/);
      if (match) {
        const kind = match[1];
        const signature = kind === 'fn'
          ? `fn ${match[2]}(${match[3] || ''})`
          : `${kind} ${match[2]}`;
        declarations.push({ name: match[2], kind, signature });
      }
    }

    let quote = null;
    let lineComment = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = line[i + 1];
      if (lineComment) break;
      if (inBlockComment) {
        if (char === '*' && next === '/') {
          inBlockComment = false;
          i += 1;
        }
        continue;
      }
      if (quote) {
        if (char === '\\') i += 1;
        else if (char === quote) quote = null;
        continue;
      }
      if (char === '/' && next === '/') break;
      if (char === '/' && next === '*') {
        inBlockComment = true;
        i += 1;
      } else if (char === '"' || char === "'") quote = char;
      else if (char === '{') depth += 1;
      else if (char === '}') depth = Math.max(0, depth - 1);
    }
  }
  return declarations;
}

function modulePathFor(fromFile, targetFile) {
  const relative = path.relative(path.dirname(fromFile), targetFile);
  if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) return null;
  const withoutExtension = relative.replace(/\.pr$/i, '');
  const segments = withoutExtension.split(/[\\/]/);
  if (!segments.every((segment) => /^[A-Za-z_]\w*$/.test(segment))) return null;
  return segments.join('.');
}

function normalizeDiagnosticPath(filePath) {
  const resolved = path.resolve(filePath);
  return resolved.startsWith('\\\\?\\') ? resolved.slice(4) : resolved;
}

function unresolvedImportMessage(modulePath, expectedPath) {
  if (modulePath.split('.')[0] === 'std') {
    return `Standard-library module '${modulePath}' is not shipped by this compiler. Use implemented built-ins or add a local .pr module.`;
  }
  return `Cannot resolve imported module '${modulePath}'. Expected '${expectedPath.replace(/\\/g, '/')}'.`;
}

function parseCliDiagnostics(output) {
  const plain = output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
  const arrows = /^\s*-->\s+(.+):(\d+):(\d+)(?:-(\d+):(\d+))?\s*$/gm;
  const diagnostics = [];
  let arrow;
  while ((arrow = arrows.exec(plain))) {
    const before = plain.slice(0, arrow.index);
    const headers = [...before.matchAll(/^\s*(error|warning|runtime error)(?:\[([^\]]+)\])?:\s*(.+)$/gim)];
    const header = headers.at(-1);
    const startLine = Math.max(0, Number(arrow[2]) - 1);
    const startCharacter = Math.max(0, Number(arrow[3]) - 1);
    diagnostics.push({
      message: header ? header[3].trim() : 'Prady reported an error',
      severity: header && header[1].toLowerCase() === 'warning' ? 'warning' : 'error',
      code: header && header[2] ? header[2] : undefined,
      filePath: normalizeDiagnosticPath(arrow[1]),
      startLine,
      startCharacter,
      endLine: arrow[4] ? Math.max(0, Number(arrow[4]) - 1) : startLine,
      endCharacter: arrow[5] ? Math.max(0, Number(arrow[5]) - 1) : startCharacter + 1,
    });
  }
  return diagnostics;
}

module.exports = {
  extractWorkspaceDeclarations,
  getMemberSignatures,
  inferReceiverType,
  modulePathFor,
  parseCliDiagnostics,
  unresolvedImportMessage,
};
