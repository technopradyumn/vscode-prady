<div align="center">

<img src="icon.png" width="80" alt="Prady Language Logo" />

# Prady Language Support for VS Code

**Full IDE support for the Prady Programming Language (`.pr`)**

[![Version](https://img.shields.io/badge/version-1.0.3-blue?style=flat-square)](https://github.com/technopradyumn/vscode-prady/releases)
[![License](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-green?style=flat-square)](LICENSE)
[![Website](https://img.shields.io/badge/website-pradylang.vercel.app-indigo?style=flat-square)](https://pradylang.vercel.app)

[🌐 Website](https://pradylang.vercel.app) &nbsp;|&nbsp;
[📖 Docs](https://pradylang.vercel.app/docs) &nbsp;|&nbsp;
[💡 Extension Guide](https://pradylang.vercel.app/docs/tooling/editor-extensions) &nbsp;|&nbsp;
[▶ Playground](https://pradylang.vercel.app/play) &nbsp;|&nbsp;
[⬇ Download Prady](https://pradylang.vercel.app/download)

</div>

---

## ✨ Features

| Feature | Details |
|---|---|
| 🎨 **Syntax Highlighting** | Keywords, types, functions, comments, decorators (`@test`), architecture blocks (`architecture`, `layer`, `spec`) |
| ⚡ **Code Runner** | Click the ▶ button to run `.pr` files in an interactive terminal; `input()` reads from that terminal, while output and runtime errors appear in editor diagnostics |
| 🔍 **Diagnostics** | Syntax/parser and unresolved local import diagnostics update while editing; save or run `Prady: Check File` to refresh compiler diagnostics |
| 🔵 **LSP Integration** | Hover and go-to-definition where supported, workspace class/function completions, local member suggestions, and relative auto-imports |
| 🎨 **Formatting** | Run `Format Document` to use `prady fmt`; enable it on save with VS Code's `[prady]` editor setting |
| 💡 **Snippets** | Quick expansions for `fn`, `main`, `let`, `letmut`, `arch`, `struct`, and `@test` |
| 📐 **Smart Editing** | Auto-closing brackets, `//` line comments, smart indentation, and bracket colorization |
| 🏷️ **File Icons** | Custom `.pr` file icon in the Explorer sidebar |

---

## 📦 Installation

### Option 1 — Install the `.vsix` manually (Recommended)

1. Download the latest `.vsix` from the [Releases page](https://github.com/technopradyumn/vscode-prady/releases)
2. Open VS Code → **Extensions** (`Ctrl+Shift+X`)
3. Click **`···`** (top-right menu) → **Install from VSIX...**
4. Select the downloaded `.vsix` file

### Option 2 — VS Code Marketplace

> Search for **"Prady Language"** by `technopradyumn` in the Extensions panel.

---

## ⚙️ Requirements

The extension requires the **Prady compiler** (`prady`) to be installed on your system.

**Install Prady in one line:**

**macOS / Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/technopradyumn/prady/main/install.sh | sh
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/technopradyumn/prady/main/install.ps1 | iex
```

Or download standalone binaries from:
**[pradylang.vercel.app/download](https://pradylang.vercel.app/download)**

> Full installation guide: **[pradylang.vercel.app/docs/getting-started/installation](https://pradylang.vercel.app/docs/getting-started/installation)**

---

## ⌨️ Commands

Open the Command Palette (`Ctrl+Shift+P`) and search for:

| Command | Description |
|---|---|
| `Prady: Run File` | Run the current `.pr` file with `prady run` |
| `Prady: Check File` | Type-check and show diagnostics |
| `Prady: Show AST` | Print the Abstract Syntax Tree for the current file |
| `Prady: Show LSP Output` | Open the LSP log channel for debugging |

**Keyboard shortcuts:**
- `Ctrl+Alt+N` — Run current `.pr` file

Programs can read a line from the interactive terminal with `input()` or display a prompt with `input("Name: ")`.

---

## 🔧 Settings

Configure in VS Code Settings (`Ctrl+,`):

| Setting | Default | Description |
|---|---|---|
| `prady.executablePath` | `"prady"` | Path to the `prady` CLI binary |
| `prady.lspServerPath` | `""` | Path to `prady-lsp` (auto-detected if empty) |

Format with **Format Document**. To format when saving, configure VS Code's standard setting:

```json
"[prady]": { "editor.formatOnSave": true }
```

The current compiler does not implement full static type checking. The extension reports diagnostics the parser/compiler actually emit and cannot detect every undefined name or type mismatch before execution. It only proposes project imports that map to files it can resolve; documented standard-library namespaces without source modules are not invented as auto-imports.

For the latest diagnostics, completions, formatting, and runner fixes, install **Prady Language 1.0.3 or newer** and restart VS Code. The extension can use the bundled CLI when a matching platform binary is present; otherwise install Prady separately or set `prady.executablePath`.

---

## 💡 Snippets Reference

| Prefix | Expands to |
|---|---|
| `fn` | Function definition with typed parameters |
| `main` | `fn main()` entry point |
| `let` | Immutable variable binding |
| `letmut` | Mutable variable binding (`let mut`) |
| `arch` | `architecture` block with layers |
| `struct` | Struct definition |
| `@test` | Test function with `@test` decorator |

---

## 📚 Documentation

| Resource | Link |
|---|---|
| 💡 VS Code & LSP Guide | [pradylang.vercel.app/docs/tooling/editor-extensions](https://pradylang.vercel.app/docs/tooling/editor-extensions) |
| 📖 Language Docs Home | [pradylang.vercel.app/docs](https://pradylang.vercel.app/docs) |
| 🚀 Getting Started | [pradylang.vercel.app/docs/getting-started/overview](https://pradylang.vercel.app/docs/getting-started/overview) |
| 📖 The Basics | [pradylang.vercel.app/docs/handbook/the-basics](https://pradylang.vercel.app/docs/handbook/the-basics) |
| 🧩 Everyday Types | [pradylang.vercel.app/docs/handbook/everyday-types](https://pradylang.vercel.app/docs/handbook/everyday-types) |
| 🏛️ Architecture Contracts | [pradylang.vercel.app/docs/handbook/architecture-contracts](https://pradylang.vercel.app/docs/handbook/architecture-contracts) |
| 🌲 28 Data Structures | [pradylang.vercel.app/docs/reference/data-structures](https://pradylang.vercel.app/docs/reference/data-structures) |
| ⌨️ CLI Reference | [pradylang.vercel.app/docs/tooling/cli-reference](https://pradylang.vercel.app/docs/tooling/cli-reference) |
| ▶ Playground | [pradylang.vercel.app/play](https://pradylang.vercel.app/play) |

---

## 🔗 Links

| | |
|---|---|
| 🌐 Official Website | https://pradylang.vercel.app |
| 🐙 Compiler Repo | https://github.com/technopradyumn/prady |
| 🔌 Extension Repo | https://github.com/technopradyumn/vscode-prady |
| 🐛 Report a Bug | https://github.com/technopradyumn/vscode-prady/issues |
| 📦 Releases | https://github.com/technopradyumn/vscode-prady/releases |

---

## 📄 License

Licensed under **MIT OR Apache-2.0**. See [LICENSE](LICENSE) for details.
