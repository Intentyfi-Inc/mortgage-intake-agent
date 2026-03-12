/**
 * Main entry point — initializes the orchestrator and binds UI events.
 */

import { AgentOrchestrator } from './agent/orchestrator.js';
import { ChatUI } from './components/chat.js';
import { DashboardUI } from './components/dashboard.js';

const ui = new ChatUI();
const agent = new AgentOrchestrator();
const dashboard = new DashboardUI();

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

// ─── Nav tab switching ────────────────────────────────────────────────────────

const views = {
  'app-main': document.getElementById('app-main'),
  'dashboard-view': document.getElementById('dashboard-view'),
};

document.getElementById('header-nav').addEventListener('click', async (e) => {
  const tab = e.target.closest('.nav-tab');
  if (!tab) return;

  const targetView = tab.dataset.view;

  // Update tab active states
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');

  // Show/hide views
  Object.entries(views).forEach(([id, el]) => {
    if (el) el.style.display = id === targetView ? '' : 'none';
  });

  // Lazy-load dashboard data on first open
  if (targetView === 'dashboard-view') {
    await dashboard.loadOnce();
  }
});
