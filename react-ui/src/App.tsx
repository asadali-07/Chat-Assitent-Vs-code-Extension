import { useEffect, useState, useRef } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import './App.css';

interface AttachedFile {
  name: string;
  path: string;
  type: 'text' | 'image';
  content?: string;
  size?: number;
}

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  attachedFiles?: AttachedFile[];
  timestamp: Date;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [availableFiles, setAvailableFiles] = useState<string[]>([]);
  const [fileSearchQuery, setFileSearchQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [cursorPosition, setCursorPosition] = useState(0);

  const vscode = (window as any).acquireVsCodeApi?.();

  // Function to parse message text and extract code blocks
  const parseMessageContent = (text: string) => {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      // Add text before code block
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          content: text.slice(lastIndex, match.index)
        });
      }

      // Add code block
      parts.push({
        type: 'code',
        language: match[1] || 'text',
        content: match[2].trim()
      });

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push({
        type: 'text',
        content: text.slice(lastIndex)
      });
    }

    return parts.length > 0 ? parts : [{ type: 'text', content: text }];
  };

  // Function to render message content with syntax highlighting
  const renderMessageContent = (text: string) => {
    const parts = parseMessageContent(text);
    
    return parts.map((part, index) => {
      if (part.type === 'code') {
        return (
          <div key={index} className="code-block-container">
            <div className="code-block-header">
              <span className="code-language">{part.language}</span>
              <button
                className="copy-code-btn"
                onClick={() => copyToClipboard(part.content)}
                title="Copy code"
              >
                📋
              </button>
            </div>
            <SyntaxHighlighter
              language={part.language}
              style={vscDarkPlus}
              customStyle={{
                margin: 0,
                borderRadius: '0 0 8px 8px',
                fontSize: '14px'
              }}
              wrapLongLines={true}
            >
              {part.content}
            </SyntaxHighlighter>
          </div>
        );
      } else {
        return (
          <div key={index} className="text-content">
            {part.content.split('\n').map((line, lineIndex) => (
              <span key={lineIndex}>
                {line}
                {lineIndex < part.content.split('\n').length - 1 && <br />}
              </span>
            ))}
          </div>
        );
      }
    });
  };

  // Function to copy code to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // You could add a toast notification here
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      
      switch (message.type) {
        case 'aiResponse':
          setMessages((prev) => [...prev, {
            id: Date.now().toString(),
            text: message.text,
            sender: 'ai',
            timestamp: new Date()
          }]);
          break;
          
        case 'workspaceFiles':
          setAvailableFiles(message.files);
          break;
          
        case 'fileContent':
          const newFile: AttachedFile = {
            name: message.fileName,
            path: message.filePath,
            type: message.fileType,
            content: message.content,
            size: message.size
          };
          setAttachedFiles(prev => [...prev, newFile]);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    
    // Request workspace files on load
    vscode?.postMessage({ type: 'getWorkspaceFiles' });
    
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const position = e.target.selectionStart || 0;
    
    setInput(value);
    setCursorPosition(position);
    
    // Check for @ symbol to show file picker
    const beforeCursor = value.substring(0, position);
    const atIndex = beforeCursor.lastIndexOf('@');
    
    if (atIndex !== -1 && atIndex === position - 1) {
      setShowFilePicker(true);
      setFileSearchQuery('');
      vscode?.postMessage({ type: 'getWorkspaceFiles' });
    } else if (atIndex !== -1) {
      const query = beforeCursor.substring(atIndex + 1);
      setFileSearchQuery(query);
      setShowFilePicker(true);
    } else {
      setShowFilePicker(false);
    }
  };

  const selectFile = (fileName: string) => {
    const beforeAt = input.substring(0, input.lastIndexOf('@'));
    const afterCursor = input.substring(cursorPosition);
    const newInput = beforeAt + '@' + fileName + ' ' + afterCursor;
    
    setInput(newInput);
    setShowFilePicker(false);
    
    // Request file content
    vscode?.postMessage({ 
      type: 'getFileContent', 
      fileName: fileName 
    });
    
    // Focus back to input
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const removeAttachedFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const sendMessage = () => {
    if (!input.trim() && attachedFiles.length === 0) return;
    
    const newMessage: Message = {
      id: Date.now().toString(),
      text: input,
      sender: 'user',
      attachedFiles: [...attachedFiles],
      timestamp: new Date()
    };
    
    setMessages((prev) => [...prev, newMessage]);
    
    // Send to AI with attachments
    vscode?.postMessage({ 
      type: 'askAI', 
      prompt: input,
      attachedFiles: attachedFiles 
    });
    
    setInput('');
    setAttachedFiles([]);
  };

  const filteredFiles = availableFiles.filter(file =>
    file.toLowerCase().includes(fileSearchQuery.toLowerCase())
  );

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const kb = bytes / 1024;
    return kb > 1024 ? `${(kb / 1024).toFixed(1)}MB` : `${kb.toFixed(1)}KB`;
  };

  return (
    <div className="chat-container">
      <div className="messages-container">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`message ${
              message.sender === 'user' ? 'message-user' : 'message-ai'
            }`}
          >
            <div className="message-content">
              {message.sender === 'ai' ? (
                renderMessageContent(message.text)
              ) : (
                message.text
              )}
            </div>
            
            {message.attachedFiles && message.attachedFiles.length > 0 && (
              <div className="attached-files">
                {message.attachedFiles.map((file, index) => (
                  <div key={index} className="attached-file">
                    <div className="file-icon">
                      {file.type === 'image' ? '🖼️' : '📄'}
                    </div>
                    <div className="file-info">
                      <span className="file-name">{file.name}</span>
                      <span className="file-size">{formatFileSize(file.size)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {attachedFiles.length > 0 && (
        <div className="attachment-preview">
          <div className="attachment-header">
            <span>📎 Attached Files ({attachedFiles.length})</span>
          </div>
          <div className="attachment-list">
            {attachedFiles.map((file, index) => (
              <div key={index} className="attachment-item">
                <div className="file-icon">
                  {file.type === 'image' ? '🖼️' : '📄'}
                </div>
                <div className="file-details">
                  <span className="file-name">{file.name}</span>
                  <span className="file-path">{file.path}</span>
                </div>
                <button
                  className="remove-attachment"
                  onClick={() => removeAttachedFile(index)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="input-container">
        <div className="input-wrapper">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !showFilePicker) {
                sendMessage();
              } else if (e.key === 'Escape') {
                setShowFilePicker(false);
              }
            }}
            placeholder="Type your message... Use @filename to attach files"
            className="input-field"
          />
          
          {showFilePicker && (
            <div className="file-picker">
              <div className="file-picker-header">
                Select a file to attach:
              </div>
              <div className="file-list">
                {filteredFiles.length > 0 ? (
                  filteredFiles.slice(0, 10).map((file, index) => (
                    <div
                      key={index}
                      className="file-option"
                      onClick={() => selectFile(file)}
                    >
                      <span className="file-icon">
                        {file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.gif') ? '🖼️' : '📄'}
                      </span>
                      <span className="file-name">{file}</span>
                    </div>
                  ))
                ) : (
                  <div className="no-files">No matching files found</div>
                )}
              </div>
            </div>
          )}
        </div>
        
        <button
          onClick={sendMessage}
          className="send-button"
          disabled={!input.trim() && attachedFiles.length === 0}
        >
          Send
        </button>
      </div>
    </div>
  );
}

export default App;