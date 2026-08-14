import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import jsforce from 'jsforce';

const app = express();
const port = process.env.PORT || 3000;
const appUrl = process.env.APP_URL || 'http://localhost:5173';
// jsforce adds the leading "v" when it builds REST URLs. Accept either
// "62.0" or "v62.0" in the environment, but always pass jsforce "62.0".
const salesforceApiVersion = (process.env.SF_API_VERSION || '62.0').replace(/^v/i, '');
const recordsPerPage = 20;
const sessionFile = path.join(process.cwd(), '.codex', 'sf-sessions.json');
const allowedObjects = ['Account', 'Opportunity', 'Lead', 'Contact', 'Case'];
const fieldProfiles = {
  Account: ['Name', 'Phone', 'Website', 'Industry', 'Type', 'Rating', 'NumberOfEmployees', 'BillingCountry', 'BillingCity', 'BillingState', 'Description'],
  Opportunity: ['Name', 'StageName', 'CloseDate', 'Amount', 'Type', 'LeadSource', 'Probability', 'NextStep', 'Description'],
  Lead: ['FirstName', 'LastName', 'Company', 'Email', 'Phone', 'Title', 'Status', 'LeadSource', 'Industry', 'Rating'],
  Contact: ['FirstName', 'LastName', 'Email', 'Phone', 'Title', 'Department', 'MailingCity', 'MailingCountry', 'MailingState', 'LeadSource'],
  Case: ['Subject', 'Status', 'Priority', 'Origin', 'Type', 'Reason', 'Description', 'ContactId', 'AccountId', 'SuppliedEmail']
};

app.use(cors({ origin: appUrl, credentials: true }));
app.use(express.json());
app.use(cookieParser());

class JsonFileStore extends session.Store {
  constructor(filePath) {
    super();
    this.filePath = filePath;
    this.cache = {};
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return;
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      this.cache = JSON.parse(raw || '{}');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.cache = {};
    }
    this.loaded = true;
  }

  async persist() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.cache, null, 2), 'utf8');
  }

  async get(sid, callback) {
    try {
      await this.load();
      const sessionData = this.cache[sid];
      if (!sessionData) return callback?.();
      if (sessionData.cookie?.expires && new Date(sessionData.cookie.expires) <= new Date()) {
        delete this.cache[sid];
        await this.persist();
        return callback?.();
      }
      return callback?.(null, sessionData);
    } catch (error) {
      return callback?.(error);
    }
  }

  async set(sid, sessionData, callback) {
    try {
      await this.load();
      this.cache[sid] = sessionData;
      await this.persist();
      return callback?.();
    } catch (error) {
      return callback?.(error);
    }
  }

  async destroy(sid, callback) {
    try {
      await this.load();
      delete this.cache[sid];
      await this.persist();
      return callback?.();
    } catch (error) {
      return callback?.(error);
    }
  }
}

const sessionOptions = {
  secret: process.env.SESSION_SECRET || 'change-me-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' }
};
// Vercel functions have an ephemeral filesystem. Browser cookies keep the
// OAuth token available there, while local development retains file sessions.
if (!process.env.VERCEL) sessionOptions.store = new JsonFileStore(sessionFile);
app.use(session(sessionOptions));

const oauth2 = () => new jsforce.OAuth2({
  loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com',
  clientId: process.env.SF_CLIENT_ID,
  clientSecret: process.env.SF_CLIENT_SECRET,
  redirectUri: process.env.SF_REDIRECT_URI || `http://localhost:${port}/auth/callback`
});

