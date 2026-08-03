import { ProjectSchema } from '../../core/project'
import type {
  DataBinding,
  DataRepeater,
  NavigationContext,
  VisualBuilderProject,
} from '../../core/project'

export interface DataBindingDraft {
  pageId: string
  elementId: string
  target: DataBinding['target']
  contextKey: string
  field: string
  fallback?: string
}

export type DataRepeaterDraft = Omit<DataRepeater, 'id'>

function hash(value: string) {
  let result = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return (result >>> 0).toString(36)
}

function bindingId(draft: DataBindingDraft) {
  return `binding-${hash(`${draft.pageId}:${draft.elementId}:${draft.target}`)}`
}

export function findDataBinding(
  project: VisualBuilderProject,
  pageId: string,
  elementId: string,
  target: DataBinding['target'],
) {
  return project.bindings?.find((binding) =>
    binding.pageId === pageId
      && binding.elementId === elementId
      && binding.target === target)
}

export function saveDataBinding(project: VisualBuilderProject, draft: DataBindingDraft) {
  const binding: DataBinding = {
    id: findDataBinding(project, draft.pageId, draft.elementId, draft.target)?.id
      ?? bindingId(draft),
    ...draft,
  }
  return ProjectSchema.parse({
    ...project,
    bindings: [
      ...(project.bindings ?? []).filter((item) => !(item.pageId === draft.pageId
        && item.elementId === draft.elementId
        && item.target === draft.target)),
      binding,
    ],
  })
}

export function deleteDataBinding(
  project: VisualBuilderProject,
  pageId: string,
  elementId: string,
  target: DataBinding['target'],
) {
  return ProjectSchema.parse({
    ...project,
    bindings: (project.bindings ?? []).filter((binding) => !(binding.pageId === pageId
      && binding.elementId === elementId
      && binding.target === target)),
  })
}

export function findDataRepeater(project: VisualBuilderProject, pageId: string, elementId: string) {
  return project.repeaters?.find((repeater) =>
    repeater.pageId === pageId && repeater.elementId === elementId)
}

export function saveDataRepeater(project: VisualBuilderProject, draft: DataRepeaterDraft) {
  const existing = findDataRepeater(project, draft.pageId, draft.elementId)
  const repeater: DataRepeater = {
    id: existing?.id ?? `repeater-${hash(`${draft.pageId}:${draft.elementId}`)}`,
    ...draft,
  }
  return ProjectSchema.parse({
    ...project,
    repeaters: [
      ...(project.repeaters ?? []).filter((item) => !(item.pageId === draft.pageId
        && item.elementId === draft.elementId)),
      repeater,
    ],
  })
}

export function deleteDataRepeater(
  project: VisualBuilderProject,
  pageId: string,
  elementId: string,
) {
  return ProjectSchema.parse({
    ...project,
    repeaters: (project.repeaters ?? []).filter((repeater) =>
      !(repeater.pageId === pageId && repeater.elementId === elementId)),
  })
}

function fieldValue(record: unknown, path: string) {
  let current = record
  for (const segment of path.split('.')) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

function applyValue(element: HTMLElement, target: DataBinding['target'], value: string) {
  if (target === 'text') element.textContent = value
  else if (target === 'value' && 'value' in element) (element as HTMLInputElement).value = value
  else if (target === 'ariaLabel') element.setAttribute('aria-label', value)
  else element.setAttribute(target, value)
}

export function applyStaticDataBindings(
  document: Document,
  project: VisualBuilderProject,
  pageId: string,
  context: NavigationContext,
) {
  for (const binding of project.bindings ?? []) {
    if (binding.pageId !== pageId) continue
    const reference = context[binding.contextKey]
    const source = project.dataSources?.find((candidate) =>
      candidate.id === reference?.dataSourceId)
    if (!reference || source?.type !== 'static') continue
    const record = source.records.find((candidate) => candidate.id === reference.recordId)
    const rawValue = fieldValue(record, binding.field) ?? binding.fallback
    if (rawValue === undefined || rawValue === null) continue
    const element = [...document.querySelectorAll<HTMLElement>('[data-builder-element-id]')]
      .find((candidate) => candidate.dataset.builderElementId === binding.elementId)
    if (element) applyValue(element, binding.target, String(rawValue))
  }
}
