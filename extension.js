// Prady Language Extension for VS Code (v1.0.2)
// Real-time diagnostics, go-to-definition, hover, autocomplete, symbols, and CLI runner.
// Auto-import on completion selection, unused-import diagnostics, dot-access member completions.

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const os = require('os');
const cp = require('child_process');
const {
  extractWorkspaceDeclarations,
  getMemberSignatures,
  inferReceiverType,
  modulePathFor,
  parseCliDiagnostics,
} = require('./languageFeatures');

let diagnosticCollection;
let lspProcess = null;
let extensionDirectory = '';
let rpcId = 1;
const pendingRequests = new Map();
let incomingBuffer = Buffer.alloc(0);

// ─── Standard Library Catalogue ────────────────────────────────────────────
// Each entry: { module, members[], description, kind }
// This drives auto-import completions WITHOUT needing LSP.
const STDLIB = [
  // ── I/O ──────────────────────────────────────────────────────────────────
  { module: 'io', members: [
    { name: 'print',     sig: 'fn print(value: Any)',             doc: 'Print a value to stdout' },
    { name: 'println',   sig: 'fn println(value: Any)',           doc: 'Print a value with newline' },
    { name: 'readLine',  sig: 'fn readLine() -> String',          doc: 'Read a line from stdin' },
    { name: 'readInt',   sig: 'fn readInt() -> Int',              doc: 'Read an integer from stdin' },
    { name: 'eprintln', sig: 'fn eprintln(value: Any)',           doc: 'Print to stderr' },
  ]},
  // ── Math ─────────────────────────────────────────────────────────────────
  { module: 'math', members: [
    { name: 'abs',    sig: 'fn abs(x: Float64) -> Float64',       doc: 'Absolute value' },
    { name: 'sqrt',   sig: 'fn sqrt(x: Float64) -> Float64',      doc: 'Square root' },
    { name: 'pow',    sig: 'fn pow(base: Float64, exp: Float64) -> Float64', doc: 'Power function' },
    { name: 'floor',  sig: 'fn floor(x: Float64) -> Float64',     doc: 'Floor of a float' },
    { name: 'ceil',   sig: 'fn ceil(x: Float64) -> Float64',      doc: 'Ceiling of a float' },
    { name: 'round',  sig: 'fn round(x: Float64) -> Float64',     doc: 'Round to nearest integer' },
    { name: 'min',    sig: 'fn min(a: Int, b: Int) -> Int',       doc: 'Minimum of two values' },
    { name: 'max',    sig: 'fn max(a: Int, b: Int) -> Int',       doc: 'Maximum of two values' },
    { name: 'log',    sig: 'fn log(x: Float64) -> Float64',       doc: 'Natural logarithm' },
    { name: 'log2',   sig: 'fn log2(x: Float64) -> Float64',      doc: 'Base-2 logarithm' },
    { name: 'sin',    sig: 'fn sin(x: Float64) -> Float64',       doc: 'Sine (radians)' },
    { name: 'cos',    sig: 'fn cos(x: Float64) -> Float64',       doc: 'Cosine (radians)' },
    { name: 'PI',     sig: 'const PI: Float64',                    doc: 'Pi constant (3.14159...)' },
    { name: 'E',      sig: 'const E: Float64',                    doc: 'Euler\'s number (2.71828...)' },
  ]},
  // ── String ───────────────────────────────────────────────────────────────
  { module: 'string', members: [
    { name: 'len',       sig: 'fn len(s: String) -> Int',             doc: 'Length of string' },
    { name: 'toUpper',   sig: 'fn toUpper(s: String) -> String',      doc: 'Uppercase string' },
    { name: 'toLower',   sig: 'fn toLower(s: String) -> String',      doc: 'Lowercase string' },
    { name: 'trim',      sig: 'fn trim(s: String) -> String',         doc: 'Trim whitespace' },
    { name: 'split',     sig: 'fn split(s: String, sep: String) -> List<String>', doc: 'Split by separator' },
    { name: 'contains',  sig: 'fn contains(s: String, sub: String) -> Bool', doc: 'Check if contains substring' },
    { name: 'startsWith',sig: 'fn startsWith(s: String, prefix: String) -> Bool', doc: 'Check prefix' },
    { name: 'endsWith',  sig: 'fn endsWith(s: String, suffix: String) -> Bool', doc: 'Check suffix' },
    { name: 'replace',   sig: 'fn replace(s: String, from: String, to: String) -> String', doc: 'Replace substring' },
    { name: 'parseInt',  sig: 'fn parseInt(s: String) -> Option<Int>', doc: 'Parse string to int' },
    { name: 'parseFloat',sig: 'fn parseFloat(s: String) -> Option<Float64>', doc: 'Parse string to float' },
    { name: 'format',    sig: 'fn format(template: String, args: Any...) -> String', doc: 'Format a string' },
    { name: 'chars',     sig: 'fn chars(s: String) -> List<Char>',    doc: 'Get characters list' },
    { name: 'bytes',     sig: 'fn bytes(s: String) -> List<Int>',     doc: 'Get UTF-8 bytes' },
    { name: 'repeat',    sig: 'fn repeat(s: String, n: Int) -> String',doc: 'Repeat string n times' },
  ]},
  // ── Collections ──────────────────────────────────────────────────────────
  { module: 'collections', members: [
    { name: 'List',         sig: 'class List<T>',                    doc: 'Dynamic array / growable list' },
    { name: 'Map',          sig: 'class Map<K, V>',                  doc: 'Hash map (key-value store)' },
    { name: 'Set',          sig: 'class Set<T>',                     doc: 'Hash set (unique values)' },
    { name: 'Stack',        sig: 'class Stack<T>',                   doc: 'LIFO stack' },
    { name: 'Queue',        sig: 'class Queue<T>',                   doc: 'FIFO queue (O(1) enqueue/dequeue)' },
    { name: 'Deque',        sig: 'class Deque<T>',                   doc: 'Double-ended queue' },
    { name: 'LinkedList',   sig: 'class LinkedList<T>',              doc: 'Doubly linked list' },
    { name: 'MinHeap',      sig: 'class MinHeap<T>',                 doc: 'Min priority queue' },
    { name: 'MaxHeap',      sig: 'class MaxHeap<T>',                 doc: 'Max priority queue' },
    { name: 'TreeMap',      sig: 'class TreeMap<K, V>',              doc: 'Sorted map (Red-Black Tree)' },
    { name: 'TreeSet',      sig: 'class TreeSet<T>',                 doc: 'Sorted set (Red-Black Tree)' },
    { name: 'Trie',         sig: 'class Trie',                       doc: 'Prefix trie for strings' },
    { name: 'DisjointSet',  sig: 'class DisjointSet',                doc: 'Union-Find / DSU' },
    { name: 'SegmentTree',  sig: 'class SegmentTree<T>',             doc: 'Range query segment tree' },
    { name: 'FenwickTree',  sig: 'class FenwickTree',                doc: 'Binary indexed tree (BIT)' },
    { name: 'LRUCache',     sig: 'class LRUCache<K, V>',             doc: 'LRU eviction cache' },
    { name: 'LFUCache',     sig: 'class LFUCache<K, V>',             doc: 'LFU eviction cache' },
    { name: 'BloomFilter',  sig: 'class BloomFilter',                doc: 'Probabilistic membership test' },
    { name: 'AVLTree',      sig: 'class AVLTree<T>',                 doc: 'Self-balancing AVL tree' },
    { name: 'RedBlackTree', sig: 'class RedBlackTree<T>',            doc: 'Red-Black balanced BST' },
  ]},
  // ── Algorithms ───────────────────────────────────────────────────────────
  { module: 'algo', members: [
    { name: 'sort',          sig: 'fn sort<T>(list: List<T>) -> List<T>',         doc: 'Sort ascending (O(n log n))' },
    { name: 'sortDesc',      sig: 'fn sortDesc<T>(list: List<T>) -> List<T>',     doc: 'Sort descending' },
    { name: 'sortBy',        sig: 'fn sortBy<T>(list: List<T>, key: fn(T)->Any) -> List<T>', doc: 'Sort by key fn' },
    { name: 'binarySearch',  sig: 'fn binarySearch<T>(list: List<T>, target: T) -> Option<Int>', doc: 'Binary search' },
    { name: 'reverse',       sig: 'fn reverse<T>(list: List<T>) -> List<T>',      doc: 'Reverse a list' },
    { name: 'filter',        sig: 'fn filter<T>(list: List<T>, pred: fn(T)->Bool) -> List<T>', doc: 'Filter elements' },
    { name: 'map',           sig: 'fn map<T, U>(list: List<T>, f: fn(T)->U) -> List<U>', doc: 'Map over list' },
    { name: 'reduce',        sig: 'fn reduce<T>(list: List<T>, init: T, f: fn(T,T)->T) -> T', doc: 'Fold/reduce list' },
    { name: 'any',           sig: 'fn any<T>(list: List<T>, pred: fn(T)->Bool) -> Bool', doc: 'Any element satisfies' },
    { name: 'all',           sig: 'fn all<T>(list: List<T>, pred: fn(T)->Bool) -> Bool', doc: 'All elements satisfy' },
    { name: 'flatten',       sig: 'fn flatten<T>(list: List<List<T>>) -> List<T>',doc: 'Flatten nested list' },
    { name: 'unique',        sig: 'fn unique<T>(list: List<T>) -> List<T>',       doc: 'Remove duplicates' },
    { name: 'zip',           sig: 'fn zip<A,B>(a: List<A>, b: List<B>) -> List<(A,B)>', doc: 'Zip two lists' },
    { name: 'gcd',           sig: 'fn gcd(a: Int, b: Int) -> Int',                doc: 'Greatest common divisor' },
    { name: 'lcm',           sig: 'fn lcm(a: Int, b: Int) -> Int',                doc: 'Least common multiple' },
    { name: 'isPrime',       sig: 'fn isPrime(n: Int) -> Bool',                   doc: 'Primality test' },
    { name: 'fibonacci',     sig: 'fn fibonacci(n: Int) -> Int',                  doc: 'Nth Fibonacci number' },
  ]},
  // ── File System ──────────────────────────────────────────────────────────
  { module: 'fs', members: [
    { name: 'readFile',   sig: 'fn readFile(path: String) -> Result<String, Error>',   doc: 'Read file as string' },
    { name: 'writeFile',  sig: 'fn writeFile(path: String, data: String) -> Result<Unit, Error>', doc: 'Write string to file' },
    { name: 'appendFile', sig: 'fn appendFile(path: String, data: String) -> Result<Unit, Error>', doc: 'Append to file' },
    { name: 'exists',     sig: 'fn exists(path: String) -> Bool',                     doc: 'Check if path exists' },
    { name: 'readDir',    sig: 'fn readDir(path: String) -> Result<List<String>, Error>', doc: 'List directory' },
    { name: 'deleteFile', sig: 'fn deleteFile(path: String) -> Result<Unit, Error>',  doc: 'Delete a file' },
    { name: 'mkdir',      sig: 'fn mkdir(path: String) -> Result<Unit, Error>',        doc: 'Create directory' },
    { name: 'copyFile',   sig: 'fn copyFile(src: String, dst: String) -> Result<Unit, Error>', doc: 'Copy file' },
    { name: 'moveFile',   sig: 'fn moveFile(src: String, dst: String) -> Result<Unit, Error>', doc: 'Move/rename file' },
    { name: 'cwd',        sig: 'fn cwd() -> String',                                  doc: 'Current working directory' },
  ]},
  // ── HTTP / Network ───────────────────────────────────────────────────────
  { module: 'http', members: [
    { name: 'get',    sig: 'async fn get(url: String) -> Result<Response, Error>',    doc: 'HTTP GET request' },
    { name: 'post',   sig: 'async fn post(url: String, body: String) -> Result<Response, Error>', doc: 'HTTP POST request' },
    { name: 'put',    sig: 'async fn put(url: String, body: String) -> Result<Response, Error>',  doc: 'HTTP PUT request' },
    { name: 'delete', sig: 'async fn delete(url: String) -> Result<Response, Error>', doc: 'HTTP DELETE request' },
    { name: 'serve',  sig: 'fn serve(port: Int, handler: fn(Request)->Response)',      doc: 'Start HTTP server' },
    { name: 'Router', sig: 'class Router',                                             doc: 'HTTP Router for path matching' },
  ]},
  // ── JSON ─────────────────────────────────────────────────────────────────
  { module: 'json', members: [
    { name: 'parse',     sig: 'fn parse(s: String) -> Result<Any, Error>',  doc: 'Parse JSON string' },
    { name: 'stringify', sig: 'fn stringify(value: Any) -> String',         doc: 'Serialize to JSON string' },
    { name: 'format',    sig: 'fn format(value: Any, indent: Int) -> String', doc: 'Pretty-print JSON' },
  ]},
  // ── Env / Process ────────────────────────────────────────────────────────
  { module: 'env', members: [
    { name: 'get',     sig: 'fn get(name: String) -> Option<String>',      doc: 'Read environment variable' },
    { name: 'set',     sig: 'fn set(name: String, value: String)',          doc: 'Set environment variable' },
    { name: 'args',    sig: 'fn args() -> List<String>',                   doc: 'Command-line arguments' },
    { name: 'exit',    sig: 'fn exit(code: Int)',                           doc: 'Exit process with code' },
    { name: 'platform',sig: 'fn platform() -> String',                     doc: 'OS platform string' },
  ]},
  // ── Time ─────────────────────────────────────────────────────────────────
  { module: 'time', members: [
    { name: 'now',      sig: 'fn now() -> Int',                             doc: 'Unix timestamp (ms)' },
    { name: 'sleep',    sig: 'async fn sleep(ms: Int)',                     doc: 'Sleep for N milliseconds' },
    { name: 'format',   sig: 'fn format(ts: Int, fmt: String) -> String',  doc: 'Format timestamp' },
    { name: 'duration', sig: 'fn duration(from: Int, to: Int) -> Int',     doc: 'Duration between timestamps' },
  ]},
  // ── Random ───────────────────────────────────────────────────────────────
  { module: 'random', members: [
    { name: 'int',    sig: 'fn int(min: Int, max: Int) -> Int',    doc: 'Random integer in [min, max]' },
    { name: 'float',  sig: 'fn float() -> Float64',                doc: 'Random float in [0.0, 1.0)' },
    { name: 'bool',   sig: 'fn bool() -> Bool',                    doc: 'Random boolean' },
    { name: 'seed',   sig: 'fn seed(s: Int)',                      doc: 'Seed the RNG' },
    { name: 'choice', sig: 'fn choice<T>(list: List<T>) -> T',    doc: 'Random element from list' },
    { name: 'shuffle',sig: 'fn shuffle<T>(list: List<T>) -> List<T>', doc: 'Shuffle a list' },
  ]},
  // ── Regex ────────────────────────────────────────────────────────────────
  { module: 'regex', members: [
    { name: 'match',    sig: 'fn match(pattern: String, text: String) -> Bool',    doc: 'Test if pattern matches text' },
    { name: 'find',     sig: 'fn find(pattern: String, text: String) -> Option<String>', doc: 'Find first match' },
    { name: 'findAll',  sig: 'fn findAll(pattern: String, text: String) -> List<String>', doc: 'Find all matches' },
    { name: 'replace',  sig: 'fn replace(pattern: String, text: String, rep: String) -> String', doc: 'Replace matches' },
    { name: 'split',    sig: 'fn split(pattern: String, text: String) -> List<String>', doc: 'Split by regex' },
  ]},
  // ── Crypto / Hashing ─────────────────────────────────────────────────────
  { module: 'crypto', members: [
    { name: 'sha256',  sig: 'fn sha256(data: String) -> String',   doc: 'SHA-256 hex digest' },
    { name: 'md5',     sig: 'fn md5(data: String) -> String',      doc: 'MD5 hex digest' },
    { name: 'base64encode', sig: 'fn base64encode(s: String) -> String', doc: 'Base64 encode' },
    { name: 'base64decode', sig: 'fn base64decode(s: String) -> Result<String, Error>', doc: 'Base64 decode' },
    { name: 'uuid',    sig: 'fn uuid() -> String',                 doc: 'Generate a UUID v4' },
  ]},
];

