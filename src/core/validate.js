const TYPE_NAMES = {
  string: 'texto',
  number: 'número',
  integer: 'número inteiro',
  boolean: 'true ou false',
  array: 'lista',
  object: 'objeto',
};

const typeOf = (value) => {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
};

const matchesType = (value, type) =>
  type === 'integer' ? Number.isInteger(value) : typeOf(value) === type;

const describe = (schema) => {
  if ('const' in schema) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map((v) => JSON.stringify(v)).join(' ou ');
  return TYPE_NAMES[schema.type] ?? schema.type;
};

const child = (path, key) => (typeof key === 'number' ? `${path}[${key}]` : path ? `${path}.${key}` : key);

// Subconjunto do JSON Schema usado em schema/jira-commit.schema.json: o validador lê o mesmo
// arquivo que o editor usa no autocomplete, então as regras ficam num lugar só
export function validate(schema, value, path = '') {
  const result = { errors: [], warnings: [] };
  const error = (message) => result.errors.push(`${path || 'o arquivo'} ${message}`);
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
    else error(`deve ser ${schema.anyOf.map(describe).join(' ou ')}`);
    return result;
  }

  if ('const' in schema && value !== schema.const) {
    error(`deve ser ${describe(schema)}`);
    return result;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    error(`deve ser ${describe(schema)}`);
    return result;
  }
  if (schema.type && !matchesType(value, schema.type)) {
    error(`deve ser ${describe(schema)}`);
    return result;
  }

  if (schema.pattern && typeof value === 'string' && !new RegExp(schema.pattern).test(value)) {
    error(`está num formato inválido${schema['x-hint'] ? ` (${schema['x-hint']})` : ''}`);
  }
  if (schema.minimum !== undefined && typeof value === 'number' && value < schema.minimum) {
    error(`deve ser no mínimo ${schema.minimum}`);
  }

  if (schema.items && Array.isArray(value)) {
    value.forEach((item, i) => merge(validate(schema.items, item, child(path, i))));
  }

  if (schema.properties && typeOf(value) === 'object') {
    for (const key of schema.required ?? []) {
      if (!(key in value)) result.errors.push(`${child(path, key)} é obrigatório`);
    }
    for (const [key, item] of Object.entries(value)) {
      const rule = schema.properties[key];
      if (rule) merge(validate(rule, item, child(path, key)));
      else if (schema.additionalProperties === false) result.warnings.push(`${child(path, key)} não é um campo conhecido`);
    }
  }
  return result;
}
