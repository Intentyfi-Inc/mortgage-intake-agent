/**
 * Chat UI component — handles message rendering, typing indicator, auto-scroll.
 */

export class ChatUI {
  constructor() {
    this.messagesContainer = document.getElementById('chat-messages');
    this.input = document.getElementById('chat-input');
    this.sendBtn = document.getElementById('send-btn');
    this.statusDot = document.getElementById('status-dot');
    this.statusText = document.getElementById('status-text');
    this.progressSteps = document.querySelectorAll('.step');
    this.appIdBox = document.getElementById('app-id-box');
    this.appIdValue = document.getElementById('app-id-value');
    
    this._setupAutoResize();
  }

  /**
   * Add a message bubble to the chat.
   */
  addMessage(role, content) {
    this.removeTypingIndicator();

    const messageEl = document.createElement('div');
    messageEl.classList.add('message', role);

    const avatarEl = document.createElement('div');
    avatarEl.classList.add('message-avatar');
    avatarEl.textContent = role === 'user' ? 'You' : 'AI';

    const contentEl = document.createElement('div');
    contentEl.classList.add('message-content');
    contentEl.innerHTML = this._formatContent(content);

    messageEl.appendChild(avatarEl);
    messageEl.appendChild(contentEl);
    this.messagesContainer.appendChild(messageEl);

    this._scrollToBottom();
  }

  /**
   * Show a system message (e.g., "Application initialized").
   */
  addSystemMessage(content) {
    const el = document.createElement('div');
    el.classList.add('system-message');
    el.innerHTML = `<span class="system-message-content">${content}</span>`;
    this.messagesContainer.appendChild(el);
    this._scrollToBottom();
  }

  /**
   * Show typing indicator.
   */
  showTypingIndicator() {
    if (document.getElementById('typing-indicator')) return;

    const el = document.createElement('div');
    el.classList.add('typing-indicator');
    el.id = 'typing-indicator';
    el.innerHTML = `
      <div class="message-avatar">AI</div>
      <div class="typing-dots">
        <span></span><span></span><span></span>
      </div>
    `;
    this.messagesContainer.appendChild(el);
    this._scrollToBottom();
  }

  /**
   * Remove typing indicator.
   */
  removeTypingIndicator() {
    const el = document.getElementById('typing-indicator');
    if (el) el.remove();
  }

  /**
   * Set the connection/thinking status indicator.
   */
  setStatus(status, label) {
    this.statusDot.className = `status-dot ${status}`;
    this.statusText.textContent = label;
  }

  /**
   * Update the progress sidebar based on current state.
   */
  updateProgress(state) {
    const phases = ['loan-type', 'property', 'product', 'borrower', 'employment', 'assets', 'eligibility', 'summary'];
    const currentPhaseIdx = phases.indexOf(state.phase);

    this.progressSteps.forEach((stepEl) => {
      const stepName = stepEl.dataset.step;
      const stepIdx = phases.indexOf(stepName);

      stepEl.classList.remove('active', 'completed');

      if (stepIdx < currentPhaseIdx) {
        stepEl.classList.add('completed');
      } else if (stepIdx === currentPhaseIdx) {
        stepEl.classList.add('active');
      }
    });

    // Show application ID if available
    if (state.applicationId) {
      this.appIdBox.style.display = 'block';
      this.appIdValue.textContent = state.applicationId;
    }
  }

  /**
   * Enable or disable the input area.
   */
  setInputEnabled(enabled) {
    this.input.disabled = !enabled;
    this.sendBtn.disabled = !enabled;
    if (enabled) {
      this.input.focus();
    }
  }

  /**
   * Get and clear the current input value.
   */
  consumeInput() {
    const value = this.input.value.trim();
    this.input.value = '';
    this.input.style.height = 'auto';
    return value;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  _formatContent(text) {
    // Convert markdown-like formatting to HTML
    let html = text
      // Bold
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Bullet lists
      .replace(/^[\s]*[-•]\s+(.+)$/gm, '<li>$1</li>')
      // Numbered lists
      .replace(/^[\s]*(\d+)\.\s+(.+)$/gm, '<li>$2</li>')
      // Paragraphs (double newline)
      .replace(/\n\n/g, '</p><p>')
      // Single newline
      .replace(/\n/g, '<br>');

    // Wrap list items in ul
    html = html.replace(/((?:<li>.*?<\/li>\s*)+)/g, '<ul>$1</ul>');

    // Wrap in paragraph if not already
    if (!html.startsWith('<')) {
      html = `<p>${html}</p>`;
    }

    return html;
  }

  _scrollToBottom() {
    requestAnimationFrame(() => {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    });
  }

  _setupAutoResize() {
    this.input.addEventListener('input', () => {
      this.input.style.height = 'auto';
      this.input.style.height = Math.min(this.input.scrollHeight, 120) + 'px';
    });
  }
}
