import { describe, expect, it } from 'vitest'
import {
  alignMotionSequences,
  compareMotionStages,
  compareMotionSequences,
  filterMotionFrames,
  reduceMotionCheckpoints,
  smoothMotionSequence,
  suggestMotionStages,
} from './scoring'
import type { MotionFeatureFrame } from './scoring'

function frame(value: number, t: number): MotionFeatureFrame {
  return {
    t,
    handShape: [value, value / 2],
    location: [value],
    orientation: [value / 3],
    trajectory: [value / 4],
    facePosture: [value / 5],
  }
}

describe('motion sequence scoring', () => {
  it('aligns the same movement performed with more intermediate frames', () => {
    const reference = [frame(0, 0), frame(0.5, 500), frame(1, 1000)]
    const learner = [frame(0, 0), frame(0.25, 250), frame(0.5, 500), frame(0.75, 750), frame(1, 1000)]

    expect(alignMotionSequences(reference, learner).length).toBeGreaterThanOrEqual(learner.length)
    expect(compareMotionSequences(reference, learner).overallScore).toBeGreaterThan(75)
  })

  it('gives identical sequences a perfect component result', () => {
    const sequence = [frame(0, 0), frame(0.5, 500), frame(1, 1000)]
    const result = compareMotionSequences(sequence, sequence)

    expect(result.overallScore).toBe(100)
    expect(Object.values(result.scores).every((score) => score === 100)).toBe(true)
  })

  it('removes unreliable frames, smooths noise, and retains sequence endpoints', () => {
    const noisy = [
      { ...frame(0, 0), quality: .9 },
      { ...frame(1, 100), quality: .2 },
      { ...frame(.2, 200), quality: .9 },
      { ...frame(.21, 300), quality: .9 },
      { ...frame(1, 400), quality: .95 },
    ]
    const tracked = filterMotionFrames(noisy, .5)
    const smoothed = smoothMotionSequence(tracked, 3)
    const checkpoints = reduceMotionCheckpoints(smoothed)

    expect(tracked).toHaveLength(4)
    expect(smoothed[1].location[0]).toBeLessThan(.5)
    expect(checkpoints[0].t).toBe(0)
    expect(checkpoints.at(-1)?.t).toBe(400)
  })

  it('suggests ordered teacher checkpoints from movement progress', () => {
    const sequence = Array.from({ length: 12 }, (_, index) => frame(index / 11, index * 100))
    const stages = suggestMotionStages(sequence)

    expect(stages.map((stage) => stage.label)).toEqual([
      'Inicio', 'Momento clave 1', 'Momento clave 2', 'Final',
    ])
    expect(stages[0].progress).toBe(0)
    expect(stages.at(-1)?.progress).toBe(1)
    expect(stages[0].scored).toBe(false)
    expect(stages.at(-1)?.scored).toBe(false)
    expect(stages.slice(1, -1).every((stage) => stage.scored !== false)).toBe(true)
    expect(stages.every((stage, index) => !index || stage.progress >= stages[index - 1].progress)).toBe(true)
  })

  it('compares equivalent learner segments without requiring identical timing', () => {
    const reference = [frame(0, 0), frame(.5, 500), frame(1, 1_000)]
    const learner = [frame(0, 0), frame(.25, 500), frame(.5, 1_000), frame(.75, 1_500), frame(1, 2_000)]
    const stages = suggestMotionStages(reference)
    const comparisons = compareMotionStages(reference, learner, stages)

    expect(comparisons).toHaveLength(stages.length)
    expect(comparisons[0].scored).toBe(false)
    expect(comparisons.at(-1)?.scored).toBe(false)
    expect(comparisons.every((stage) => stage.score > 75)).toBe(true)
    expect(comparisons[0].learnerRange[0]).toBe(0)
    expect(comparisons.at(-1)?.learnerRange[1]).toBe(1)
  })
})
