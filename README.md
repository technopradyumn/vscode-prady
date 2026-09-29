<div align="center">

<img src="icon.png" width="80" alt="Prady Language Logo" />

# Prady Language Support for VS Code

**Full IDE support for the Prady Programming Language (`.pr`)**

[![Version](https://img.shields.io/badge/version-1.0.0-blue?style=flat-square)](https://github.com/technopradyumn/vscode-prady/releases)
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
| ⚡ **Code Runner** | Press `Ctrl+Alt+N` or click the ▶ button in the editor title bar to run `.pr` files with `prady run` |
| 🔍 **Live Diagnostics** | Error and warning squiggles with precise source spans via the LSP and problem matchers |
| 🔵 **LSP Integration** | Hover type info, go-to-definition (`Ctrl+Click`), auto-complete, and document symbols |
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

---

## 🔧 Settings

Configure in VS Code Settings (`Ctrl+,`):

| Setting | Default | Description |
|---|---|---|
| `prady.executablePath` | `"prady"` | Path to the `prady` CLI binary |
| `prady.lspServerPath` | `""` | Path to `prady-lsp` (auto-detected if empty) |
| `prady.enableInlayHints` | `true` | Show inlay type hints for `let` bindings |
| `prady.formatOnSave` | `false` | Run formatter on save (when available) |

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