function connection(req) {
  const accessToken = req.session.accessToken || req.cookies.sf_access_token;
  const instanceUrl = req.session.instanceUrl || req.cookies.sf_instance_url;
  if (!accessToken || !instanceUrl) throw new Error('Not authenticated');
  return new jsforce.Connection({
    accessToken,
    instanceUrl,
    version: salesforceApiVersion
  });
}
function ensureObject(name) {
  if (!allowedObjects.includes(name)) throw new Error('Unsupported Salesforce object');
}
function userErrorMessage(value) {
  if (Array.isArray(value)) return value.map(userErrorMessage).filter(Boolean).join(' ') || 'Salesforce request failed.';
  if (value && typeof value === 'object') return userErrorMessage(value.message || value.error_description || value.error);
  if (typeof value !== 'string' || !value.trim()) return 'Salesforce request failed.';
  try {
    return userErrorMessage(JSON.parse(value));
  } catch {
    return value;
  }
}
function sendError(res, error) {
  const status = error.message === 'Not authenticated' ? 401 : 400;
  const details = error?.response?.body || error?.body || error?.data || null;
  // Send only a human-readable message to the UI. Salesforce error codes and
  // response payloads are implementation details and can expose unnecessary data.
  const message = userErrorMessage(details || error.message);
  res.status(status).json({ error: message });
}
function profileFields(object, metadata, predicate) {
  const byName = new Map(metadata.fields.map(field => [field.name, field]));
  return fieldProfiles[object].map(name => byName.get(name)).filter(field => field && predicate(field)).slice(0, 10);
}
function fieldDto(field) {
  return {
    name: field.name,
    label: field.label,
    type: field.type,
    required: !field.nillable && field.createable,
    createable: field.createable,
    updateable: field.updateable,
    picklistValues: field.picklistValues.filter(option => option.active).map(option => option.value)
  };
}

function base64UrlEncode(buffer) {
  return Buffer.from(buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function oauthCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 10 * 60 * 1000,
    path: '/auth/callback'
  };
}

async function graphqlRequest(req, query, variables) {
  const instanceUrl = req.session.instanceUrl || req.cookies.sf_instance_url;
  const url = `${instanceUrl}/services/data/v${salesforceApiVersion}/graphql`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${req.session.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.errors?.length) {
    const message = payload?.errors?.map(error => error.message || error.extensions?.errorCode || 'GraphQL error').join(', ') || `GraphQL request failed with ${response.status}`;
    const err = new Error(message);
    err.raw = payload;
    throw err;
  }
  return payload;
}

async function createRecord(req, object, body) {
  const conn = connection(req);
  const result = await conn.sobject(object).create(body);
  if (!result?.success) {
    const message = Array.isArray(result?.errors) ? result.errors.join(', ') : 'Create failed';
    const err = new Error(message);
    err.raw = result;
    throw err;
  }
  return result;
}

async function updateRecord(req, object, id, body) {
  const conn = connection(req);
  const result = await conn.sobject(object).update({ Id: id, ...body });
  if (!result?.success) {
    const message = Array.isArray(result?.errors) ? result.errors.join(', ') : 'Update failed';
    const err = new Error(message);
    err.raw = result;
    throw err;
  }
  return result;
}

async function deleteRecord(req, object, id) {
  const conn = connection(req);
  const result = await conn.sobject(object).destroy(id);
  if (!result?.success) {
    const message = Array.isArray(result?.errors) ? result.errors.join(', ') : 'Delete failed';
    const err = new Error(message);
    err.raw = result;
    throw err;
  }
  return result;
}

app.get('/auth/login', (req, res) => {
  if (!process.env.SF_CLIENT_ID || !process.env.SF_CLIENT_SECRET) return res.status(500).send('Salesforce client credentials are not configured.');
  const state = crypto.randomBytes(24).toString('hex');
  const codeVerifier = base64UrlEncode(crypto.randomBytes(32));
  const codeChallenge = base64UrlEncode(crypto.createHash('sha256').update(codeVerifier).digest());
  res.cookie('sf_oauth_state', state, oauthCookieOptions());
  res.cookie('sf_oauth_verifier', codeVerifier, oauthCookieOptions());
  res.redirect(oauth2().getAuthorizationUrl({
    scope: 'api refresh_token',
    state,
    prompt: 'login',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  }));
});

