import { SchemaSpec } from './types.js';

/**
 * Minimal runtime validator for the SchemaSpec subset used by capabilities.
 *
 * This exists to enforce the NOOA "typed input/output" principle: an agent
 * cannot pass arbitrary text into a capability, and a capability cannot return
 * something that violates its declared contract. Keeping it in-house avoids
 * pulling in a full JSON-Schema engine for the handful of shapes we use.
 */

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

function typeOf(value: any): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function validateNode(value: any, schema: SchemaSpec, path: string, errors: ValidationError[]): void {
  if (schema.type === 'any') return;

  const actual = typeOf(value);

  if (schema.type === 'object') {
    if (actual !== 'object') {
      errors.push({ path, message: `expected object, got ${actual}` });
      return;
    }
    for (const key of schema.required || []) {
      if (value[key] === undefined) {
        errors.push({ path: path ? `${path}.${key}` : key, message: 'required property missing' });
      }
    }
    if (schema.properties) {
      for (const [key, childSchema] of Object.entries(schema.properties)) {
        if (value[key] !== undefined) {
          validateNode(value[key], childSchema, path ? `${path}.${key}` : key, errors);
        }
      }
    }
    return;
  }

  if (schema.type === 'array') {
    if (actual !== 'array') {
      errors.push({ path, message: `expected array, got ${actual}` });
      return;
    }
    if (schema.items) {
      value.forEach((item: any, i: number) => {
        validateNode(item, schema.items!, `${path}[${i}]`, errors);
      });
    }
    return;
  }

  if (actual !== schema.type) {
    errors.push({ path, message: `expected ${schema.type}, got ${actual}` });
    return;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push({ path, message: `value must be one of: ${schema.enum.join(', ')}` });
  }
}

export function validate(value: any, schema: SchemaSpec): ValidationResult {
  const errors: ValidationError[] = [];
  validateNode(value, schema, '', errors);
  return { valid: errors.length === 0, errors };
}

export function formatErrors(errors: ValidationError[]): string {
  return errors.map(e => (e.path ? `${e.path}: ${e.message}` : e.message)).join('; ');
}

/** Convenience builders so capability definitions stay readable. */
export const S = {
  object: (properties: Record<string, SchemaSpec>, required: string[] = []): SchemaSpec => ({
    type: 'object',
    properties,
    required,
  }),
  string: (description?: string, options?: { enum?: any[] }): SchemaSpec => ({
    type: 'string',
    description,
    enum: options?.enum,
  }),
  number: (description?: string): SchemaSpec => ({ type: 'number', description }),
  boolean: (description?: string): SchemaSpec => ({ type: 'boolean', description }),
  array: (items: SchemaSpec, description?: string): SchemaSpec => ({ type: 'array', items, description }),
  any: (description?: string): SchemaSpec => ({ type: 'any', description }),
};
