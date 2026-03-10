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
