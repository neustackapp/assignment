'use strict';

/**
 * Dependency-free mock API for the Enrollment Review Workbench assignment.
 *
 * Requires Node.js 18 or newer.
 * Start it with: node mock-api.js
 * Override the port with: PORT=4100 node mock-api.js
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number.parseInt(process.env.PORT || '4000', 10);
const DATA_FILE = process.env.MOCK_DATA_FILE
  ? path.resolve(process.env.MOCK_DATA_FILE)
  : path.join(__dirname, 'mock-data.json');

const FINAL_STATUSES = new Set(['APPROVED', 'RETURNED']);
const SUPPORTED_SORTS = new Set([
  'priority_desc',
  'submitted_desc',
  'submitted_asc',
  'applicant_asc',
]);

let initialRecords;
let records;
let decisionAttempts;

function loadSeedData() {
  const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

  if (!Array.isArray(parsed)) {
    throw new Error('mock-data.json must contain a JSON array.');
  }

  const ids = new Set();
  for (const record of parsed) {
    if (!record || typeof record !== 'object' || typeof record.id !== 'string') {
      throw new Error('Every mock record must be an object with a string id.');
    }
    if (ids.has(record.id)) {
      throw new Error(`Duplicate mock record id: ${record.id}`);
    }
    ids.add(record.id);
  }

  return parsed;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function resetState() {
  records = clone(initialRecords);
  decisionAttempts = new Map();
}

function stripPrivateFields(record) {
  const copy = clone(record);
  for (const key of Object.keys(copy)) {
    if (key.startsWith('_')) delete copy[key];
  }
  return copy;
}

function toListItem(record) {
  const {
    employee,
    employment,
    election,
    existingCoverage,
    reviewSignals,
    decision,
    decidedAt,
    ...queueFields
  } = stripPrivateFields(record);

  return queueFields;
}

function toDetail(record) {
  return stripPrivateFields(record);
}

function sendJson(res, statusCode, body, extraHeaders = {}) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...extraHeaders,
  });
  res.end(payload);
}

function sendError(res, statusCode, code, message, details) {
  sendJson(res, statusCode, {
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function hash(value) {
  let result = 0;
  for (const character of String(value)) {
    result = (result * 31 + character.codePointAt(0)) >>> 0;
  }
  return result;
}

function requestLatency(req, url) {
  if (req.method === 'GET' && url.pathname === '/api/submissions') {
    const queryLength = (url.searchParams.get('query') || '').trim().length;

    // Shorter searches deliberately take longer than longer searches. A UI
    // that fires on every keystroke must account for responses arriving in a
    // different order than the requests were made.
    if (queryLength === 1) return 950;
    if (queryLength === 2) return 700;
    if (queryLength === 3) return 450;
    if (queryLength >= 4) return 180 + (hash(url.search) % 120);

    return 220 + (hash(url.search) % 420);
  }

  if (req.method === 'POST') return 450 + (hash(url.pathname) % 350);
  return 180 + (hash(url.pathname) % 520);
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .trim();
}

function validTime(value) {
  if (!value) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function compareNullable(left, right, direction = 1) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return (left - right) * direction;
}

function sortRecords(items, sort) {
  const priorityRank = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

  return [...items].sort((left, right) => {
    let comparison = 0;

    switch (sort) {
      case 'submitted_desc':
        comparison = compareNullable(
          validTime(left.submittedAt),
          validTime(right.submittedAt),
          -1,
        );
        break;
      case 'submitted_asc':
        comparison = compareNullable(
          validTime(left.submittedAt),
          validTime(right.submittedAt),
          1,
        );
        break;
      case 'applicant_asc':
        comparison = String(left.applicant?.name ?? '').localeCompare(
          String(right.applicant?.name ?? ''),
          'en-US',
          { sensitivity: 'base' },
        );
        break;
      case 'priority_desc':
      default:
        comparison =
          (priorityRank[right.priority] ?? 0) -
          (priorityRank[left.priority] ?? 0);
        if (comparison === 0) {
          comparison = compareNullable(
            validTime(left.submittedAt),
            validTime(right.submittedAt),
            1,
          );
        }
        break;
    }

    return comparison || left.id.localeCompare(right.id);
  });
}

function listSubmissions(url) {
  const query = normalize(url.searchParams.get('query'));
  const group = normalize(url.searchParams.get('group'));
  const reason = normalize(url.searchParams.get('reason'));
  const requestedSort = url.searchParams.get('sort') || 'priority_desc';
  const sort = SUPPORTED_SORTS.has(requestedSort)
    ? requestedSort
    : 'priority_desc';

  let matches = records.filter((record) => !FINAL_STATUSES.has(record.status));

  if (query) {
    matches = matches.filter((record) => {
      const name = normalize(record.applicant?.name);
      const email = normalize(record.applicant?.email);
      return name.includes(query) || email.includes(query);
    });
  }

  if (group) {
    matches = matches.filter((record) => {
      const id = normalize(record.group?.id);
      const name = normalize(record.group?.name);
      return id === group || name === group;
    });
  }

  if (reason) {
    matches = matches.filter(
      (record) => normalize(record.reviewReason) === reason,
    );
  }

  const sorted = sortRecords(matches, sort);

  return {
    items: sorted.map(toListItem),
    total: sorted.length,
  };
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16_384) {
      const error = new Error('Request body is too large.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Request body must contain valid JSON.');
    error.statusCode = 400;
    throw error;
  }
}

function getRecord(id) {
  return records.find((record) => record.id === id);
}

async function recordDecision(req, res, id) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendError(
      res,
      error.statusCode || 400,
      error.statusCode === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_JSON',
      error.message,
    );
    return;
  }

  const decision = body.decision;
  const note = typeof body.note === 'string' ? body.note.trim() : '';

  if (decision !== 'APPROVE' && decision !== 'RETURN') {
    sendError(
      res,
      422,
      'INVALID_DECISION',
      'decision must be either APPROVE or RETURN.',
      { field: 'decision' },
    );
    return;
  }

  if (decision === 'RETURN' && note.length === 0) {
    sendError(
      res,
      422,
      'NOTE_REQUIRED',
      'A note is required when returning a submission for correction.',
      { field: 'note' },
    );
    return;
  }

  if (note.length > 500) {
    sendError(
      res,
      422,
      'NOTE_TOO_LONG',
      'The decision note must be 500 characters or fewer.',
      { field: 'note', maximum: 500 },
    );
    return;
  }

  let record = getRecord(id);
  if (!record) {
    sendError(res, 404, 'SUBMISSION_NOT_FOUND', 'Submission was not found.');
    return;
  }

  if (FINAL_STATUSES.has(record.status)) {
    sendJson(res, 409, {
      error: {
        code: 'ALREADY_DECIDED',
        message: 'This submission has already been decided.',
      },
      submission: toDetail(record),
    });
    return;
  }

  const attempts = (decisionAttempts.get(id) || 0) + 1;
  decisionAttempts.set(id, attempts);

  if (record._behavior?.firstDecisionFails && attempts === 1) {
    sendError(
      res,
      503,
      'TEMPORARILY_UNAVAILABLE',
      'The decision service is temporarily unavailable. Please retry.',
    );
    return;
  }

  if (record._behavior?.conflictOnDecision) {
    record.status = 'APPROVED';
    record.decision = {
      type: 'APPROVE',
      note: null,
      reviewedBy: 'Another operations reviewer',
    };
    record.decidedAt = new Date().toISOString();

    sendJson(res, 409, {
      error: {
        code: 'REVIEW_CONFLICT',
        message: 'Another reviewer decided this submission first.',
      },
      submission: toDetail(record),
    });
    return;
  }

  record.status = decision === 'APPROVE' ? 'APPROVED' : 'RETURNED';
  record.decision = {
    type: decision,
    note: note || null,
    reviewedBy: 'Current operations reviewer',
  };
  record.decidedAt = new Date().toISOString();

  sendJson(res, 200, toDetail(record));
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  await delay(requestLatency(req, url));

  if (req.method === 'GET' && url.pathname === '/api/submissions') {
    sendJson(res, 200, listSubmissions(url));
    return;
  }

  const detailMatch = url.pathname.match(/^\/api\/submissions\/([^/]+)$/);
  if (req.method === 'GET' && detailMatch) {
    const id = decodeURIComponent(detailMatch[1]);
    const record = getRecord(id);
    if (!record) {
      sendError(res, 404, 'SUBMISSION_NOT_FOUND', 'Submission was not found.');
      return;
    }
    sendJson(res, 200, toDetail(record));
    return;
  }

  const decisionMatch = url.pathname.match(
    /^\/api\/submissions\/([^/]+)\/decision$/,
  );
  if (req.method === 'POST' && decisionMatch) {
    const id = decodeURIComponent(decisionMatch[1]);
    await recordDecision(req, res, id);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/reset') {
    resetState();
    sendJson(res, 200, { ok: true, total: records.length });
    return;
  }

  sendError(res, 404, 'ROUTE_NOT_FOUND', 'The requested route does not exist.');
}

try {
  initialRecords = loadSeedData();
  resetState();
} catch (error) {
  console.error(`Unable to load mock data from ${DATA_FILE}`);
  console.error(error.message);
  process.exit(1);
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error(error);
    if (!res.headersSent) {
      sendError(
        res,
        500,
        'INTERNAL_ERROR',
        'The mock API encountered an unexpected error.',
      );
    } else {
      res.end();
    }
  });
});

server.listen(PORT, () => {
  console.log(`Enrollment Review mock API running at http://localhost:${PORT}`);
  console.log(`Loaded ${records.length} submissions from ${path.basename(DATA_FILE)}`);
  console.log('Reset state with POST /api/reset or by restarting the server.');
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
