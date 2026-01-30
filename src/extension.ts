import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import { IbexProvider } from "./IbexProvider";

let ibexTerminal: vscode.Terminal | undefined;
let isServerRunning = false; // State Variable

export function activate(context: vscode.ExtensionContext) {
  // Initial State: Not Running
  setContext(false);

  const provider = new IbexProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(IbexProvider.viewType, provider),
  );

  // --- COMMAND 1: START (Open with Ibex) ---
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "ibex.openWithIbex",
      async (uri: vscode.Uri) => {
        // Logic: Agar pehle se chal raha hai, toh mana karo
        if (isServerRunning) {
          vscode.window.showWarningMessage(
            "⚠️ Ibex Server is already running. Please stop it first.",
          );
          return;
        }

        await vscode.commands.executeCommand("ibex.view.focus");

        if (!uri && vscode.window.activeTextEditor) {
          uri = vscode.window.activeTextEditor.document.uri;
        }

        if (uri) {
          const fpath = uri.fsPath.toLowerCase();

          if (fpath.endsWith(".html") || fpath.endsWith(".htm")) {
            provider.loadHtmlFile(uri);
          } else {
            provider.showLoading();

            const serverInfo = await startDevServer();

            if (serverInfo) {
              // Mark as Running
              setContext(true);

              vscode.window.withProgress(
                {
                  location: vscode.ProgressLocation.Notification,
                  title: "Ibex: Booting up server...",
                  cancellable: false,
                },
                async () => {
                  const isReady = await checkServerAvailability(
                    serverInfo.url,
                    20,
                  );
                  if (isReady) {
                    provider.loadUrl(serverInfo.url);
                    vscode.window.setStatusBarMessage(
                      `Ibex Live: ${serverInfo.url}`,
                      5000,
                    );
                  } else {
                    vscode.window.showErrorMessage(
                      "Server timeout. Check terminal.",
                    );
                    provider.loadUrl(serverInfo.url); // Try anyway
                  }
                },
              );
            }
          }
        } else {
          vscode.window.showInformationMessage("Select a file to start Ibex.");
        }
      },
    ),
  );

  // --- COMMAND 2: STOP SERVER ---
  context.subscriptions.push(
    vscode.commands.registerCommand("ibex.stopServer", () => {
      if (ibexTerminal) {
        ibexTerminal.dispose(); // Kill Terminal
        ibexTerminal = undefined;
      }

      setContext(false); // Update State
      provider.resetToHome(); // UI wapas Home par bhejo
      vscode.window.showInformationMessage("🛑 Ibex Server Stopped.");
    }),
  );

  // --- LISTENER: Manual Terminal Close ---
  // Agar user ne terminal khud delete kiya (Trash icon), toh state reset karo
  vscode.window.onDidCloseTerminal((t) => {
    if (t.name === "Ibex Auto-Server") {
      setContext(false);
      provider.resetToHome();
      ibexTerminal = undefined;
    }
  });

  vscode.workspace.onDidChangeTextDocument((event) => {
    if (
      provider.currentMode === "html" &&
      event.document.uri.fsPath === provider.currentFilePath
    ) {
      provider.updateHtmlContent(event.document.getText());
    }
  });
}

// Helper to toggle Menu visibility
function setContext(value: boolean) {
  isServerRunning = value;
  vscode.commands.executeCommand("setContext", "ibex:isRunning", value);
}

async function startDevServer(): Promise<{ url: string } | null> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders) return null;

  const rootPath = folders[0].uri.fsPath;
  const packageJsonPath = path.join(rootPath, "package.json");

  let command = "npm start";
  let port = 3000;

  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
      const scripts = packageJson.scripts || {};

      if (scripts.dev) {
        command = "npm run dev";
        if (
          scripts.dev.includes("vite") ||
          (packageJson.devDependencies && packageJson.devDependencies.vite)
        ) {
          port = 5173;
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  // Always create fresh terminal on Start
  if (ibexTerminal) ibexTerminal.dispose();

  ibexTerminal = vscode.window.createTerminal("Ibex Auto-Server");
  ibexTerminal.show(true);
  ibexTerminal.sendText(command);

  return { url: `http://localhost:${port}` };
}

async function checkServerAvailability(
  url: string,
  attempts: number,
): Promise<boolean> {
  const check = () =>
    new Promise<boolean>((resolve) => {
      const req = http.get(url, (res) => resolve(true));
      req.on("error", () => resolve(false));
      req.end();
    });

  for (let i = 0; i < attempts; i++) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}
