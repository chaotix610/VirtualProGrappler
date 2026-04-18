import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true });

/** Schema cache — keyed by schema $id or path */
const schemaCache = new Map();

/**
 * Fetch a JSON file and optionally validate it against a JSON Schema.
 *
 * @param {string} url        — path to the JSON data file
 * @param {string} [schemaUrl] — path to the JSON Schema file (optional)
 * @returns {Promise<object>}  — parsed and validated data
 */
export async function loadJSON(url, schemaUrl) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`DataLoader: failed to fetch ${url} (${response.status})`);
  }

  const data = await response.json();

  if (schemaUrl) {
    const validate = await getValidator(schemaUrl);
    if (!validate(data)) {
      const errors = validate.errors
        .map((e) => `  ${e.instancePath || '/'} ${e.message}`)
        .join('\n');
      throw new Error(`DataLoader: validation failed for ${url}\n${errors}`);
    }
  }

  return data;
}

/**
 * Compile (or retrieve cached) AJV validator for a given schema URL.
 * @param {string} schemaUrl
 * @returns {Promise<import('ajv').ValidateFunction>}
 */
async function getValidator(schemaUrl) {
  if (schemaCache.has(schemaUrl)) {
    return schemaCache.get(schemaUrl);
  }

  const res = await fetch(schemaUrl);
  if (!res.ok) {
    throw new Error(`DataLoader: failed to fetch schema ${schemaUrl} (${res.status})`);
  }

  const schema = await res.json();
  const validate = ajv.compile(schema);
  schemaCache.set(schemaUrl, validate);
  return validate;
}
