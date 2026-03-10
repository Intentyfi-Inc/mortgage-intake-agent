import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleAuth } from 'google-auth-library';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const {
  GOOGLE_CLOUD_PROJECT,
  GOOGLE_CLOUD_REGION = 'us-central1',
  GEMINI_MODEL = 'gemini-2.0-flash',
  GOOGLE_API_KEY,
  INTENTYFI_ENDPOINT,
  INTENTYFI_PROJECT,
  INTENTYFI_USER,
  INTENTYFI_PASS,
  PORT = 3001,
} = process.env;

const INTENTYFI_AUTH = 'Basic ' + Buffer.from(`${INTENTYFI_USER}:${INTENTYFI_PASS}`).toString('base64');

// ─── Vertex AI Auth ──────────────────────────────────────────────────────────
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

async function getAccessToken() {
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  return tokenResponse.token;
}

const VERTEX_BASE_URL = `https://${GOOGLE_CLOUD_REGION}-aiplatform.googleapis.com/v1/projects/${GOOGLE_CLOUD_PROJECT}/locations/${GOOGLE_CLOUD_REGION}/publishers/google/models/${GEMINI_MODEL}`;

// ─── Gemini Chat Endpoint (via Vertex AI) ────────────────────────────────────
// Stores conversation history keyed by sessionId
const sessions = new Map();

app.post('/api/chat', async (req, res) => {
  try {
    const { sessionId, message, systemInstruction, tools, toolResults } = req.body;

    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, []);
    }
    const history = sessions.get(sessionId);

    // If we're sending tool results back to Gemini
    if (toolResults) {
      history.push({
        role: 'user',
        parts: toolResults.map(tr => ({
          functionResponse: {
            name: tr.name,
            response: tr.response,
          },
        })),
      });
    } else if (message) {
      history.push({
        role: 'user',
        parts: [{ text: message }],
      });
    }

    const geminiBody = {
      contents: history,
      systemInstruction: systemInstruction
        ? { parts: [{ text: systemInstruction }] }
        : undefined,
      tools: tools ? [{ functionDeclarations: tools }] : undefined,
      toolConfig: tools
        ? { functionCallingConfig: { mode: 'AUTO' } }
        : undefined,
    };

    let accessToken;
    let vertexUrl = `${VERTEX_BASE_URL}:generateContent`;
    const headers = {
      'Content-Type': 'application/json',
    };

    if (GOOGLE_API_KEY) {
      vertexUrl += `?key=${GOOGLE_API_KEY}`;
    } else {
      accessToken = await getAccessToken();
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const geminiRes = await fetch(vertexUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(geminiBody),
    });

    if (!geminiRes.ok) {
      const errorText = await geminiRes.text();
      console.error('Vertex AI error:', geminiRes.status, errorText);
      return res.status(geminiRes.status).json({ error: errorText });
    }

    const data = await geminiRes.json();

    // Extract the model response and add to history
    const candidate = data.candidates?.[0];
    if (candidate?.content) {
      history.push(candidate.content);
    }

    res.json(data);
  } catch (err) {
    console.error('Chat endpoint error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Intentyfi Proxy Endpoints ───────────────────────────────────────────────

// Initialize a new scope
app.post('/api/intentyfi/scope/new', async (req, res) => {
  try {
    const url = `${INTENTYFI_ENDPOINT}/scoped/new?proj=${INTENTYFI_PROJECT}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: INTENTYFI_AUTH,
      },
      body: JSON.stringify([]),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Scope init error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update objects in a scope
app.post('/api/intentyfi/scope/updateObjects', async (req, res) => {
  try {
    const { scopeId, objects } = req.body;
    const url = `${INTENTYFI_ENDPOINT}/scoped/updateObjects?proj=${INTENTYFI_PROJECT}&scope=${scopeId}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: INTENTYFI_AUTH,
      },
      body: JSON.stringify(objects),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Update objects error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get an object by reference
app.get('/api/intentyfi/object/get', async (req, res) => {
  try {
    const { object, includeRels } = req.query;
    const url = `${INTENTYFI_ENDPOINT}/object/getObject?proj=${INTENTYFI_PROJECT}&object=${encodeURIComponent(object)}&includeRels=${includeRels || 'false'}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: INTENTYFI_AUTH },
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Get object error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Explain path for a variable
app.get('/api/intentyfi/scope/explainPath', async (req, res) => {
  try {
    const { scopeId, variable } = req.query;
    const url = `${INTENTYFI_ENDPOINT}/scope/explainPath?proj=${INTENTYFI_PROJECT}&scope=${scopeId}&variable=${encodeURIComponent(variable)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: INTENTYFI_AUTH },
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Explain path error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Reset a session
app.post('/api/session/reset', (req, res) => {
  const { sessionId } = req.body;
  sessions.delete(sessionId);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`\n🏠 Mortgage Intake Agent — Backend server running on http://localhost:${PORT}`);
  console.log(`   Vertex AI: ${GOOGLE_CLOUD_PROJECT} / ${GOOGLE_CLOUD_REGION} / ${GEMINI_MODEL}`);
  console.log(`   Intentyfi endpoint: ${INTENTYFI_ENDPOINT}\n`);
});