// Offer only built-ins implemented by the current compiler/runtime.
STDLIB.splice(0, STDLIB.length, {
  module: null,
  members: [
    { name: 'print', kind: 'function', sig: 'fn print(value: Any)', doc: 'Print a value to stdout' },
    { name: 'println', kind: 'function', sig: 'fn println(value: Any)', doc: 'Print a value with newline' },
    { name: 'len', kind: 'function', sig: 'fn len(value: Any) -> Int', doc: 'Return the length of a collection or string' },
    { name: 'assert', kind: 'function', sig: 'fn assert(condition: Bool, message: String)', doc: 'Assert a condition' },
    { name: 'type_of', kind: 'function', sig: 'fn type_of(value: Any) -> String', doc: 'Return the runtime type name' },
    ...['Map', 'HashMap', 'Set', 'HashSet', 'Stack', 'Queue', 'Deque', 'MinHeap', 'PriorityQueue', 'MaxHeap', 'LinkedList', 'DoublyLinkedList', 'BST', 'BinarySearchTree', 'AVLTree', 'RedBlackTree', 'Trie', 'Graph', 'LRUCache', 'LFUCache', 'CircularBuffer', 'BloomFilter', 'DisjointSet', 'UnionFind', 'SegmentTree', 'FenwickTree', 'BitSet', 'SkipList', 'Matrix', 'SparseMatrix', 'TreeMap', 'TreeSet'].map((name) => ({
      name,
      kind: 'class',
      sig: `class ${name}`,
      doc: `Built-in ${name} data structure`,
    })),
  ],
});

