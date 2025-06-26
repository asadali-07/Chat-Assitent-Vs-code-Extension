import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { askGemini } from './gemini';

interface AttachedFile {
  name: string;
  path: string;
  type: 'text' | 'image';
  content?: string;
  size?: number;
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('chat-assistant.openChat', () => {
      const panel = vscode.window.createWebviewPanel(
        'chatAssistant',
        'AI Chat Assistant',
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
        }
      );

      // Load the React UI
      panel.webview.html = getWebviewContent(panel.webview, context.extensionUri);

      // Handle messages from the webview
      panel.webview.onDidReceiveMessage(async (message) => {
        switch (message.type) {
          case 'askAI':
            try {
              const prompt = message.prompt;
              const attachedFiles = message.attachedFiles;
              const response = await askGemini(prompt, attachedFiles);
              panel.webview.postMessage({ type: 'aiResponse', text: response });
            } catch (error) {
              console.error('Error asking AI:', error);
              panel.webview.postMessage({ 
                type: 'aiResponse', 
                text: 'Sorry, there was an error processing your request.' 
              });
            }
            break;

          case 'getWorkspaceFiles':
            try {
              const workspaceFiles = await getWorkspaceFiles();
              panel.webview.postMessage({
                type: 'workspaceFiles',
                files: workspaceFiles
              });
            } catch (error) {
              console.error('Error getting workspace files:', error);
              panel.webview.postMessage({
                type: 'workspaceFiles',
                files: []
              });
            }
            break;

          case 'getFileContent':
            try {
              const fileContent = await getFileContent(message.fileName);
              if (fileContent) {
                panel.webview.postMessage({
                  type: 'fileContent',
                  fileName: fileContent.name,
                  filePath: fileContent.path,
                  fileType: fileContent.type,
                  content: fileContent.content,
                  size: fileContent.size
                });
              }
            } catch (error) {
              console.error('Error getting file content:', error);
            }
            break;
        }
      });
    })
  );
}

async function getWorkspaceFiles(): Promise<string[]> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return [];
  }

  try {
    const files: string[] = [];
    const excludePatterns = [
      '**/node_modules/**',
      '**/.*',
      '**/*.log',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
      '**/coverage/**',
      '**/.nyc_output/**'
    ];
    
    const filePattern = '**/*';
    const foundFiles = await vscode.workspace.findFiles(
      filePattern, 
      `{${excludePatterns.join(',')}}`
    );
    
    // Filter and sort files
    const filteredFiles = foundFiles
      .map(uri => path.relative(workspaceFolders[0].uri.fsPath, uri.fsPath))
      .filter(filePath => {
        // Only include common file types
        const ext = path.extname(filePath).toLowerCase();
        const allowedExtensions = [
          '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h',
          '.css', '.scss', '.sass', '.html', '.xml', '.json', '.yaml', '.yml',
          '.md', '.txt', '.csv', '.sql', '.sh', '.bat', '.ps1',
          '.png', '.jpg', '.jpeg', '.gif', '.svg', '.bmp', '.webp'
        ];
        return allowedExtensions.includes(ext) && !filePath.includes('\\');
      })
      .sort()
      .slice(0, 200); // Limit to 200 files for performance

    return filteredFiles;
  } catch (error) {
    console.error('Error finding workspace files:', error);
    return [];
  }
}

async function getFileContent(fileName: string): Promise<AttachedFile | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return null;
  }

  try {
    const filePath = path.join(workspaceFolders[0].uri.fsPath, fileName);
    const uri = vscode.Uri.file(filePath);
    
    // Check if file exists
    try {
      await vscode.workspace.fs.stat(uri);
    } catch {
      return null;
    }

    const stat = await vscode.workspace.fs.stat(uri);
    const isImage = /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(fileName);
    
    if (isImage) {
      // For images, just return metadata
      return {
        name: path.basename(fileName),
        path: fileName,
        type: 'image',
        content: `[Image: ${fileName}]`,
        size: stat.size
      };
    } else {
      // For text files, read content
      const content = await vscode.workspace.fs.readFile(uri);
      const textContent = Buffer.from(content).toString('utf8');
      
      // Limit content size to prevent overwhelming the AI
      const maxSize = 50000; // 50KB limit
      const truncatedContent = textContent.length > maxSize 
        ? textContent.slice(0, maxSize) + '\n\n[Content truncated due to size...]'
        : textContent;
      
      return {
        name: path.basename(fileName),
        path: fileName,
        type: 'text',
        content: truncatedContent,
        size: stat.size
      };
    }
  } catch (error) {
    console.error('Error reading file:', error);
    return null;
  }
}

function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const mediaUri = vscode.Uri.joinPath(extensionUri, 'media/assets');

  const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'index-B41gtali.js'));
  const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'index-DMOyQ5nV.css'));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${cssUri}" rel="stylesheet">
  <title>Chat Assistant</title>
</head>
<body>
  <div id="root"></div>
  <script>
    const vscode = acquireVsCodeApi();
    window.acquireVsCodeApi = () => vscode;
  </script>
  <script type="module" src="${jsUri}"></script>
</body>
</html>`;
}

export function deactivate() {}