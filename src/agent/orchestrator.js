/**
 * Agent Orchestrator — manages conversation state and tool execution.
 * Bridges Gemini AI conversation with Intentyfi API.
 */

import * as intentyfi from '../services/intentyfi.js';
import { toolDeclarations } from './tools.js';
import { buildSystemPrompt } from './system-prompt.js';

export class AgentOrchestrator {
  constructor() {
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.state = {
      scopeId: null,
      applicationObjectId: null,
      applicationRef: null,
      applicationId: null,    // e.g. APP00006
      borrowerObjectId: null,
      borrowerAddressObjectId: null,
      coborrowerObjectIds: [],
      phase: 'greeting',      // greeting, loan-type, property, product, borrower, employment, assets, eligibility, summary
      pmiAcknowledged: false,
    };
    this.onMessage = null;       // callback(role, content)
    this.onStateChange = null;   // callback(state)
    this.onStatusChange = null;  // callback(status, label)
  }

  /**
   * Send a user message and process the response (including tool loops).
   */
  async sendMessage(userMessage) {
    try {
      this._setStatus('thinking', 'Thinking...');

      const systemPrompt = buildSystemPrompt(this.state);
      
      // First call to Gemini with the user message
      let response = await this._callGemini({
        message: userMessage,
        systemInstruction: systemPrompt,
        tools: toolDeclarations,
      });

      // Tool call loop — Gemini may call tools, we execute them and send results back
      let maxLoops = 10;
      while (maxLoops-- > 0) {
        const parts = response.candidates?.[0]?.content?.parts || [];
        const functionCalls = parts.filter(p => p.functionCall);

        if (functionCalls.length === 0) break;

        // Execute all tool calls
        this._setStatus('thinking', 'Processing...');
        const toolResults = [];

        for (const part of functionCalls) {
          const { name, args } = part.functionCall;
          console.log(`[Tool Call] ${name}`, args);
          
          try {
            const result = await this._executeTool(name, args || {});
            toolResults.push({ name, response: { result } });
            console.log(`[Tool Result] ${name}`, result);
          } catch (err) {
            console.error(`[Tool Error] ${name}`, err);
            toolResults.push({ name, response: { error: err.message } });
          }
        }

        // Send tool results back to Gemini
        response = await this._callGemini({
          toolResults,
          systemInstruction: systemPrompt,
          tools: toolDeclarations,
        });
      }

      // Extract text response
      const parts = response.candidates?.[0]?.content?.parts || [];
      const textParts = parts.filter(p => p.text).map(p => p.text);
      const replyText = textParts.join('\n') || 'I apologize, but I wasn\'t able to generate a response. Could you please try again?';

      this._setStatus('online', 'Ready');
      return replyText;

    } catch (err) {
      console.error('Agent error:', err);
      this._setStatus('error', 'Error occurred');
      throw err;
    }
  }

  /**
   * Start the conversation with a greeting.
   */
  async startConversation() {
    this._setStatus('thinking', 'Starting...');

    const systemPrompt = buildSystemPrompt(this.state);
    
    const response = await this._callGemini({
      message: 'Hello, I\'d like to explore mortgage options.',
      systemInstruction: systemPrompt,
      tools: toolDeclarations,
    });

    const parts = response.candidates?.[0]?.content?.parts || [];
    const textParts = parts.filter(p => p.text).map(p => p.text);
    const greeting = textParts.join('\n') || 'Welcome! I\'m here to help you with your mortgage application. Are you looking for a new mortgage or refinancing an existing one?';

    this._setStatus('online', 'Ready');
    return greeting;
  }

  // ─── Tool Execution ──────────────────────────────────────────────────────

  async _executeTool(name, args) {
    switch (name) {
      case 'init_application':
        return await this._initApplication(args);
      case 'update_application':
        return await this._updateApplication(args);
      case 'update_borrower':
        return await this._updateBorrower(args);
      case 'update_employment':
        return await this._updateEmployment(args);
      case 'add_coborrower':
        return await this._addCoborrower(args);
      case 'add_liability':
        return await this._addLiability(args);
      case 'add_asset':
        return await this._addAsset(args);
      case 'check_eligibility':
        return await this._checkEligibility();
      case 'explain_ineligibility':
        return await this._explainIneligibility();
      case 'get_application_summary':
        return await this._getApplicationSummary();
      default:
        return { error: `Unknown tool: ${name}` };
    }
  }