// Build flat lookup maps
const MODULE_NAMES = STDLIB.filter(m => m.module).map(m => m.module);
const MEMBER_MAP = {}; // module -> member[]
const ALL_MEMBERS = []; // { module, member } for global search
for (const lib of STDLIB) {
  if (lib.module) MEMBER_MAP[lib.module] = lib.members;
  for (const m of lib.members) {
    ALL_MEMBERS.push({ module: lib.module, member: m });
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Get the import line that should be added for a given module.
 */
function importLineFor(module) {
  return `import ${module};\n`;
}

/**
 * Check if a given module is already imported in the document.
 */
function isImported(document, module) {
  const text = document.getText();
  // Match: import module; or import module.Member;
  const re = new RegExp(`^\\s*import\\s+${module}(\\.|;)`, 'm');
  return re.test(text);
}

/**
 * Build an additionalTextEdit to insert an import at the top of the file,
 * right after any existing imports (or at line 0 if none exist).
 */
function buildImportEdit(document, module) {
  const text = document.getText();
  const lines = text.split('\n');

  // Find last existing import line
  let lastImportLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import\s+/.test(lines[i])) {
      lastImportLine = i;
    }
  }

  const insertLine = lastImportLine + 1;
  const insertPos = new vscode.Position(insertLine, 0);
  return new vscode.TextEdit(
    new vscode.Range(insertPos, insertPos),
    importLineFor(module)
  );
}

