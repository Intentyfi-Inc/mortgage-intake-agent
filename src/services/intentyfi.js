/**
 * Intentyfi API service — calls Intentyfi through the backend proxy.
 */

export async function initScope() {
  const res = await fetch('/api/intentyfi/scope/new', { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to init scope: ${res.status}`);
  return res.json();
}

export async function updateObjects(scopeId, objects) {
  const res = await fetch('/api/intentyfi/scope/updateObjects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scopeId, objects }),
  });
  if (!res.ok) throw new Error(`Failed to update objects: ${res.status}`);
  return res.json();
}

export async function getObject(objectRef, includeRels = true) {
  const params = new URLSearchParams({ object: objectRef, includeRels: String(includeRels) });
  const res = await fetch(`/api/intentyfi/object/get?${params}`);
  if (!res.ok) throw new Error(`Failed to get object: ${res.status}`);
  return res.json();
}

export async function explainPath(scopeId, variable) {
  const params = new URLSearchParams({ scopeId, variable });
  const res = await fetch(`/api/intentyfi/scope/explainPath?${params}`);
  if (!res.ok) throw new Error(`Failed to explain path: ${res.status}`);
  return res.json();
}

/**
 * Call the soft credit check API endpoint
 */
export async function executeSoftCreditCheck(userData) {
  try {
    const res = await fetch('/api/credit/soft-credit-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Soft credit check failed: ${res.status} - ${errorText}`);
    }
    return res.json();
  } catch (e) {
    console.error('Soft credit check error:', e);
    throw e;
  }
}
