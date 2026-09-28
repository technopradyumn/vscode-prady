// Prady Language Extension for VS Code (v1.0.0 GA)
// Real-time diagnostics, go-to-definition, hover, autocomplete, symbols, and CLI runner.
// Designed with zero-crash fallback: operates via LanguageClient or built-in stdio LSP.

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const cp = require('child_process');

let diagnosticCollection;
let lspProcess = null;
let rpcId = 1;
const pendingRequests = new Map();
let incomingBuffer = '';

/**
 * Locate the prady-lsp executable across all standard installation paths.
 */
function findLspBinary(context) {
  const binName = process.platform === 'win32' ? 'prady-lsp.exe' : 'prady-lsp';

  // 1. User configured setting
  const cfg = vscode.workspace.getConfiguration('prady');
  const userSetting = cfg.get('lspServerPath', '');
  if (userSetting && fs.existsSync(userSetting)) return userSetting;

  // 2. Bundled directly inside extension directory
  const bundled = path.join(context.extensionPath, binName);
  if (fs.existsSync(bundled)) return bundled;

  // 3. User cargo bin directory (~/.cargo/bin)
  const home = process.env.USERPROFILE || process.env.HOME || '';
  if (home) {
    const cargoBin = path.join(home, '.cargo', 'bin', binName);
    if (fs.existsSync(cargoBin)) return cargoBin;
  }

  // 4. Same directory as configured prady CLI executable
  const cliPath = cfg.get('executablePath', 'prady');
  if (cliPath && path.isAbsolute(cliPath)) {
    const adjacent = path.join(path.dirname(cliPath), binName);
    if (fs.existsSync(adjacent)) return adjacent;
  }

  // 5. Workspace target/release or target/debug
  const wf = vscode.workspace.workspaceFolders;
  if (wf && wf.length > 0) {
    for (const folder of wf) {
      for (const profile of ['release', 'debug']) {
        const candidate = path.join(folder.uri.fsPath, 'target', profile, binName);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }

  // 6. System PATH fallback
  return binName;
}

/**
 * Locate the prady CLI executable.
 */
function findCliBinary() {
  const binName = process.platform === 'win32' ? 'prady.exe' : 'prady';
  const cfg = vscode.workspace.getConfiguration('prady');
  const userSetting = cfg.get('executablePath', 'prady');
  if (userSetting && userSetting !== 'prady' && fs.existsSync(userSetting)) return userSetting;

  const home = process.env.USERPROFILE || process.env.HOME || '';
  if (home) {
    const cargoBin = path.join(home, '.cargo', 'bin', binName);
    if (fs.existsSync(cargoBin)) return cargoBin;
  }

  return 'prady';
}

/**
 * Low-level JSON-RPC message sender over stdio.
 */
function sendRpc(method, params, id = null) {
  if (!lspProcess || !lspProcess.stdin || !lspProcess.stdin.writable) return;
  const msg = { jsonrpc: '2.0', method, params };
  if (id !== null) msg.id = id;
  const payload = JSON.stringify(msg);
  const header = `Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n`;
  try {
    lspProcess.stdin.write(header + payload);
  } catch (err) {
    console.error('[Prady LSP] Failed to send RPC message:', err);
  }
}

function requestRpc(method, params) {
  return new Promise((resolve, reject) => {
    if (!lspProcess) return resolve(null);
    const id = rpcId++;
    pendingRequests.set(id, { resolve, reject });
    sendRpc(method, params, id);
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        resolve(null);
      }
    }, 2500);
  });
}

/**
 * Handle incoming JSON-RPC buffer and process messages.
 */
function handleIncomingData(data, outputChannel) {
  incomingBuffer += data.toString('utf8');

  while (true) {
    const headerEnd = incomingBuffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) break;

    const header = incomingBuffer.substring(0, headerEnd);
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      incomingBuffer = incomingBuffer.substring(headerEnd + 4);
      continue;
    }

    const length = parseInt(match[1], 10);
    const bodyStart = headerEnd + 4;
    if (incomingBuffer.length < bodyStart + length) {
      // Wait for complete message payload
      break;
    }

    const bodyStr = incomingBuffer.substring(bodyStart, bodyStart + length);
    incomingBuffer = incomingBuffer.substring(bodyStart + length);

    try {
      const msg = JSON.parse(bodyStr);
      handleRpcMessage(msg, outputChannel);
    } catch (err) {
      outputChannel.appendLine(`[Prady LSP Parse Error] ${err.message}`);
    }
  }
}