  async _initApplication({ loanType }) {
    // Step 1: Create a scope
    const scopeData = await intentyfi.initScope();
    console.log('[Intentyfi] initScope response:', scopeData);
    
    if (!scopeData || !scopeData.Scope) {
      throw new Error('Invalid response from Intentyfi API when creating scope.');
    }
    this.state.scopeId = scopeData.Scope.ObjectID;

    // Step 2: Create the mortgage application
    const updateResult = await intentyfi.updateObjects(this.state.scopeId, [
      { ObjectType: 'MortgageApplication@mti.intentyfi.co', LoanType: loanType },
    ]);

    // Extract IDs from the response
    const modifiedObjects = updateResult.ModifiedObjects || [];
    for (const ref of modifiedObjects) {
      if (ref.startsWith('MortgageApplication@')) {
        this.state.applicationRef = ref;
        this.state.applicationObjectId = parseInt(ref.split(':')[1]);
      } else if (ref.startsWith('Borrower@')) {
        this.state.borrowerObjectId = parseInt(ref.split(':')[1]);
      } else if (ref.startsWith('Address@')) {
        this.state.borrowerAddressObjectId = parseInt(ref.split(':')[1]);
      }
    }

    // Fetch the created application to get the ApplicationID
    if (this.state.applicationRef) {
      const appData = await intentyfi.getObject(this.state.applicationRef, true);
      this.state.applicationId = appData.ApplicationID;
      this._updatePhase('loan-type');
      this._notifyStateChange();
      return appData;
    }

    this._notifyStateChange();
    return updateResult;
  }

  async _updateApplication(args) {
    if (!this.state.applicationObjectId) {
      return { error: 'No application initialized yet. Call init_application first.' };
    }

    const updateObj = {
      ObjectType: 'MortgageApplication@mti.intentyfi.co',
      ObjectID: this.state.applicationObjectId,
      ...args,
    };

    const result = await intentyfi.updateObjects(this.state.scopeId, [updateObj]);

    // Update phase based on what was set
    if (args.PropertyValue || args.DownPayment) this._updatePhase('property');
    if (args.SelectedLoanProduct) this._updatePhase('product');
    if (args.PMIIsAgreeble !== undefined) this.state.pmiAcknowledged = true;

    // Fetch updated application
    const appData = await intentyfi.getObject(this.state.applicationRef, false);
    this._notifyStateChange();
    return appData;
  }

  async _updateBorrower(args) {
    const borrowerId = args.borrowerObjectId || this.state.borrowerObjectId;
    if (!borrowerId) {
      return { error: 'No borrower found. Initialize the application first.' };
    }

    const { borrowerObjectId: _, StreetAddress, City, State, ...borrowerFields } = args;

    // Update borrower fields
    if (Object.keys(borrowerFields).length > 0) {
      await intentyfi.updateObjects(this.state.scopeId, [{
        ObjectType: 'Borrower@mti.intentyfi.co',
        ObjectID: borrowerId,
        ...borrowerFields,
      }]);
    }

    // Update address if provided
    if (StreetAddress || City || State) {
      const addressObj = {
        ObjectType: 'Address@mti.intentyfi.co',
        ObjectID: this.state.borrowerAddressObjectId || borrowerId,
      };
      if (StreetAddress) addressObj.StreetAddress = StreetAddress;
      if (City) addressObj.City = City;
      if (State) addressObj.State = State;

      await intentyfi.updateObjects(this.state.scopeId, [addressObj]);
    }

    this._updatePhase('borrower');
    this._notifyStateChange();

    // Return updated borrower
    const borrowerData = await intentyfi.getObject(`Borrower@mti.intentyfi.co:${borrowerId}`, true);
    return borrowerData;
  }

