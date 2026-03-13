/**
 * Main entry point — initializes the orchestrator and binds UI events.
 */

import { AgentOrchestrator } from './agent/orchestrator.js';
import { ChatUI } from './components/chat.js';

const ui = new ChatUI();
const agent = new AgentOrchestrator();

// Wire up state/status callbacks
agent.onStatusChange = (status, label) => ui.setStatus(status, label);
agent.onStateChange = (state) => ui.updateProgress(state);

// ─── Send message handler ────────────────────────────────────────────────────

async function handleSend() {
  const text = ui.consumeInput();
  if (!text) return;

  // Show user message
  ui.addMessage('user', text);
  ui.setInputEnabled(false);
  ui.showTypingIndicator();

  try {
    const reply = await agent.sendMessage(text);
    ui.addMessage('assistant', reply);
  } catch (err) {
    console.error('Send error:', err);
    ui.addMessage('assistant', 'I apologize, but I encountered an error. Please try again or refresh the page.');
    ui.setStatus('error', 'Error');
  } finally {
    ui.setInputEnabled(true);
  }
}

// ─── Input bindings ──────────────────────────────────────────────────────────

document.getElementById('send-btn').addEventListener('click', handleSend);

document.getElementById('upload-btn').addEventListener('click', () => {
  document.getElementById('pdf-upload-input').click();
});

document.getElementById('pdf-upload-input').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  // Validate file is PDF
  if (file.type !== 'application/pdf') {
    alert('Please upload a PDF file');
    return;
  }

  // Reset input
  e.target.value = '';

  // Show file upload message
  ui.addMessage('user', `📄 Uploading: ${file.name}`);
  ui.setInputEnabled(false);
  ui.showTypingIndicator();

  try {
    // Read file as base64
    const reader = new FileReader();
    
    reader.onload = async () => {
      try {
        const base64Data = reader.result.split(',')[1]; // Remove data:application/pdf;base64, prefix
        
        // Upload to server
        const response = await fetch('/api/upload-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            filesize: file.size,
            data: base64Data,
          }),
        });

        if (!response.ok) {
          throw new Error(`Upload failed: ${response.statusText}`);
        }

        const result = await response.json();

        // Send the upload confirmation to the agent
        const reply = await agent.sendMessage(`I've uploaded the form: ${file.name}`);
        ui.removeTypingIndicator();
        ui.addMessage('assistant', reply);
      } catch (err) {
        console.error('Upload error:', err);
        ui.removeTypingIndicator();
        ui.addMessage('assistant', `I encountered an error uploading the PDF: ${err.message}. Please try again.`);
      } finally {
        ui.setInputEnabled(true);
      }
    };
    
    reader.onerror = () => {
      ui.removeTypingIndicator();
      ui.addMessage('assistant', 'Error reading the PDF file. Please try again.');
      ui.setInputEnabled(true);
    };
    
    reader.readAsDataURL(file);
  } catch (err) {
    console.error('File processing error:', err);
    ui.removeTypingIndicator();
    ui.addMessage('assistant', `Error processing file: ${err.message}`);
    ui.setInputEnabled(true);
  }
});

document.getElementById('chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});

// ─── App initialization ──────────────────────────────────────────────────────

async function init() {
  ui.setStatus('thinking', 'Starting agent...');
  ui.setInputEnabled(false);
  ui.showTypingIndicator();

  try {
    const greeting = await agent.startConversation();
    ui.addMessage('assistant', greeting);
    ui.setStatus('online', 'Ready');
  } catch (err) {
    console.error('Init error:', err);
    ui.addMessage('assistant', 'Welcome! I\'m your mortgage intake assistant. I\'m having trouble connecting to the AI service right now — please make sure the backend server is running and try refreshing the page.');
    ui.setStatus('error', 'Connection failed');
  } finally {
    ui.setInputEnabled(true);
  }
}

init();