/**
 * Detect unused imports in the document and return diagnostics.
 */
function detectUnusedImports(document) {
  const text = document.getText();
  const lines = text.split('\n');
  const diags = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const importMatch = line.match(/^\s*import\s+(\w+)\s*;/);
    if (!importMatch) continue;

    const moduleName = importMatch[1];

    // Check if any member of this module is used in the file
    const members = MEMBER_MAP[moduleName] || [];
    let used = false;

    if (members.length === 0) {
      // Unknown module — don't flag
      continue;
    }

    for (const m of members) {
      // Look for module.member or just member() usage
      const reModule = new RegExp(`\\b${moduleName}\\.${m.name}\\b`);
      const reDirect = new RegExp(`\\b${m.name}\\s*[\\(]`);
      if (reModule.test(text) || reDirect.test(text)) {
        used = true;
        break;
      }
    }

    if (!used) {
      const startChar = line.indexOf('import');
      const endChar = line.length;
      const range = new vscode.Range(i, startChar, i, endChar);
      const diag = new vscode.Diagnostic(
        range,
        `Unused import: '${moduleName}' is imported but never used.`,
        vscode.DiagnosticSeverity.Warning
      );
      diag.source = 'prady';
      diag.code = 'W0001';
      diag.tags = [vscode.DiagnosticTag.Unnecessary]; // Grays out the text
      diags.push(diag);
    }
  }

  return diags;
}

// ─── LSP Helpers ────────────────────────────────────────────────────────────

function findLspBinary(context) {
  const binName = process.platform === 'win32' ? 'prady-lsp.exe' : 'prady-lsp';
  const cfg = vscode.workspace.getConfiguration('prady');
  const userSetting = cfg.get('lspServerPath', '');
  if (userSetting && fs.existsSync(userSetting)) return userSetting;
  const bundled = path.join(context.extensionPath, binName);
  if (fs.existsSync(bundled)) return bundled;
  const home = process.env.USERPROFILE || process.env.HOME || '';
  if (home) {
    const pradyBin = path.join(home, '.prady', 'bin', binName);
    if (fs.existsSync(pradyBin)) return pradyBin;
    const cargoBin = path.join(home, '.cargo', 'bin', binName);
    if (fs.existsSync(cargoBin)) return cargoBin;
  }
  const cliPath = cfg.get('executablePath', 'prady');
  if (cliPath && path.isAbsolute(cliPath)) {
    const adjacent = path.join(path.dirname(cliPath), binName);
    if (fs.existsSync(adjacent)) return adjacent;
  }
  const wf = vscode.workspace.workspaceFolders;
  if (wf && wf.length > 0) {
    for (const folder of wf) {
      for (const profile of ['release', 'debug']) {
        const candidate = path.join(folder.uri.fsPath, 'target', profile, binName);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }
  return binName;
}

function findCliBinary() {
  const binName = process.platform === 'win32' ? 'prady.exe' : 'prady';
  const cfg = vscode.workspace.getConfiguration('prady');
  const userSetting = cfg.get('executablePath', 'prady');
  if (userSetting && userSetting !== 'prady' && fs.existsSync(userSetting)) return userSetting;
  const home = process.env.USERPROFILE || process.env.HOME || '';
  if (home) {
    const pradyBin = path.join(home, '.prady', 'bin', binName);
    if (fs.existsSync(pradyBin)) return pradyBin;
    const cargoBin = path.join(home, '.cargo', 'bin', binName);
    if (fs.existsSync(cargoBin)) return cargoBin;
  }
  const bundled = path.join(extensionDirectory, binName);
  if (fs.existsSync(bundled)) return bundled;
  return 'prady';
}

function sendRpc(method, params, id = null) {
  if (!lspProcess || !lspProcess.stdin || !lspProcess.stdin.writable) return;
  const msg = { jsonrpc: '2.0', method, params };
  if (id !== null) msg.id = id;
  const payload = JSON.stringify(msg);
  const header = `Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n`;
  try { lspProcess.stdin.write(header + payload); } catch (_) {}
}

function requestRpc(method, params) {
  return new Promise((resolve) => {
    if (!lspProcess) return resolve(null);
    const id = rpcId++;
    pendingRequests.set(id, { resolve, reject: resolve });
    sendRpc(method, params, id);
    setTimeout(() => {
      if (pendingRequests.has(id)) { pendingRequests.delete(id); resolve(null); }
    }, 2500);
  });
}

function handleIncomingData(data, outputChannel) {
  incomingBuffer = Buffer.concat([incomingBuffer, Buffer.isBuffer(data) ? data : Buffer.from(data)]);
  while (true) {
    const headerEnd = incomingBuffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) break;
    const header = incomingBuffer.subarray(0, headerEnd).toString('ascii');
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) { incomingBuffer = incomingBuffer.subarray(headerEnd + 4); continue; }
    const length = parseInt(match[1], 10);
    const bodyStart = headerEnd + 4;
    if (incomingBuffer.length < bodyStart + length) break;
    const bodyStr = incomingBuffer.subarray(bodyStart, bodyStart + length).toString('utf8');
    incomingBuffer = incomingBuffer.subarray(bodyStart + length);
    try { handleRpcMessage(JSON.parse(bodyStr), outputChannel); } catch (err) {
      outputChannel.appendLine(`[Prady LSP Parse Error] ${err.message}`);
    }
  }
}

