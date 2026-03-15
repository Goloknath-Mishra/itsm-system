import type { FormField, FormFieldType, FormSchema, FormSection } from './types'

export function newId() {
  return crypto.randomUUID()
}

export function defaultSchema(): FormSchema {
  return {
    sections: [
      {
        id: newId(),
        title: 'General Information',
        fields: [],
      },
    ],
  }
}

export function defaultField(type: FormFieldType): FormField {
  const id = newId()
  const base = {
    id,
    type,
    label: type === 'multiline' ? 'Multiline Text' : type === 'option_set' ? 'Option Set' : type.replace('_', ' '),
    name: `${type}_${id.replaceAll('-', '').slice(0, 8)}`,
    required: false,
    visible: true,
    requiredWhen: { op: 'AND', conditions: [] },
    visibleWhen: { op: 'AND', conditions: [] },
    defaultValue: '',
    defaultWhen: { op: 'AND', conditions: [] },
  } satisfies FormField

  if (type === 'option_set' || type === 'multi_select') {
    return { ...base, options: ['Option 1', 'Option 2'] }
  }
  if (type === 'two_options') {
    return { ...base, options: ['Yes', 'No'] }
  }
  return base
}

export function countFields(schema: FormSchema | null | undefined) {
  if (!schema) return 0
  return (schema.sections ?? []).reduce((sum, s) => sum + (s.fields ?? []).length, 0)
}

export function findField(schema: FormSchema, fieldId: string): { section: FormSection; field: FormField } | null {
  for (const s of schema.sections) {
    const f = s.fields.find((x) => x.id === fieldId)
    if (f) return { section: s, field: f }
  }
  return null
}
