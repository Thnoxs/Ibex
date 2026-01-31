import * as vscode from "vscode";
import * as fs from "fs";

export class IbexProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "ibex.view";
  private _view?: vscode.WebviewView;
  public currentMode: "url" | "html" = "url";
  public currentFilePath: string = "";

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((data) => {
      if (data.type === "manualUrl") {
        this.loadUrl(data.value);
      } else if (data.type === "openExternal") {
        vscode.env.openExternal(vscode.Uri.parse(data.value));
      }
    });
  }

  // --- ACTIONS ---
  public showLoading() {
    this._view?.webview.postMessage({ type: "loading" });
  }

  public resetToHome() {
    this._view?.webview.postMessage({ type: "reset" });
  }

  public loadUrl(url: string) {
    if (this._view) {
      this.currentMode = "url";
      this._view.show?.(true);
      this._view.webview.postMessage({ type: "updateUrl", value: url });
    }
  }

  public loadHtmlFile(uri: vscode.Uri) {
    if (this._view) {
      this.currentMode = "html";
      this.currentFilePath = uri.fsPath;
      fs.readFile(uri.fsPath, "utf8", (err, data) => {
        if (!err && this._view) {
          this._view.show?.(true);
          this._view.webview.postMessage({ type: "renderHtml", value: data });
        }
      });
    }
  }

  public updateHtmlContent(content: string) {
    this._view?.webview.postMessage({ type: "renderHtml", value: content });
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const iconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "assets/icon.png"),
    );

    // SECURITY FIX: Generate a random nonce for scripts
    const nonce = getNonce();

    return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; frame-src *; img-src ${webview.cspSource} https: data:;">

            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                /* Prevent White Flash: Set bg color immediately */
                :root {
                    --bg-color: var(--vscode-editor-background);
                    --fg-color: var(--vscode-foreground);
                }
                body {
                    background-color: var(--bg-color);
                    color: var(--fg-color);
                    font-family: var(--vscode-font-family);
                    margin: 0; padding: 0;
                    display: flex; flex-direction: column; height: 100vh; overflow: hidden;
                }
                
                .nav-bar {
                    display: flex; align-items: center; padding: 10px;
                    background-color: var(--vscode-sideBar-background);
                    border-bottom: 1px solid var(--vscode-panel-border);
                    gap: 8px;
                }
                .url-input {
                    flex: 1; height: 28px;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    padding: 0 8px; font-size: 13px; outline: none; border-radius: 4px;
                }
                .url-input:focus { border-color: var(--vscode-focusBorder); }
                .icon-btn {
                    width: 28px; height: 28px; cursor: pointer;
                    background: transparent; color: var(--vscode-icon-foreground);
                    border: none; display: flex; align-items: center; justify-content: center;
                    border-radius: 4px;
                }
                .icon-btn:hover { background-color: var(--vscode-toolbar-hoverBackground); }
                
                .content-area { flex: 1; position: relative; background-color: var(--bg-color); }
                
                iframe { width: 100%; height: 100%; border: none; display: none; background: white; }
                
                .placeholder {
                    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
                    background-color: var(--bg-color);
                    display: flex; flex-direction: column; align-items: center;
                    justify-content: center; text-align: center;
                    color: var(--vscode-descriptionForeground);
                    z-index: 10;
                    padding: 20px;
                }
                .logo-img { width: 90px; height: 90px; margin-bottom: 20px; filter: drop-shadow(0 0 10px rgba(0,0,0,0.2)); }
                .title { font-size: 18px; font-weight: 600; margin-bottom: 10px; color: var(--fg-color); }
                .instruction { font-size: 13px; opacity: 0.8; margin-bottom: 40px; }
                
                .credits {
                    position: absolute; bottom: 20px;
                    font-size: 11px; opacity: 0.6;
                    display: flex; flex-direction: column; gap: 5px;
                }
                .credits-links { display: flex; gap: 15px; justify-content: center; margin-top: 5px; }
                .link { color: var(--vscode-textLink-foreground); text-decoration: none; cursor: pointer; }
                .link:hover { text-decoration: underline; }

                .spinner {
                    border: 3px solid var(--vscode-panel-border);
                    border-top: 3px solid var(--vscode-textLink-foreground);
                    border-radius: 50%; width: 24px; height: 24px;
                    animation: spin 1s linear infinite; margin-top: 15px; display: none;
                }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
        </head>
        <body>
            <div class="nav-bar">
                <input type="text" id="urlInput" class="url-input" placeholder="Thnoxs Engine Ready" readonly />
                <button id="goBtn" class="icon-btn" title="Refresh">↻</button>
            </div>
            
            <div class="content-area">
                <div id="placeholder" class="placeholder">
                    <img src="${iconUri}" class="logo-img" onerror="this.style.display='none'">
                    
                    <div id="homeContent">
                        <div class="title">Ibex Engine Ready</div>
                        <div class="instruction">Right-click a file to "Open with Ibex"</div>
                    </div>
                    
                    <div id="loadingContent" style="display:none;">
                        <div class="title">Starting Server...</div>
                        <div class="instruction">Establishing connection...</div>
                        <div class="spinner"></div>
                    </div>

                    <div class="credits">
                        <span>DEVELOPED BY <b>THNOXS</b></span>
                        <div class="credits-links">
                        <span class="link" onclick="openLink('https://github.com/thnoxs')">GitHub</span>
                        <span style="opacity: 0.5">|</span>
                        <span class="link" onclick="openLink('https://instagram.com/thnoxs')">Instagram</span>
                    </div>
                    </div>
                </div>
                
                <iframe id="mainFrame" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
            </div>

            <script nonce="${nonce}">
                const vscode = acquireVsCodeApi();
                const input = document.getElementById('urlInput');
                const frame = document.getElementById('mainFrame');
                const placeholder = document.getElementById('placeholder');
                const homeContent = document.getElementById('homeContent');
                const loadingContent = document.getElementById('loadingContent');

                // State Management
                const previousState = vscode.getState();
                if (previousState && previousState.url) {
                    setView(previousState.url, previousState.isHtml);
                }

                function setView(url, isHtml) {
                    placeholder.style.display = 'none';
                    frame.style.display = 'block';
                    input.readOnly = false; 
                    
                    if (isHtml) {
                        frame.srcdoc = url;
                        input.value = "Live HTML Preview";
                        vscode.setState({ url: url, isHtml: true });
                    } else {
                        frame.src = url;
                        input.value = url;
                        vscode.setState({ url: url, isHtml: false });
                    }
                }

                function showLoading() {
                    placeholder.style.display = 'flex';
                    frame.style.display = 'none';
                    homeContent.style.display = 'none';
                    loadingContent.style.display = 'block';
                    input.value = "Connecting...";
                }

                function resetToHome() {
                    placeholder.style.display = 'flex';
                    frame.style.display = 'none';
                    frame.src = 'about:blank';
                    homeContent.style.display = 'block';
                    loadingContent.style.display = 'none';
                    input.value = "Thnoxs Engine Ready";
                    input.readOnly = true;
                    vscode.setState(null); // Clear State
                }

                function openLink(url) {
                    vscode.postMessage({ type: 'openExternal', value: url });
                }

                window.addEventListener('message', event => {
                    const msg = event.data;
                    if (msg.type === 'updateUrl') setView(msg.value, false);
                    if (msg.type === 'renderHtml') setView(msg.value, true);
                    if (msg.type === 'loading') showLoading();
                    if (msg.type === 'reset') resetToHome();
                });

                document.getElementById('goBtn').addEventListener('click', () => {
                    if (!input.readOnly) {
                        let url = input.value;
                        if (url) {
                            if (!url.startsWith('http')) url = 'http://' + url;
                            vscode.postMessage({ type: 'manualUrl', value: url });
                        }
                    }
                });
            </script>
        </body>
        </html>`;
  }
}

// SECURITY FIX: Helper function to generate a random nonce
function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