function handleRpcMessage(msg, outputChannel) {
  if (msg.method === 'textDocument/publishDiagnostics' && msg.params) {
    const { uri, diagnostics } = msg.params;
    const targetUri = vscode.Uri.parse(uri);
    const vsDiagnostics = (diagnostics || []).map((d) => {
      const startLine = d.range.start.line;
      const startChar = d.range.start.character;
      let endLine = d.range.end.line;
      let endChar = d.range.end.character;
      if (startLine === endLine && endChar <= startChar) endChar = startChar + 1;
      const range = new vscode.Range(startLine, startChar, endLine, endChar);
      const severity = d.severity === 2 ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error;
      const diag = new vscode.Diagnostic(range, d.message, severity);
      diag.source = 'prady';
      if (d.code) diag.code = d.code;
      return diag;
    });
    lspDiagnostics.set(uri, vsDiagnostics);
    mergeDiagnostics(uri);
    return;
  }
  if (msg.id !== undefined && pendingRequests.has(msg.id)) {
    const { resolve } = pendingRequests.get(msg.id);
    pendingRequests.delete(msg.id);
    resolve(msg.result);
  }
}

function startLspServer(context, outputChannel) {
  const lspBin = findLspBinary(context);
  outputChannel.appendLine(`[Prady] Starting LSP server binary: ${lspBin}`);
  try {
    lspProcess = cp.spawn(lspBin, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    lspProcess.stdout.on('data', (chunk) => handleIncomingData(chunk, outputChannel));
    lspProcess.stderr.on('data', (chunk) => outputChannel.appendLine(`[LSP Error] ${chunk.toString('utf8').trim()}`));
    lspProcess.on('error', (err) => {
      outputChannel.appendLine(`[LSP Spawn Failed] ${err.message}. Falling back to CLI linting.`);
      lspProcess = null;
    });
    lspProcess.on('exit', (code) => {
      outputChannel.appendLine(`[LSP Exited] Code: ${code}`);
      lspProcess = null;
    });
    sendRpc('initialize', {
      processId: process.pid,
      rootUri: vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.toString() : null,
      capabilities: { textDocument: { synchronization: { dynamicRegistration: true }, hover: { dynamicRegistration: true }, definition: { dynamicRegistration: true }, documentSymbol: { dynamicRegistration: true }, completion: { dynamicRegistration: true } } },
    }, 0);
    sendRpc('initialized', {});
  } catch (err) {
    outputChannel.appendLine(`[LSP Exception] ${err.message}`);
    lspProcess = null;
  }
}

// ─── Document Diagnostics (combined LSP + built-in import analysis) ──────────

let debounceTimer = null;
// Per-doc diagnostics from LSP
const lspDiagnostics = new Map(); // uri -> Diagnostic[]
// Per-doc diagnostics from import analysis
const importDiagnostics = new Map(); // uri -> Diagnostic[]
const runDiagnostics = new Map(); // uri -> entry uri -> Diagnostic[]
const runDiagnosticFiles = new Map(); // entry uri -> diagnostic uri[]

function mergeDiagnostics(uri) {
  const lsp = lspDiagnostics.get(uri) || [];
  const imp = importDiagnostics.get(uri) || [];
  const run = [...(runDiagnostics.get(uri) || new Map()).values()].flat();
  const seen = new Set();
  const diagnostics = [...lsp, ...imp, ...run].filter((diag) => {
    const key = `${diag.range.start.line}:${diag.range.start.character}:${diag.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  diagnosticCollection.set(vscode.Uri.parse(uri), diagnostics);
}

function clearRunDiagnostics(entryUri) {
  const targets = new Set(runDiagnosticFiles.get(entryUri) || []);
  targets.add(entryUri);
  for (const [uri, entries] of runDiagnostics) {
    if (entries.has(entryUri)) {
      entries.delete(entryUri);
      targets.add(uri);
      if (entries.size === 0) runDiagnostics.delete(uri);
    }
  }
  runDiagnosticFiles.delete(entryUri);

  const otherEntries = runDiagnostics.get(entryUri);
  if (otherEntries) {
    for (const sourceUri of otherEntries.keys()) {
      const files = runDiagnosticFiles.get(sourceUri);
      if (files) {
        files.delete(entryUri);
        if (files.size === 0) runDiagnosticFiles.delete(sourceUri);
      }
    }
    runDiagnostics.delete(entryUri);
  }
  for (const uri of targets) mergeDiagnostics(uri);
}

function setRunDiagnostics(entryUri, parsedDiagnostics) {
  clearRunDiagnostics(entryUri);
  const grouped = new Map();
  for (const item of parsedDiagnostics) {
    const uri = vscode.Uri.file(item.filePath).toString();
    const range = new vscode.Range(
      item.startLine,
      item.startCharacter,
      item.endLine,
      Math.max(item.endCharacter, item.startCharacter + 1)
    );
    const diagnostic = new vscode.Diagnostic(
      range,
      item.message,
      item.severity === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error
    );
    diagnostic.source = 'prady';
    diagnostic.code = item.code || (item.message.toLowerCase().startsWith('runtime error') ? 'PRADY_RUNTIME' : 'PRADY_COMPILE');
    if (!grouped.has(uri)) grouped.set(uri, []);
    grouped.get(uri).push(diagnostic);
  }

  const targets = new Set([entryUri, ...grouped.keys()]);
  runDiagnosticFiles.set(entryUri, targets);
  for (const uri of targets) {
    const diagnostics = grouped.get(uri);
    if (diagnostics && diagnostics.length > 0) {
      if (!runDiagnostics.has(uri)) runDiagnostics.set(uri, new Map());
      runDiagnostics.get(uri).set(entryUri, diagnostics);
    }
  }
  for (const uri of targets) mergeDiagnostics(uri);
}

let workspaceDeclarationsPromise = null;

async function getWorkspaceDeclarations(currentDocument) {
  if (!workspaceDeclarationsPromise) {
    workspaceDeclarationsPromise = (async () => {
      const files = await vscode.workspace.findFiles('**/*.pr', '**/{target,node_modules,.git}/**', 500);
      const declarations = [];
      for (const uri of files) {
        try {
          const text = await fs.promises.readFile(uri.fsPath, 'utf8');
          for (const declaration of extractWorkspaceDeclarations(text)) {
            declarations.push({ ...declaration, uri, source: text });
          }
        } catch (err) {
          console.error(`Prady: unable to read ${uri.fsPath}: ${err.message}`);
        }
      }
      return declarations;
    })().catch((err) => {
      workspaceDeclarationsPromise = null;
      throw err;
    });
  }

  const declarations = (await workspaceDeclarationsPromise).filter(
    (declaration) => declaration.uri.toString() !== currentDocument.uri.toString()
  );
  for (const openDocument of vscode.workspace.textDocuments) {
    if (openDocument.languageId !== 'prady' || openDocument.uri.toString() === currentDocument.uri.toString()) continue;
    for (const declaration of extractWorkspaceDeclarations(openDocument.getText())) {
      declarations.push({ ...declaration, uri: openDocument.uri, source: openDocument.getText() });
    }
  }
  return [
    ...declarations,
    ...extractWorkspaceDeclarations(currentDocument.getText()).map((declaration) => ({
      ...declaration,
      uri: currentDocument.uri,
      source: currentDocument.getText(),
    })),
  ];
}

function detectUnresolvedImports(document) {
  const diagnostics = [];
  const importPattern = /^\s*import\s+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*;/gm;
  let match;
  while ((match = importPattern.exec(document.getText()))) {
    const segments = match[1].split('.');
    if (segments[0] === 'std') continue;
    const baseDirectory = path.dirname(document.uri.fsPath);
    const relativePath = path.join(...segments) + '.pr';
    const candidates = [
      path.resolve(baseDirectory, relativePath),
      path.resolve(baseDirectory, 'src', relativePath),
    ];
    if (candidates.some((candidate) => fs.existsSync(candidate))) continue;

    const start = document.positionAt(match.index + match[0].indexOf(match[1]));
    const end = document.positionAt(match.index + match[0].indexOf(match[1]) + match[1].length);
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(start, end),
      `Cannot resolve imported module '${match[1]}'. Expected '${relativePath.replace(/\\/g, '/')}'.`,
      vscode.DiagnosticSeverity.Error
    );
    diagnostic.source = 'prady';
    diagnostic.code = 'E0101';
    diagnostics.push(diagnostic);
  }
  return diagnostics;
}

function runImportAnalysis(document) {
  if (document.languageId !== 'prady') return;
  const uri = document.uri.toString();
  const unused = detectUnusedImports(document);
  importDiagnostics.set(uri, [...unused, ...detectUnresolvedImports(document)]);
  mergeDiagnostics(uri);
}

function notifyDocumentChange(document, outputChannel) {
  if (document.languageId !== 'prady') return;
  const uri = document.uri.toString();
  clearRunDiagnostics(uri);
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const uriStr = document.uri.toString();
    const text = document.getText();
    if (lspProcess) {
      sendRpc('textDocument/didChange', {
        textDocument: { uri: uriStr, version: document.version },
        contentChanges: [{ text }],
      });
    } else {
      runCliLint(document, outputChannel);
    }
    // Always run import analysis (no LSP needed)
    runImportAnalysis(document);
  }, 200);
}

function runCliLint(document, outputChannel) {
  const cli = findCliBinary();
  const filePath = document.uri.fsPath;
  if (!fs.existsSync(filePath)) return;
  outputChannel.appendLine(`$ prady check "${filePath}"`);
  cp.execFile(cli, ['check', filePath], { cwd: path.dirname(filePath) }, (err, stdout, stderr) => {
    const output = `${stdout || ''}${stderr ? `${stdout ? '\n' : ''}${stderr}` : ''}`;
    if (output) outputChannel.append(output);
    if (err && !stdout && !stderr) {
      outputChannel.appendLine(`[Prady check failed] ${err.message}`);
      return;
    }
    setRunDiagnostics(document.uri.toString(), parseCliDiagnostics(output));
  });
}

async function runPradyFile(document, outputChannel) {
  if (document.isDirty && !(await document.save())) return;
  const cli = findCliBinary();
  const filePath = document.uri.fsPath;
  outputChannel.clear();
  outputChannel.appendLine(`$ prady run "${filePath}"`);
  const writeEmitter = new vscode.EventEmitter();
  const closeEmitter = new vscode.EventEmitter();
  let child = null;
  let output = '';
  const uri = document.uri.toString();

  const pty = {
    onDidWrite: writeEmitter.event,
    onDidClose: closeEmitter.event,
    open() {
      child = cp.spawn(cli, ['run', filePath], {
        cwd: path.dirname(filePath),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      const forward = (chunk) => {
        const text = chunk.toString('utf8');
        output += text;
        outputChannel.append(text);
        writeEmitter.fire(text.replace(/\r?\n/g, '\r\n'));
      };
      child.stdout.on('data', forward);
      child.stderr.on('data', forward);
      child.on('error', (err) => {
        const message = `Prady could not run this file: ${err.message}`;
        outputChannel.appendLine(message);
        writeEmitter.fire(`${message}\r\n`);
        vscode.window.showErrorMessage(message);
      });
      child.on('close', (code) => {
        setRunDiagnostics(uri, parseCliDiagnostics(output));
        closeEmitter.fire(code === null ? undefined : code);
      });
    },
    close() {
      if (child && !child.killed) child.kill();
      writeEmitter.dispose();
      closeEmitter.dispose();
    },
    handleInput(data) {
      if (child && child.stdin.writable) child.stdin.write(data);
    },
  };

  const terminal = vscode.window.createTerminal({ name: 'Prady Run', pty });
  terminal.show(true);
}

// ─── activate ────────────────────────────────────────────────────────────────

function activate(context) {
  extensionDirectory = context.extensionPath;
  const outputChannel = vscode.window.createOutputChannel('Prady Language Server');
  diagnosticCollection = vscode.languages.createDiagnosticCollection('prady');
  context.subscriptions.push(diagnosticCollection, outputChannel);

  startLspServer(context, outputChannel);

  // Document listeners
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (doc.languageId !== 'prady') return;
      if (lspProcess) {
        sendRpc('textDocument/didOpen', {
          textDocument: { uri: doc.uri.toString(), languageId: 'prady', version: doc.version, text: doc.getText() },
        });
      }
      runCliLint(doc, outputChannel);
      runImportAnalysis(doc);
    }),
    vscode.workspace.onDidChangeTextDocument((e) => notifyDocumentChange(e.document, outputChannel)),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.languageId !== 'prady') return;
      workspaceDeclarationsPromise = null;
      if (lspProcess) sendRpc('textDocument/didSave', { textDocument: { uri: doc.uri.toString() } });
      for (const openDocument of vscode.workspace.textDocuments) {
        if (openDocument.languageId === 'prady') runCliLint(openDocument, outputChannel);
      }
      runImportAnalysis(doc);
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      clearRunDiagnostics(doc.uri.toString());
      diagnosticCollection.delete(doc.uri);
      importDiagnostics.delete(doc.uri.toString());
      lspDiagnostics.delete(doc.uri.toString());
      if (lspProcess && doc.languageId === 'prady') sendRpc('textDocument/didClose', { textDocument: { uri: doc.uri.toString() } });
    }),
    vscode.workspace.onDidCreateFiles(() => { workspaceDeclarationsPromise = null; }),
    vscode.workspace.onDidDeleteFiles(() => { workspaceDeclarationsPromise = null; })
  );

  // Trigger on already-open documents
  vscode.workspace.textDocuments.forEach((doc) => {
    if (doc.languageId === 'prady') {
      notifyDocumentChange(doc, outputChannel);
      runCliLint(doc, outputChannel);
    }
  });

  // ─── Hover ────────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.languages.registerHoverProvider('prady', {
      async provideHover(document, position) {
        // 1. Try LSP hover first
        const res = await requestRpc('textDocument/hover', {
          textDocument: { uri: document.uri.toString() },
          position: { line: position.line, character: position.character },
        });
        if (res && res.contents) {
          const contents = Array.isArray(res.contents) ? res.contents : [res.contents];
          return new vscode.Hover(contents.map((c) => new vscode.MarkdownString(typeof c === 'string' ? c : c.value)));
        }

        // 2. Built-in stdlib hover
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) return null;
        const word = document.getText(wordRange);
        const entry = ALL_MEMBERS.find(e => e.member.name === word);
        if (entry) {
          const md = new vscode.MarkdownString();
          md.appendCodeblock(entry.member.sig, 'prady');
          md.appendText(`\n${entry.member.doc}\n\nFrom module: \`${entry.module}\``);
          return new vscode.Hover(md);
        }
        return null;
      },
    })
  );

  // ─── Go-To Definition ─────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider('prady', {
      async provideDefinition(document, position) {
        const res = await requestRpc('textDocument/definition', {
          textDocument: { uri: document.uri.toString() },
          position: { line: position.line, character: position.character },
        });
        if (res) {
          const locs = Array.isArray(res) ? res : [res];
          return locs.map((l) => new vscode.Location(vscode.Uri.parse(l.uri), new vscode.Range(l.range.start.line, l.range.start.character, l.range.end.line, l.range.end.character)));
        }
        return null;
      },
    })
  );

  // ─── Completion Provider (auto-import) ────────────────────────────────────
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      'prady',
      {
        async provideCompletionItems(document, position, _token, context) {
          const linePrefix = document.lineAt(position).text.substring(0, position.character);
          const items = [];
          const source = document.getText();
          const cursorOffset = document.offsetAt(position);

          // ── Instance and class member completions ──────────────────────────
          const receiverMatch = linePrefix.match(/\b([A-Za-z_]\w*)\.$/);
          if (receiverMatch) {
            const receiver = receiverMatch[1];
            const declarations = await getWorkspaceDeclarations(document);
            const receiverType = inferReceiverType(source, receiver, cursorOffset)
              || (declarations.some((declaration) => declaration.name === receiver) ? receiver : null);
            if (receiverType) {
              const typeDeclaration = declarations.find((declaration) => declaration.name === receiverType);
              const memberSource = typeDeclaration ? typeDeclaration.source : source;
              const members = getMemberSignatures(memberSource, receiverType, cursorOffset);
              if (members.length > 0) {
                return members.map((member) => {
                  const kind = member.kind === 'field'
                    ? vscode.CompletionItemKind.Field
                    : vscode.CompletionItemKind.Method;
                  const item = new vscode.CompletionItem(member.name, kind);
                  item.detail = member.signature;
                  item.sortText = `0${member.name}`;
                  return item;
                });
              }
            }
          }

          // ── Dot-access completions: "module." ──────────────────────────────
          const dotMatch = linePrefix.match(/\b(\w+)\.$/);
          if (dotMatch) {
            const moduleName = dotMatch[1];
            const members = MEMBER_MAP[moduleName];
            if (members) {
              for (const m of members) {
                const item = new vscode.CompletionItem(m.name, vscode.CompletionItemKind.Function);
                item.detail = m.sig;
                item.documentation = new vscode.MarkdownString(m.doc);
                item.sortText = '0' + m.name;

                // Auto-insert import if not already present
                if (!isImported(document, moduleName)) {
                  item.additionalTextEdits = [buildImportEdit(document, moduleName)];
                  item.detail = `${m.sig}  [auto-import: ${moduleName}]`;
                }

                items.push(item);
              }
              return items; // Return immediately for dot completions
            }
          }

          // ── Module name completions: type the module name ──────────────────
          const wordMatch = linePrefix.match(/\b(\w+)$/);
          const typedWord = wordMatch ? wordMatch[1].toLowerCase() : '';

          // Add stdlib member completions with auto-import
          for (const { module, member } of ALL_MEMBERS) {
            if (!member.name.toLowerCase().startsWith(typedWord) && typedWord.length > 0) continue;

            const kind = member.kind === 'class'
              ? vscode.CompletionItemKind.Class
              : vscode.CompletionItemKind.Function;
            const item = new vscode.CompletionItem(member.name, kind);
            item.detail = member.sig;
            item.documentation = new vscode.MarkdownString(
              module ? `${member.doc}\n\nFrom module \`${module}\`` : member.doc
            );
            item.sortText = `1${module || ''}${member.name}`;

            if (module && !isImported(document, module)) {
              item.additionalTextEdits = [buildImportEdit(document, module)];
              item.detail += `  ← auto-import: ${module}`;
            }

            items.push(item);
          }

          // Add declarations from other .pr files, with a matching import edit.
          const declarations = await getWorkspaceDeclarations(document);
          for (const declaration of declarations) {
            if (declaration.uri.toString() === document.uri.toString()) continue;
            if (typedWord && !declaration.name.toLowerCase().startsWith(typedWord)) continue;
            if (declaration.kind === 'fn' && !/^[a-z_]/.test(declaration.name)) continue;
            const modulePath = modulePathFor(document.uri.fsPath, declaration.uri.fsPath);
            if (!modulePath || isImported(document, modulePath)) continue;

            const kind = declaration.kind === 'fn'
              ? vscode.CompletionItemKind.Function
              : declaration.kind === 'class'
                ? vscode.CompletionItemKind.Class
                : declaration.kind === 'struct'
                  ? vscode.CompletionItemKind.Struct
                  : vscode.CompletionItemKind.TypeParameter;
            const item = new vscode.CompletionItem(declaration.name, kind);
            item.detail = `${declaration.signature}  [auto-import: ${modulePath}]`;
            item.documentation = new vscode.MarkdownString(`From \`${path.relative(path.dirname(document.uri.fsPath), declaration.uri.fsPath)}\``);
            item.sortText = `0${declaration.name}`;
            item.additionalTextEdits = [buildImportEdit(document, modulePath)];
            items.push(item);
          }

          // Add module name completions (for typing "math", "io", etc.)
          for (const mod of MODULE_NAMES) {
            if (typedWord.length > 0 && !mod.startsWith(typedWord)) continue;
            const item = new vscode.CompletionItem(mod, vscode.CompletionItemKind.Module);
            item.detail = `Module: ${mod}`;
            item.documentation = new vscode.MarkdownString(`Import all members of the \`${mod}\` standard library module.\n\nUsage: \`${mod}.functionName()\``);
            item.sortText = '2' + mod;
            if (!isImported(document, mod)) {
              item.additionalTextEdits = [buildImportEdit(document, mod)];
            }
            items.push(item);
          }

          // Also try LSP completions and merge
          try {
            const res = await requestRpc('textDocument/completion', {
              textDocument: { uri: document.uri.toString() },
              position: { line: position.line, character: position.character },
            });
            if (res) {
              const lspItems = Array.isArray(res) ? res : res.items || [];
              for (const i of lspItems) {
                const lspItem = new vscode.CompletionItem(i.label, i.kind);
                lspItem.detail = i.detail;
                lspItem.documentation = i.documentation;
                lspItem.sortText = '3' + i.label;
                items.push(lspItem);
              }
            }
          } catch (_) {}

          return items;
        },
      },
      '.', ':', // Trigger on dot and colon
      ...('abcdefghijklmnopqrstuvwxyz'.split('')) // Trigger on letters too
    )
  );

  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider('prady', {
      async provideDocumentFormattingEdits(document) {
        const cli = findCliBinary();
        const temporaryFile = path.join(
          os.tmpdir(),
          `prady-format-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.pr`
        );
        try {
          await fs.promises.writeFile(temporaryFile, document.getText(), 'utf8');
          await new Promise((resolve, reject) => {
            cp.execFile(cli, ['fmt', temporaryFile], { cwd: path.dirname(document.uri.fsPath) }, (error) => {
              if (error) reject(error);
              else resolve();
            });
          });
          const formatted = await fs.promises.readFile(temporaryFile, 'utf8');
          return [new vscode.TextEdit(
            new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)),
            formatted
          )];
        } finally {
          await fs.promises.rm(temporaryFile, { force: true });
        }
      },
    })
  );

  // ─── Code Action Provider (quick-fix: add missing import) ─────────────────
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider('prady', {
      provideCodeActions(document, range, context) {
        const actions = [];
        for (const diag of context.diagnostics) {
          if (diag.code === 'W0001') {
            // Remove unused import
            const match = diag.message.match(/import '(\w+)'/);
            if (!match) continue;
            const module = match[1];

            const fix = new vscode.CodeAction(
              `Remove unused import '${module}'`,
              vscode.CodeActionKind.QuickFix
            );
            fix.edit = new vscode.WorkspaceEdit();
            // Delete the entire line
            const lineNum = diag.range.start.line;
            fix.edit.delete(document.uri, new vscode.Range(lineNum, 0, lineNum + 1, 0));
            fix.diagnostics = [diag];
            fix.isPreferred = true;
            actions.push(fix);
          }
        }
        return actions;
      },
    }, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] })
  );

  // ─── Status Bar ───────────────────────────────────────────────────────────
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
  statusBar.text = '$(symbol-keyword) Prady v1.0.2';
  statusBar.tooltip = 'Prady Language Server active — Click to see output';
  statusBar.command = 'prady.showOutput';
  statusBar.show();
  context.subscriptions.push(statusBar);

  // ─── Commands ─────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('prady.runFile', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      await runPradyFile(editor.document, outputChannel);
    }),
    vscode.commands.registerCommand('prady.checkFile', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      if (editor.document.isDirty && !(await editor.document.save())) return;
      runCliLint(editor.document, outputChannel);
      outputChannel.show(true);
    }),
    vscode.commands.registerCommand('prady.showAst', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const cli = findCliBinary();
      const terminal = vscode.window.createTerminal('Prady AST');
      terminal.show();
      terminal.sendText(`"${cli}" ast "${editor.document.uri.fsPath}"`);
    }),
    vscode.commands.registerCommand('prady.showOutput', () => outputChannel.show()),
    vscode.commands.registerCommand('prady.organizeImports', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'prady') return;
      const document = editor.document;
      const text = document.getText();
      const lines = text.split('\n');

      // Collect all import lines
      const importLines = lines.filter(l => /^\s*import\s+\w+\s*;/.test(l));
      const sorted = [...new Set(importLines)].sort();

      // Remove all import lines and add sorted block at top
      const nonImportLines = lines.filter(l => !/^\s*import\s+\w+\s*;/.test(l));
      while (nonImportLines.length > 0 && nonImportLines[0].trim() === '') nonImportLines.shift();

      const newText = sorted.join('\n') + (sorted.length > 0 ? '\n\n' : '') + nonImportLines.join('\n');
      editor.edit(eb => eb.replace(new vscode.Range(0, 0, document.lineCount, 0), newText));
      vscode.window.showInformationMessage(`Prady: Imports organized (${sorted.length} imports sorted)`);
    })
  );
}

function deactivate() {
  if (lspProcess) {
    try { sendRpc('shutdown', {}); sendRpc('exit', {}); lspProcess.kill(); } catch (_) {}
    lspProcess = null;
  }
}

module.exports = { activate, deactivate };