  async _updateEmployment(args) {
    const borrowerId = args.borrowerObjectId || this.state.borrowerObjectId;
    if (!borrowerId) {
      return { error: 'No borrower found.' };
    }

    const { borrowerObjectId: _, ...empFields } = args;

    // First get borrower to find employment info reference
    const borrower = await intentyfi.getObject(`Borrower@mti.intentyfi.co:${borrowerId}`, true);
    
    let empId = borrower.EmploymentInfo;
    if (typeof empId === 'object' && empId !== null) {
      empId = empId.ObjectID;
    }

    if (empId) {
      // Update existing employment info
      await intentyfi.updateObjects(this.state.scopeId, [{
        ObjectType: 'EmploymentInfo@mti.intentyfi.co',
        ObjectID: empId,
        ...empFields,
      }]);
    } else {
      // Create employment info linked to borrower
      await intentyfi.updateObjects(this.state.scopeId, [{
        ObjectType: 'Borrower@mti.intentyfi.co',
        ObjectID: borrowerId,
        EmploymentInfo: {
          ObjectType: 'EmploymentInfo@mti.intentyfi.co',
          ...empFields,
        },
      }]);
    }

    this._updatePhase('employment');
    this._notifyStateChange();
    
    // Fetch updated borrower 
    const updatedBorrower = await intentyfi.getObject(`Borrower@mti.intentyfi.co:${borrowerId}`, true);
    return updatedBorrower;
  }

  async _addCoborrower(args) {
    if (!this.state.applicationObjectId) {
      return { error: 'No application initialized.' };
    }

    const result = await intentyfi.updateObjects(this.state.scopeId, [{
      ObjectType: 'Borrower@mti.intentyfi.co',
      Application: this.state.applicationObjectId,
      ...args,
    }]);

    // Track co-borrower IDs
    const modifiedObjects = result.ModifiedObjects || [];
    for (const ref of modifiedObjects) {
      if (ref.startsWith('Borrower@')) {
        const id = parseInt(ref.split(':')[1]);
        if (id !== this.state.borrowerObjectId) {
          this.state.coborrowerObjectIds.push(id);
        }
      }
    }

    this._notifyStateChange();
    return result;
  }

  async _addLiability(args) {
    if (!this.state.applicationObjectId) {
      return { error: 'No application initialized.' };
    }

    const result = await intentyfi.updateObjects(this.state.scopeId, [{
      ObjectType: 'Liability@mti.intentyfi.co',
      Application: this.state.applicationObjectId,
      ...args,
    }]);

    this._updatePhase('assets');
    this._notifyStateChange();
    return result;
  }

  async _addAsset(args) {
    if (!this.state.applicationObjectId) {
      return { error: 'No application initialized.' };
    }

    const result = await intentyfi.updateObjects(this.state.scopeId, [{
      ObjectType: 'Asset@mti.intentyfi.co',
      Application: this.state.applicationObjectId,
      ...args,
    }]);

    this._updatePhase('assets');
    this._notifyStateChange();
    return result;
  }

  async _checkEligibility() {
    if (!this.state.applicationRef) {
      return { error: 'No application to check.' };
    }

    const appData = await intentyfi.getObject(this.state.applicationRef, true);
    this._updatePhase('eligibility');
    this._notifyStateChange();
    return appData;
  }

  async _explainIneligibility() {
    if (!this.state.scopeId || !this.state.applicationObjectId) {
      return { error: 'No application to explain.' };
    }

    const variable = `MortgageApplication@mti.intentyfi.co:${this.state.applicationObjectId}:IsEligible`;
    const explanation = await intentyfi.explainPath(this.state.scopeId, variable);
    return explanation;
  }

  async _getApplicationSummary() {
    if (!this.state.applicationRef) {
      return { error: 'No application to summarize.' };
    }

    const appData = await intentyfi.getObject(this.state.applicationRef, true);
    this._updatePhase('summary');
    this._notifyStateChange();
    return appData;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  async _callGemini(payload) {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: this.sessionId,
        ...payload,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini API error: ${err}`);
    }
    return res.json();
  }

  _updatePhase(phase) {
    const phases = ['greeting', 'loan-type', 'property', 'product', 'borrower', 'employment', 'assets', 'eligibility', 'summary'];
    const currentIdx = phases.indexOf(this.state.phase);
    const newIdx = phases.indexOf(phase);
    if (newIdx > currentIdx) {
      this.state.phase = phase;
    }
  }

  _setStatus(status, label) {
    if (this.onStatusChange) {
      this.onStatusChange(status, label);
    }
  }

  _notifyStateChange() {
    if (this.onStateChange) {
      this.onStateChange({ ...this.state });
    }
  }
}
