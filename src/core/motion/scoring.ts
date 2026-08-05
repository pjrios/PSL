// Framework-independent motion alignment and scoring.
export type MotionComponent =
  | 'handShape'
  | 'location'
  | 'orientation'
  | 'trajectory'
  | 'timing'
  | 'facePosture'

export interface MotionFeatureFrame {
  facePosture: number[]
  handShape: number[]
  location: number[]
  orientation: number[]
  quality?: number
  t: number
  trajectory: number[]
}

export function filterMotionFrames(frames: MotionFeatureFrame[], minConfidence: number) {
  return frames.filter((frame) => (frame.quality ?? 1) >= minConfidence)
}

export function smoothMotionSequence(frames: MotionFeatureFrame[], windowSize = 3) {
  const radius = Math.floor(Math.max(1, windowSize) / 2)
  const vectorFields = ['facePosture', 'handShape', 'location', 'orientation', 'trajectory'] as const
  return frames.map((frame, index) => {
    const nearby = frames.slice(Math.max(0, index - radius), index + radius + 1)
    const smoothed = { ...frame }
    vectorFields.forEach((field) => {
      const matching = nearby.filter((candidate) => candidate[field].length === frame[field].length)
      if (!frame[field].length || !matching.length) return
      smoothed[field] = frame[field].map((_, coordinate) => matching
        .reduce((total, candidate) => total + candidate[field][coordinate], 0) / matching.length)
    })
    smoothed.quality = nearby.reduce((total, candidate) => total + (candidate.quality ?? 1), 0) / nearby.length
    return smoothed
  })
}

export function reduceMotionCheckpoints(frames: MotionFeatureFrame[], threshold = 0.075) {
  if (frames.length <= 2) return frames
  const checkpoints = [frames[0]]
  for (let index = 1; index < frames.length - 1; index += 1) {
    if (motionFrameDistance(checkpoints.at(-1)!, frames[index]) >= threshold) checkpoints.push(frames[index])
  }
  checkpoints.push(frames.at(-1)!)
  return checkpoints
}

export interface MotionComparison {
  feedback: string
  overallScore: number
  path: Array<[number, number]>
  scores: Record<MotionComponent, number>
}

export interface MotionStageDefinition {
  id: string
  label: string
  progress: number
  scored?: boolean
}

export interface MotionStageComparison extends MotionStageDefinition {
  feedback: string
  learnerRange: [number, number]
  referenceRange: [number, number]
  score: number
  scores: Record<MotionComponent, number>
}

export function suggestMotionStages(frames: MotionFeatureFrame[]): MotionStageDefinition[] {
  if (!frames.length) return []
  if (frames.length === 1) return [{ id: 'start', label: 'Inicio', progress: 0, scored: false }]

  const cumulative = [0]
  for (let index = 1; index < frames.length; index += 1) {
    cumulative.push(cumulative[index - 1] + motionFrameDistance(frames[index - 1], frames[index]))
  }
  const total = cumulative.at(-1) ?? 0
  const keyCount = frames.length >= 10 ? 2 : 1
  const keyStages = Array.from({ length: keyCount }, (_, index) => {
    const target = total > 0 ? total * (index + 1) / (keyCount + 1) : 0
    const frameIndex = total > 0
      ? cumulative.reduce((best, value, candidate) => (
          Math.abs(value - target) < Math.abs(cumulative[best] - target) ? candidate : best
        ), 0)
      : Math.round((frames.length - 1) * (index + 1) / (keyCount + 1))
    return {
      id: `key-${index + 1}`,
      label: keyCount === 1 ? 'Momento clave' : `Momento clave ${index + 1}`,
      progress: Number((frameIndex / (frames.length - 1)).toFixed(3)),
    }
  })

  return [
    { id: 'start', label: 'Inicio', progress: 0, scored: false },
    ...keyStages,
    { id: 'end', label: 'Final', progress: 1, scored: false },
  ]
}

