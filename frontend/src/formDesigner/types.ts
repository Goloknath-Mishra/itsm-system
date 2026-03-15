export type FormStatus = 'DRAFT' | 'PUBLISHED'
export type FormRecordType = 'INCIDENT' | 'SERVICE_REQUEST' | 'PROBLEM' | 'CHANGE' | 'ASSET'

export type FormFieldType =
  | 'text'
  | 'multiline'
  | 'number'
  | 'decimal'
  | 'email'
  | 'date'
  | 'option_set'
  | 'multi_select'
  | 'two_options'
  | 'checkbox'
  | 'lookup'

export type FormField = {
  id: string
  type: FormFieldType
  label: string
  name: string
  description?: string
  placeholder?: string
  required?: boolean
  visible?: boolean
  requiredWhen?: RuleGroup
  visibleWhen?: RuleGroup
  defaultValue?: string
  defaultWhen?: RuleGroup
  maxLength?: number
  options?: string[]
}

export type RuleCondition = {
  field: string
  op: 'eq' | 'ne' | 'contains' | 'in' | 'is_set'
  value?: string
}

export type RuleGroup = {
  op: 'AND' | 'OR'
  conditions: RuleCondition[]
}

export type FormSection = {
  id: string
  title: string
  fields: FormField[]
}

export type FormSchema = {
  sections: FormSection[]
}

export type DynamicForm = {
  id: string
  name: string
  description: string
  status: FormStatus
  record_type: FormRecordType
  version: number
  schema: FormSchema
  created_at: string
  updated_at: string
}
