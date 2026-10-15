import { t } from '../i18n/index.js';

const typeOf = (value) => {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
};

const matchesType = (value, type) =>
  type === 'integer' ? Number.isInteger(value) : typeOf(value) === type;

const describe = (schema) => {
  if ('const' in schema) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map((v) => JSON.stringify(v)).join(t.validate.or);
  return t.validate.types[schema.type] ?? schema.type;
};

const child = (path, key) => (typeof key === 'number' ? `${path}[${key}]` : path ? `${path}.${key}` : key);

// Subconjunto do JSON Schema usado em schema/jira-commit.schema.json: o validador lê o mesmo
// arquivo que o editor usa no autocomplete, então as regras ficam num lugar só
export function validate(schema, value, path = '') {
  const result = { errors: [], warnings: [] };
  const error = (message) => result.errors.push(`${path || t.validate.theFile} ${message}`);
  const merge = (other) => {
    result.errors.push(...other.errors);
    result.warnings.push(...other.warnings);
  };

  if (schema.anyOf) {
    const attempts = schema.anyOf.map((option) => validate(option, value, path));
    if (attempts.some((a) => !a.errors.length)) {
      const ok = attempts.find((a) => !a.errors.length);
      result.warnings.push(...ok.warnings);
      return result;
    }
    const sameType = schema.anyOf.findIndex((option) => option.type && matchesType(value, option.type));
    if (sameType >= 0) merge(attempts[sameType]);
    else error(t.validate.mustBe(schema.anyOf.map(describe).join(t.validate.or)));
    return result;
  }

  if ('const' in schema && value !== schema.const) {
    error(t.validate.mustBe(describe(schema)));
    return result;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    error(t.validate.mustBe(describe(schema)));
    return result;
  }
  if (schema.type && !matchesType(value, schema.type)) {
    error(t.validate.mustBe(describe(schema)));
    return result;
  }

  if (schema.pattern && typeof value === 'string' && !new RegExp(schema.pattern).test(value)) {
    error(t.validate.invalidFormat(schema['x-hint']));
  }
  if (schema.minimum !== undefined && typeof value === 'number' && value < schema.minimum) {
    error(t.validate.minimum(schema.minimum));
  }

  if (schema.items && Array.isArray(value)) {
    value.forEach((item, i) => merge(validate(schema.items, item, child(path, i))));
  }

  if (schema.properties && typeOf(value) === 'object') {
    for (const key of schema.required ?? []) {
      if (!(key in value)) result.errors.push(`${child(path, key)} ${t.validate.required}`);
    }
    for (const [key, item] of Object.entries(value)) {
      const rule = schema.properties[key];
      if (rule) merge(validate(rule, item, child(path, key)));
      else if (schema.additionalProperties === false) result.warnings.push(`${child(path, key)} ${t.validate.unknown}`);
    }
  }
  return result;
}