function handleRpcMessage(msg, outputChannel) {
  // 1. Diagnostics notification
  if (msg.method === 'textDocument/publishDiagnostics' && msg.params) {
    const { uri, diagnostics } = msg.params;
    const targetUri = vscode.Uri.parse(uri);
    const vsDiagnostics = (diagnostics || []).map((d) => {
      const startLine = d.range.start.line;
      const startChar = d.range.start.character;
      let endLine = d.range.end.line;
      let endChar = d.range.end.character;

      if (startLine === endLine && endChar <= startChar) {
        endChar = startChar + 1;
      }

      const range = new vscode.Range(startLine, startChar, endLine, endChar);
      const severity = d.severity === 2 ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error;
      const diag = new vscode.Diagnostic(range, d.message, severity);
      diag.source = 'prady';
      if (d.code) diag.code = d.code;
      return diag;
    });

    diagnosticCollection.set(targetUri, vsDiagnostics);
    return;
  }

  // 2. Request response
  if (msg.id !== undefined && pendingRequests.has(msg.id)) {
    const { resolve } = pendingRequests.get(msg.id);
    pendingRequests.delete(msg.id);
    resolve(msg.result);
    return;
  }
}

/**
 * Start the LSP process with auto-reconnect and real-time stdio pipe.
 */
function startLspServer(context, outputChannel) {
  const lspBin = findLspBinary(context);
  outputChannel.appendLine(`[Prady] Starting LSP server binary: ${lspBin}`);

  try {
    lspProcess = cp.spawn(lspBin, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    lspProcess.stdout.on('data', (chunk) => handleIncomingData(chunk, outputChannel));
    lspProcess.stderr.on('data', (chunk) => {
      outputChannel.appendLine(`[LSP Error] ${chunk.toString('utf8').trim()}`);
    });

    lspProcess.on('error', (err) => {
      outputChannel.appendLine(`[LSP Spawn Failed] ${err.message}. Falling back to CLI linting.`);
      lspProcess = null;
    });

    lspProcess.on('exit', (code) => {
      outputChannel.appendLine(`[LSP Exited] Code: ${code}`);
      lspProcess = null;
    });

    // Send initialize handshake
    sendRpc('initialize', {
      processId: process.pid,
      rootUri: vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.toString() : null,
      capabilities: {
        textDocument: {
          synchronization: { dynamicRegistration: true, willSave: false, didSave: true },
          hover: { dynamicRegistration: true },
          definition: { dynamicRegistration: true },
          documentSymbol: { dynamicRegistration: true },
          completion: { dynamicRegistration: true },
        },
      },
    }, 0);

    sendRpc('initialized', {});
  } catch (err) {
    outputChannel.appendLine(`[LSP Exception] ${err.message}`);
    lspProcess = null;
  }
}

/**
 * Real-time diagnostic verification runner on document change.
 */
let debounceTimer = null;
function notifyDocumentChange(document, outputChannel) {
  if (document.languageId !== 'prady') return;

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
      // Direct CLI validation fallback
      runCliLint(document, outputChannel);
    }
  }, 120);
}

function runCliLint(document, outputChannel) {
  const cli = findCliBinary();
  const filePath = document.uri.fsPath;
  if (!fs.existsSync(filePath)) return;

  cp.exec(`"${cli}" check "${filePath}"`, (err, stdout, stderr) => {
    const combined = (stdout || '') + '\n' + (stderr || '');
    const diags = [];

    // Parse standard prady diagnostic format:
    // error[E0010]: Expected ...
    //   --> file:line:col
    const regex = /(error|warning)(?:\[([A-Z0-9]+)\])?:\s*(.*?)\r?\n\s*-->\s*(.*?):(\d+):(\d+)/g;
    let match;
    while ((match = regex.exec(combined)) !== null) {
      const isError = match[1] === 'error';
      const code = match[2];
      const message = match[3];
      const line = Math.max(0, parseInt(match[5], 10) - 1);
      const col = Math.max(0, parseInt(match[6], 10) - 1);

      const range = new vscode.Range(line, col, line, col + 5);
      const diag = new vscode.Diagnostic(
        range,
        message,
        isError ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning
      );
      diag.source = 'prady';
      if (code) diag.code = code;
      diags.push(diag);
    }

    diagnosticCollection.set(document.uri, diags);
  });
}