app.get('/auth/callback', async (req, res) => {
  try {
    if (!req.query.code || req.query.state !== req.cookies.sf_oauth_state) throw new Error('Invalid OAuth state');
    if (!req.cookies.sf_oauth_verifier) throw new Error('Missing OAuth PKCE verifier');
    const token = await oauth2().requestToken(req.query.code, { code_verifier: req.cookies.sf_oauth_verifier });
    req.session.accessToken = token.access_token;
    req.session.instanceUrl = token.instance_url;
    req.session.user = (await new jsforce.Connection({ accessToken: token.access_token, instanceUrl: token.instance_url }).identity()).username;
    res.cookie('sf_access_token', token.access_token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    res.cookie('sf_instance_url', token.instance_url, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    res.cookie('sf_user', req.session.user, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    res.clearCookie('sf_oauth_state', { path: '/auth/callback' });
    res.clearCookie('sf_oauth_verifier', { path: '/auth/callback' });
    res.redirect(appUrl);
  } catch (error) { res.status(401).send(`Salesforce login failed: ${error.message}`); }
});

app.get('/api/session', (req, res) => res.json({
  authenticated: Boolean(req.session.accessToken || req.cookies.sf_access_token),
  user: req.session.user || req.cookies.sf_user || null,
  instanceUrl: req.session.instanceUrl || req.cookies.sf_instance_url || null
}));
app.post('/api/logout', (req, res) => req.session.destroy(() => {
  res.clearCookie('sf_access_token');
  res.clearCookie('sf_instance_url');
  res.clearCookie('sf_user');
  res.status(204).end();
}));

app.get('/api/objects/:object/describe', async (req, res) => {
  try {
    const object = req.params.object; ensureObject(object);
    const metadata = await connection(req).sobject(object).describe();
    const fields = profileFields(object, metadata, field => field.createable || field.updateable).map(fieldDto);
    res.json({ name: metadata.name, label: metadata.label, fields });
  } catch (error) { sendError(res, error); }
});

app.get('/api/objects/:object/records', async (req, res) => {
  try {
    const object = req.params.object; ensureObject(object);
    const offset = Math.max(0, Number(req.query.offset || 0));
    const metadata = await connection(req).sobject(object).describe();
    // Salesforce describe responses from some orgs omit `queryable` for standard
    // fields. Treat only an explicit `false` as unavailable; otherwise the table
    // would fetch Ids alone and render no visible columns.
    const fields = ['Id', ...profileFields(object, metadata, field => field.queryable !== false).map(field => field.name)];
    const result = await connection(req).query(`SELECT ${fields.join(', ')} FROM ${object} ORDER BY LastModifiedDate DESC, Id DESC LIMIT ${recordsPerPage} OFFSET ${offset}`);
    res.json({ records: result.records, fields: fields.filter(f => f !== 'Id'), hasMore: result.records.length === recordsPerPage });
  } catch (error) { sendError(res, error); }
});

app.post('/api/objects/:object/records', async (req, res) => {
  try {
    ensureObject(req.params.object);
    const object = req.params.object;
    const result = await createRecord(req, object, req.body);
    res.status(201).json({ Id: result.id, success: true, errors: result.errors || [] });
  } catch (error) { sendError(res, error); }
});
app.patch('/api/objects/:object/records/:id', async (req, res) => {
  try {
    ensureObject(req.params.object);
    const object = req.params.object;
    const result = await updateRecord(req, object, req.params.id, req.body);
    res.json({ success: true, errors: result.errors || [] });
  } catch (error) { sendError(res, error); }
});
app.delete('/api/objects/:object/records/:id', async (req, res) => {
  try {
    ensureObject(req.params.object);
    const object = req.params.object;
    await deleteRecord(req, object, req.params.id);
    res.status(204).end();
  } catch (error) { sendError(res, error); }
});

if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) app.use(express.static('dist'));
if (!process.env.VERCEL) app.listen(port, () => console.log(`Server listening on ${port}`));

export default app;
