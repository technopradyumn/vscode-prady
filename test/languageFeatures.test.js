const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');

const {
  extractWorkspaceDeclarations,
  getMemberSignatures,
  inferReceiverType,
  modulePathFor,
  parseCliDiagnostics,
} = require('../languageFeatures');

test('workspace indexing returns top-level classes and functions, not nested methods', () => {
  const source = `
class Greeter {
  fn greet(name: String) -> String {
    fn helper() {}
  }
}
fn main() {}
`;

  assert.deepEqual(
    extractWorkspaceDeclarations(source).map(({ kind, name }) => [kind, name]),
    [['class', 'Greeter'], ['fn', 'main']]
  );
});

test('member completion offers class fields and methods but excludes nested functions', () => {
  const source = `
class Greeter {
  name: String;
  fn greet(name: String) -> String {
    fn helper() {}
  }
}
`;

  assert.deepEqual(
    getMemberSignatures(source, 'Greeter')
      .map(({ kind, name }) => [kind, name])
      .sort((a, b) => a[0].localeCompare(b[0])),
    [['field', 'name'], ['method', 'greet']]
  );
});

test('receiver inference supports annotated and constructor-inferred locals and self', () => {
  const source = `
class Greeter {
  fn call() {
    let annotated: Greeter = Greeter();
    let inferred = Greeter();
    self.
  }
}
`;

  assert.equal(inferReceiverType(source, 'annotated', source.indexOf('self.')), 'Greeter');
  assert.equal(inferReceiverType(source, 'inferred', source.indexOf('self.')), 'Greeter');
  assert.equal(inferReceiverType(source, 'self', source.indexOf('self.')), 'Greeter');
});

test('array and string literals infer built-in receiver completion types', () => {
  const source = 'fn main() { let values = []; let name = "Prady"; values. name. }';
  assert.equal(inferReceiverType(source, 'values', source.indexOf('values.') + 8), 'Array');
  assert.equal(inferReceiverType(source, 'name', source.indexOf('name.') + 5), 'String');
});

test('built-in collection completions expose methods implemented by the runtime', () => {
  assert.deepEqual(
    getMemberSignatures('', 'Queue').map(({ name }) => name),
    ['enqueue', 'dequeue', 'push', 'pop', 'peek', 'isEmpty', 'size', 'clear', 'toArray']
  );
});

test('auto-import path is relative to the importing source file', () => {
  assert.equal(
    modulePathFor(path.join('project', 'src', 'main.pr'), path.join('project', 'src', 'models', 'user.pr')),
    'models.user'
  );
  assert.equal(
    modulePathFor(path.join('project', 'src', 'main.pr'), path.join('project', 'shared', 'user.pr')),
    null
  );
});

test('CLI parser converts compile and runtime locations into editor diagnostics', () => {
  const mainFile = path.resolve('C:\\project\\main.pr');
  const libraryFile = path.resolve('C:\\project\\lib\\utils.pr');
  const output = [
    'error[E0001]: unexpected token',
    `  --> ${mainFile}:4:7`,
    'runtime error: Method not found',
    `  --> ${libraryFile}:9:3`,
  ].join('\n');

  assert.deepEqual(
    parseCliDiagnostics(output).map(({ message, startLine, startCharacter }) => [
      message,
      startLine,
      startCharacter,
    ]),
    [['unexpected token', 3, 6], ['Method not found', 8, 2]]
  );
  assert.deepEqual(
    parseCliDiagnostics(output).map(({ filePath }) => filePath),
    [mainFile, libraryFile]
  );
});
