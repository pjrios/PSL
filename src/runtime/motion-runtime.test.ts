import { describe, expect, it } from 'vitest'
import { createMotionConfigSource, createMotionRuntimeSource } from './motion-runtime'

describe('motion runtime source', () => {
  it('serializes a self-contained runtime that can start with no activities', () => {
    const source = `${createMotionConfigSource({
      activities: [],
      currentPage: 'home',
    })}\n${createMotionRuntimeSource()}`

    expect(() => new Function(source)()).not.toThrow()
    expect(window.__MOTION_ANALYSIS__?.currentPage).toBe('home')
  })

  it('pins the MediaPipe package and Holistic model without the unsupported module worker', () => {
    const source = createMotionRuntimeSource()

    expect(source).toContain('@mediapipe/tasks-vision@1.0.1')
    expect(source).toContain('holistic_landmarker.task')
    expect(source).toContain('FilesetResolver')
    expect(source).toContain('return import(url)')
    expect(source).toContain('drawHolisticOverlay')
    expect(source).toContain('leftHandLandmarks')
    expect(source).toContain('poseLandmarks')
    expect(source).toContain('faceLandmarks')
    expect(source).toContain('outputFaceBlendshapes: false')
    expect(source).toContain("landmarkerDelegate !== \"GPU\"")
    expect(source).toContain('Grabando movimiento…')
    expect(source).toContain('await ensureLandmarker()')
    expect(source).toContain('Detener y guardar')
    expect(source).toContain('stopRequested')
    expect(source).toContain('fitScale')
    expect(source).toContain('fit === "cover"')
    expect(source).toContain('renderedWidth')
    expect(source).toContain('replayLandmarkFrame')
    expect(source).toContain('Reproducir referencia')
    expect(source).toContain('recordedLandmarkFrames')
    expect(source).toContain("overall.setAttribute(\"aria-label\"")
    expect(source).toContain('data-motion-template-field')
    expect(source).toContain('Referencia lista.')
    expect(source).toContain('data-motion-source-mode')
    expect(source).toContain('landmarkFrames')
    expect(source).toContain('analyzeSelectedVideo')
    expect(source).toContain('Analizar tramo del video')
    expect(source).toContain('data-motion-segment-start')
    expect(source).toContain('data-motion-crop-edit')
    expect(source).toContain('data-motion-crop-box')
    expect(source).toContain('cropInteraction === "move"')
    expect(source).toContain('cropInteraction === "left"')
    expect(source).toContain('cropInteraction === "right"')
    expect(source).toContain('cropInteraction === "top"')
    expect(source).toContain('ajustar cada borde')
    expect(source).toContain('sourceCrop')
    expect(source).toContain('transformOrigin')
    expect(source).toContain('> .2')
    expect(source).toContain('sourceSegment')
    expect(source).toContain('storedClip')
    expect(source).toContain('Contar en puntuación')
    expect(source).toContain('scoredStageComparisons')
    expect(source).toContain('No cuenta')
    expect(source).toContain('captureStream')
    expect(source).toContain('MediaRecorder')
    expect(source).toContain('Preparando solamente el tramo y encuadre seleccionados')
    expect(source).toContain('startSeconds')
    expect(source).toContain('endSeconds')
    expect(source).toContain('data-motion-reference-preview')
    expect(source).toContain('syncReferencePresentation')
    expect(source).toContain('previewTemplate?.storedClip ? "cover" : "contain"')
    expect(source).toContain('storedFrame?.width')
    expect(source).toContain('new ResizeObserverConstructor')
    expect(source).toContain('drawReferenceFrame')
    expect(source).toContain('referencePreview.style.left')
    expect(source).toContain('Puntos de referencia listos')
    expect(source).toContain('/storage/v1/object/authenticated/')
    expect(source).toContain('storageAddress')
    expect(source).toContain('Detener y comparar')
    expect(source).toContain('Ver mi intento')
    expect(source).toContain('MediaRecorder')
    expect(source).toContain('solamente en esta pestaña')
    expect(source).toContain('data-motion-sync-replay')
    expect(source).toContain('replayTogether')
    expect(source).toContain('Promise.all([replayStoredReference(referenceRange), replay(learnerRange)])')
    expect(source).toContain('requiredHand')
    expect(source).toContain('satisfiesRequiredHand')
    expect(source).toContain('Esta práctica utiliza la mano derecha')
    expect(source).toContain('bodyRelativeHandMetrics')
    expect(source).toContain('measurementModel')
    expect(source).toContain('body-relative-v2')
    expect(source).toContain('templateFramesForCurrentMeasurements')
    expect(source).toContain('suggestMotionStages')
    expect(source).toContain('compareMotionStages')
    expect(source).toContain('data-motion-stage-editor')
    expect(source).toContain('motion-stage-timeline')
    expect(source).toContain('previewStageProgress')
    expect(source).toContain('setPointerCapture')
    expect(source).toContain('Línea de tiempo de la referencia')
    expect(source).toContain('Reproducir esta etapa')
    expect(source).toContain('stages: stageResults')
    expect(source).toContain('classList.toggle("is-mirrored"')
    expect(source).toContain('classList.remove("is-mirrored")')
    expect(source).not.toContain('new Worker')
  })

  it('serializes scoring without build-tool globals or missing helpers', () => {
    const source = createMotionRuntimeSource()
    const frame = {
      facePosture: [0.1, 0.2],
      handShape: [0.25, 0.5],
      location: [0.1, -0.1, 0],
      orientation: [0, 0, 1],
      quality: 1,
      t: 1_000,
      trajectory: [0.05, 0, 0],
    }
    const compare = new Function(`${source}\nreturn compareMotionSequences;`)() as (
      left: typeof frame[],
      right: typeof frame[],
    ) => { overallScore: number }
    const comparison = compare([frame], [frame])
    const leftHand = {
      ...frame,
      handShape: [1, ...Array(15).fill(0.75), 0, ...Array(15).fill(0)],
      location: [1, 0.5, 0.25, 0, 0, 0, 0, 0],
      orientation: [1, 0, 0, 1, 0, 0, 0, 0],
    }
    const rightHand = {
      ...frame,
      handShape: [0, ...Array(15).fill(0), 1, ...Array(15).fill(0.75)],
      location: [0, 0, 0, 0, 1, 0.5, 0.25, 0],
      orientation: [0, 0, 0, 0, 1, 0, 0, 1],
    }

    expect(source).not.toContain('__vite_ssr_import_')
    expect(source).toContain('const scoreDistance =')
    expect(comparison.overallScore).toBe(100)
    expect(compare([leftHand], [rightHand]).overallScore).toBeLessThan(80)
  })
})