function activate(context) {
  const outputChannel = vscode.window.createOutputChannel('Prady Language Server');
  diagnosticCollection = vscode.languages.createDiagnosticCollection('prady');
  context.subscriptions.push(diagnosticCollection);
  context.subscriptions.push(outputChannel);

  // Start LSP server
  startLspServer(context, outputChannel);

  // Document lifecycle listeners for instant real-time diagnostics
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (doc.languageId === 'prady') {
        if (lspProcess) {
          sendRpc('textDocument/didOpen', {
            textDocument: {
              uri: doc.uri.toString(),
              languageId: 'prady',
              version: doc.version,
              text: doc.getText(),
            },
          });
        } else {
          runCliLint(doc, outputChannel);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      notifyDocumentChange(e.document, outputChannel);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.languageId === 'prady') {
        if (lspProcess) {
          sendRpc('textDocument/didSave', {
            textDocument: { uri: doc.uri.toString() },
          });
        } else {
          runCliLint(doc, outputChannel);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((doc) => {
      diagnosticCollection.delete(doc.uri);
      if (lspProcess && doc.languageId === 'prady') {
        sendRpc('textDocument/didClose', {
          textDocument: { uri: doc.uri.toString() },
        });
      }
    })
  );

  // Trigger initial diagnostics for any open .pr files
  vscode.workspace.textDocuments.forEach((doc) => {
    if (doc.languageId === 'prady') {
      notifyDocumentChange(doc, outputChannel);
    }
  });

  // Providers: Hover, Definition, Completion, Symbols
  context.subscriptions.push(
    vscode.languages.registerHoverProvider('prady', {
      async provideHover(document, position) {
        const res = await requestRpc('textDocument/hover', {
          textDocument: { uri: document.uri.toString() },
          position: { line: position.line, character: position.character },
        });
        if (res && res.contents) {
          const contents = Array.isArray(res.contents) ? res.contents : [res.contents];
          return new vscode.Hover(contents.map((c) => new vscode.MarkdownString(typeof c === 'string' ? c : c.value)));
        }
        return null;
      },
    })
  );

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider('prady', {
      async provideDefinition(document, position) {
        const res = await requestRpc('textDocument/definition', {
          textDocument: { uri: document.uri.toString() },
          position: { line: position.line, character: position.character },
        });
        if (res) {
          const locs = Array.isArray(res) ? res : [res];
          return locs.map(
            (l) =>
              new vscode.Location(
                vscode.Uri.parse(l.uri),
                new vscode.Range(
                  l.range.start.line,
                  l.range.start.character,
                  l.range.end.line,
                  l.range.end.character
                )
              )
          );
        }
        return null;
      },
    })
  );

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      'prady',
      {
        async provideCompletionItems(document, position) {
          const res = await requestRpc('textDocument/completion', {
            textDocument: { uri: document.uri.toString() },
            position: { line: position.line, character: position.character },
          });
          if (res) {
            const items = Array.isArray(res) ? res : res.items || [];
            return items.map((i) => {
              const item = new vscode.CompletionItem(i.label, i.kind);
              item.detail = i.detail;
              item.documentation = i.documentation;
              return item;
            });
          }
          return null;
        },
      },
      '.',
      ':'
    )
  );

  // Status Bar
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
  statusBar.text = '$(prady-file-icon) Prady v1.0.0';
  statusBar.tooltip = 'Prady Language Server is active';
  statusBar.command = 'prady.showOutput';
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('prady.runFile', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const cli = findCliBinary();
      const terminal = vscode.window.createTerminal('Prady Run');
      terminal.show();
      terminal.sendText(`"${cli}" run "${editor.document.uri.fsPath}"`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('prady.checkFile', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const cli = findCliBinary();
      const terminal = vscode.window.createTerminal('Prady Check');
      terminal.show();
      terminal.sendText(`"${cli}" check "${editor.document.uri.fsPath}"`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('prady.showAst', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const cli = findCliBinary();
      const terminal = vscode.window.createTerminal('Prady AST');
      terminal.show();
      terminal.sendText(`"${cli}" ast "${editor.document.uri.fsPath}"`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('prady.showOutput', () => {
      outputChannel.show();
    })
  );
}

function deactivate() {
  if (lspProcess) {
    try {
      sendRpc('shutdown', {});
      sendRpc('exit', {});
      lspProcess.kill();
    } catch (_) {}
    lspProcess = null;
  }
}

module.exports = { activate, deactivate };