export function compareMotionStages(
  reference: MotionFeatureFrame[],
  learner: MotionFeatureFrame[],
  stages: MotionStageDefinition[],
): MotionStageComparison[] {
  if (!reference.length || !learner.length || !stages.length) return []
  const path = alignMotionSequences(reference, learner)
  if (!path.length) return []
  const ordered = stages
    .map((stage) => ({ ...stage, progress: Math.max(0, Math.min(1, stage.progress)) }))
    .sort((left, right) => left.progress - right.progress)
  const anchors = ordered.map((stage) => {
    const referenceIndex = Math.round(stage.progress * Math.max(0, reference.length - 1))
    const matching = path.filter(([candidate]) => candidate === referenceIndex)
    const closest = matching.length ? matching : path
      .slice()
      .sort((left, right) => Math.abs(left[0] - referenceIndex) - Math.abs(right[0] - referenceIndex))
      .slice(0, 1)
    const learnerIndex = Math.round(closest
      .reduce((sum, pair) => sum + pair[1], 0) / Math.max(1, closest.length))
    return { learnerIndex, referenceIndex }
  })

  return ordered.map((stage, index) => {
    const previous = anchors[index - 1]
    const current = anchors[index]
    const next = anchors[index + 1]
    const referenceStart = previous
      ? Math.floor((previous.referenceIndex + current.referenceIndex) / 2)
      : 0
    const referenceEnd = next
      ? Math.ceil((current.referenceIndex + next.referenceIndex) / 2)
      : reference.length - 1
    const learnerStart = previous
      ? Math.floor((previous.learnerIndex + current.learnerIndex) / 2)
      : 0
    const learnerEnd = next
      ? Math.ceil((current.learnerIndex + next.learnerIndex) / 2)
      : learner.length - 1
    const referenceSegment = reference.slice(referenceStart, referenceEnd + 1)
    const learnerSegment = learner.slice(learnerStart, learnerEnd + 1)
    const referenceStartTime = referenceSegment[0]?.t ?? 0
    const learnerStartTime = learnerSegment[0]?.t ?? 0
    const comparison = compareMotionSequences(
      referenceSegment.map((frame) => ({ ...frame, t: frame.t - referenceStartTime })),
      learnerSegment.map((frame) => ({ ...frame, t: frame.t - learnerStartTime })),
    )
    return {
      ...stage,
      feedback: comparison.feedback,
      learnerRange: [
        learnerStart / Math.max(1, learner.length - 1),
        learnerEnd / Math.max(1, learner.length - 1),
      ],
      referenceRange: [
        referenceStart / Math.max(1, reference.length - 1),
        referenceEnd / Math.max(1, reference.length - 1),
      ],
      score: comparison.overallScore,
      scores: comparison.scores,
    }
  })
}

export function motionVectorDistance(left: number[], right: number[]) {
  if (!left.length || !right.length) return null
  const length = Math.min(left.length, right.length)
  let total = 0
  for (let index = 0; index < length; index += 1) {
    total += Math.min(2, Math.abs(left[index] - right[index]))
  }
  return total / length
}

export function motionFrameDistance(left: MotionFeatureFrame, right: MotionFeatureFrame) {
  const weighted = [
    [motionVectorDistance(left.handShape, right.handShape), 0.4],
    [motionVectorDistance(left.location, right.location), 0.35],
    [motionVectorDistance(left.orientation, right.orientation), 0.25],
  ] as const
  let total = 0
  let totalWeight = 0
  for (const [distance, weight] of weighted) {
    if (distance === null) continue
    total += distance * weight
    totalWeight += weight
  }
  return totalWeight ? total / totalWeight : 1
}

export function alignMotionSequences(
  reference: MotionFeatureFrame[],
  learner: MotionFeatureFrame[],
) {
  if (!reference.length || !learner.length) return []
  const rows = reference.length + 1
  const columns = learner.length + 1
  const cost = Array.from({ length: rows }, () => Array(columns).fill(Number.POSITIVE_INFINITY))
  cost[0][0] = 0
  const window = Math.max(3, Math.abs(reference.length - learner.length) + 3)

  for (let row = 1; row < rows; row += 1) {
    const start = Math.max(1, row - window)
    const end = Math.min(columns - 1, row + window)
    for (let column = start; column <= end; column += 1) {
      const local = motionFrameDistance(reference[row - 1], learner[column - 1])
      cost[row][column] = local + Math.min(
        cost[row - 1][column - 1],
        cost[row - 1][column] + 0.08,
        cost[row][column - 1] + 0.08,
      )
    }
  }

  const path: Array<[number, number]> = []
  let row = reference.length
  let column = learner.length
  while (row > 0 && column > 0) {
    path.unshift([row - 1, column - 1])
    const diagonal = cost[row - 1][column - 1]
    const vertical = cost[row - 1][column]
    const horizontal = cost[row][column - 1]
    if (diagonal <= vertical && diagonal <= horizontal) {
      row -= 1
      column -= 1
    } else if (vertical <= horizontal) {
      row -= 1
    } else {
      column -= 1
    }
  }
  return path
}

