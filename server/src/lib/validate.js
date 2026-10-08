import { badRequest } from '../errors.js';

export function parseId(value, field = 'id') {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw badRequest('INVALID_ID', `${field} must be a positive whole number.`);
  return n;
}

// Trimmed string, or undefined when the field was not sent. Empty optional text becomes null.
export function readText(value, field, { max, required = false } = {}) {
  if (value === undefined && !required) return undefined;
  if (value === undefined || value === null) {
    if (required) throw badRequest('VALIDATION_ERROR', `${field} is required.`);
    return null;
  }
  if (typeof value !== 'string') throw badRequest('VALIDATION_ERROR', `${field} must be text.`);
  const text = value.trim();
  if (!text) {
    if (required) throw badRequest('VALIDATION_ERROR', `${field} can't be empty.`);
    return null;
  }
  if (max && text.length > max) throw badRequest('VALIDATION_ERROR', `${field} must be ${max} characters or fewer.`);
  return text;
}

export function readInt(value, field, { min, max, required = false } = {}) {
  if (value === undefined && !required) return undefined;
  if (value === null && !required) return null;
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!Number.isInteger(n) || (min !== undefined && n < min) || (max !== undefined && n > max)) {
    throw badRequest('VALIDATION_ERROR', `${field} must be a whole number between ${min} and ${max}.`);
  }
  return n;
}

export function readTextList(value, field, { maxItems, maxLength, minItems = 0 }) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw badRequest('VALIDATION_ERROR', `${field} must be a list.`);
  const seen = new Set();
  const items = [];
  for (const raw of value) {
    const text = readText(raw, field, { max: maxLength, required: true });
    if (!seen.has(text.toLowerCase())) {
      seen.add(text.toLowerCase());
      items.push(text);
    }
  }
  if (items.length < minItems) throw badRequest('VALIDATION_ERROR', `Pick at least ${minItems} ${field.toLowerCase()}.`);
  if (items.length > maxItems) throw badRequest('VALIDATION_ERROR', `Pick at most ${maxItems} ${field.toLowerCase()}.`);
  return items;
}