export function scoreDistance(distance: number | null) {
  if (distance === null) return 100
  return Math.max(0, Math.min(100, Math.round(100 * Math.exp(-2.2 * distance))))
}

export function compareMotionSequences(
  reference: MotionFeatureFrame[],
  learner: MotionFeatureFrame[],
): MotionComparison {
  const path = alignMotionSequences(reference, learner)
  const componentVectors: Record<Exclude<MotionComponent, 'timing'>, keyof MotionFeatureFrame> = {
    handShape: 'handShape',
    location: 'location',
    orientation: 'orientation',
    trajectory: 'trajectory',
    facePosture: 'facePosture',
  }
  const scores = {} as Record<MotionComponent, number>
  for (const [component, field] of Object.entries(componentVectors) as Array<[
    Exclude<MotionComponent, 'timing'>,
    keyof MotionFeatureFrame,
  ]>) {
    const distances = path.flatMap(([referenceIndex, learnerIndex]) => {
      const distance = motionVectorDistance(
        reference[referenceIndex][field] as number[],
        learner[learnerIndex][field] as number[],
      )
      return distance === null ? [] : [distance]
    })
    scores[component] = scoreDistance(
      distances.length ? distances.reduce((sum, value) => sum + value, 0) / distances.length : null,
    )
  }

  const referenceDuration = reference.at(-1)?.t ?? 0
  const learnerDuration = learner.at(-1)?.t ?? 0
  const durationDifference = Math.abs(referenceDuration - learnerDuration)
    / Math.max(referenceDuration, learnerDuration, 1)
  scores.timing = Math.round(Math.max(0, 100 - durationDifference * 100))

  const weights: Record<MotionComponent, number> = {
    handShape: 0.27,
    location: 0.23,
    orientation: 0.18,
    trajectory: 0.17,
    timing: 0.1,
    facePosture: 0.05,
  }
  const overallScore = Math.round((Object.keys(weights) as MotionComponent[])
    .reduce((total, component) => total + scores[component] * weights[component], 0))
  const weakest = (Object.keys(scores) as MotionComponent[])
    .sort((left, right) => scores[left] - scores[right])[0]
  const weakestField = componentVectors[weakest as Exclude<MotionComponent, 'timing'>]
  const weakestPoint = weakest === 'timing' ? Math.floor(path.length / 2) : path
    .map(([referenceIndex, learnerIndex], index) => ({
      index,
      distance: motionVectorDistance(
        reference[referenceIndex][weakestField] as number[],
        learner[learnerIndex][weakestField] as number[],
      ) ?? 0,
    }))
    .sort((left, right) => right.distance - left.distance)[0]?.index ?? 0
  const phaseRatio = weakestPoint / Math.max(1, path.length - 1)
  const phase = phaseRatio < .34 ? 'al inicio' : phaseRatio < .67 ? 'en la parte central' : 'al final'
  const feedbackByComponent: Record<MotionComponent, string> = {
    handShape: `Revisa ${phase}: la forma de la mano y la posición de los dedos se separan de la referencia.`,
    location: `Ajusta ${phase}: compara la altura y la distancia de la palma respecto al rostro, los hombros o el pecho.`,
    orientation: `Corrige ${phase}: la dirección de la palma cambia antes o después que en la referencia.`,
    trajectory: `Ajusta ${phase}: sigue con más precisión la dirección y el recorrido de la referencia.`,
    timing: 'Mantén el orden del movimiento, pero ajusta la duración para acercarte al ritmo de la referencia.',
    facePosture: `Revisa ${phase}: ajusta la cabeza, el torso o la expresión para coincidir con la referencia.`,
  }

  return {
    feedback: scores[weakest] < 75
      ? feedbackByComponent[weakest]
      : 'El movimiento coincide bien con la referencia.',
    overallScore,
    path,
    scores,
  }
}
