import type {
  DataSource,
  MotionActivity,
  NavigationContext,
  ProjectAuthentication,
} from '../core/project'
import {
  alignMotionSequences,
  compareMotionStages,
  compareMotionSequences,
  filterMotionFrames,
  motionFrameDistance,
  motionVectorDistance,
  reduceMotionCheckpoints,
  scoreDistance,
  smoothMotionSequence,
  suggestMotionStages,
} from '../core/motion'
import type { MotionFeatureFrame, MotionStageComparison, MotionStageDefinition } from '../core/motion'

export interface MotionRuntimeConfig {
  activities: MotionActivity[]
  authentication?: ProjectAuthentication
  currentContext?: NavigationContext
  currentPage: string
  dataSources?: DataSource[]
}

export interface MotionReferenceRuntimeMessage {
  action: 'reference'
  activityId: string
  source: 'motion-analysis-runtime'
  template: {
    approvedAt?: string
    durationMs: number
    frames: MotionFeatureFrame[]
    landmarkFrames?: RuntimeLandmarkFrame[]
    measurementModel?: 'body-relative-v2'
    requiredHand?: RuntimeRequiredHand
    stages?: MotionStageDefinition[]
    sourceCrop?: { height: number; width: number; x: number; y: number }
    sourceSegment?: { endSeconds: number; startSeconds: number }
    storedClip?: boolean
    storedClipDurationMs?: number
    version: 2
  }
}

export function isMotionReferenceRuntimeMessage(value: unknown): value is MotionReferenceRuntimeMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Partial<MotionReferenceRuntimeMessage>
  return message.source === 'motion-analysis-runtime'
    && message.action === 'reference'
    && typeof message.activityId === 'string'
    && message.template?.version === 2
    && Array.isArray(message.template.frames)
}

declare global {
  interface Window {
    __MOTION_ANALYSIS__?: MotionRuntimeConfig
  }
}

export type RuntimeLandmark = { x: number; y: number; z?: number; visibility?: number }
type RuntimeResult = Record<string, unknown>
export type RuntimeLandmarkFrame = RuntimeResult & {
  faceLandmarks: RuntimeLandmark[][]
  height: number
  leftHandLandmarks: RuntimeLandmark[][]
  poseLandmarks: RuntimeLandmark[][]
  replaySampled?: boolean
  rightHandLandmarks: RuntimeLandmark[][]
  t: number
  width: number
}
type RuntimeLandmarker = {
  close: () => void
  detectForVideo: (image: ImageBitmap, timestamp: number) => RuntimeResult
}
type RuntimeSourceCrop = { height: number; width: number; x: number; y: number }
export type RuntimeRequiredHand = 'left' | 'right' | 'both' | 'either'
type MotionRuntimeHelpers = {
  compareMotionStages: typeof compareMotionStages
  compareMotionSequences: typeof compareMotionSequences
  filterMotionFrames: typeof filterMotionFrames
  reduceMotionCheckpoints: typeof reduceMotionCheckpoints
  smoothMotionSequence: typeof smoothMotionSequence
  suggestMotionStages: typeof suggestMotionStages
}

export function installMotionRuntime(
  runtimeWindow: Window = window,
  runtimeDocument: Document = document,
  helpers?: MotionRuntimeHelpers,
) {
  const config = runtimeWindow.__MOTION_ANALYSIS__
  if (!config?.activities.length) return () => undefined
  if (!helpers) throw new Error('Motion runtime helpers are unavailable.')
  const runtimeHelpers = helpers
  const runtimeConfig = config
  const moduleUrl = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/+esm'
  const wasmRoot = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
  const modelUrl = 'https://storage.googleapis.com/mediapipe-models/holistic_landmarker/holistic_landmarker/float16/1/holistic_landmarker.task'
  let landmarker: RuntimeLandmarker | undefined
  let landmarkerPromise: Promise<RuntimeLandmarker> | undefined
  let landmarkerDelegate: 'GPU' | 'CPU' | undefined
  let mediaPipeTimestamp = 0

  async function createLandmarker(delegate: 'GPU' | 'CPU') {
    const dynamicImport = Function('url', 'return import(url)') as (url: string) => Promise<unknown>
    const visionModule = await dynamicImport(moduleUrl) as {
      FilesetResolver: { forVisionTasks: (root: string) => Promise<unknown> }
      HolisticLandmarker: { createFromOptions: (
        vision: unknown,
        options: Record<string, unknown>,
      ) => Promise<RuntimeLandmarker> }
    }
    const vision = await visionModule.FilesetResolver.forVisionTasks(wasmRoot)
    return visionModule.HolisticLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: modelUrl, delegate },
      runningMode: 'VIDEO',
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minFaceSuppressionThreshold: 0.3,
      minHandLandmarksConfidence: 0.5,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minPoseSuppressionThreshold: 0.3,
      // The live guide needs landmarks, not the additional expression model.
      // That model is unsupported by some browser WebGL implementations.
      outputFaceBlendshapes: false,
    })
  }

  async function ensureLandmarker() {
    if (landmarker) return landmarker
    if (landmarkerPromise) return landmarkerPromise
    landmarkerPromise = createLandmarker('GPU')
      .then((created) => {
        landmarkerDelegate = 'GPU'
        landmarker = created
        return created
      })
      .catch(() => createLandmarker('CPU').then((created) => {
        landmarkerDelegate = 'CPU'
        landmarker = created
        return created
      }))
      .catch((error) => {
        landmarkerPromise = undefined
        throw error
      })
    return landmarkerPromise
  }

  async function detectFrame(source: HTMLVideoElement, crop?: RuntimeSourceCrop) {
    const activeLandmarker = await ensureLandmarker()
    const bitmap = crop
      ? await createImageBitmap(
          source,
          Math.max(0, Math.round(source.videoWidth * crop.x)),
          Math.max(0, Math.round(source.videoHeight * crop.y)),
          Math.max(1, Math.round(source.videoWidth * crop.width)),
          Math.max(1, Math.round(source.videoHeight * crop.height)),
        )
      : await createImageBitmap(source)
    mediaPipeTimestamp += 100
    try {
      try {
        return activeLandmarker.detectForVideo(bitmap, mediaPipeTimestamp)
      } catch (error) {
        // A GPU graph can initialize successfully and still fail on its first
        // frame. Retry that frame on CPU instead of exposing the raw error.
        if (landmarkerDelegate !== 'GPU') throw error
        activeLandmarker.close()
        landmarker = await createLandmarker('CPU')
        landmarkerDelegate = 'CPU'
        landmarkerPromise = Promise.resolve(landmarker)
        return landmarker.detectForVideo(bitmap, mediaPipeTimestamp)
      }
    } finally {
      bitmap.close()
    }
  }

  function landmarks(result: RuntimeResult, field: string) {
    const value = result[field]
    if (!Array.isArray(value) || !Array.isArray(value[0])) return []
    return value[0] as RuntimeLandmark[]
  }

  function drawHolisticOverlay(
    canvas: HTMLCanvasElement,
    sourceWidth: number,
    sourceHeight: number,
    result: RuntimeResult,
    features: MotionActivity['features'],
    fit: 'contain' | 'cover' = 'contain',
  ) {
    const width = canvas.clientWidth || 640
    const height = canvas.clientHeight || 480
    const pixelRatio = Math.min(runtimeWindow.devicePixelRatio || 1, 2)
    const pixelWidth = Math.round(width * pixelRatio)
    const pixelHeight = Math.round(height * pixelRatio)
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight
    const context = canvas.getContext('2d')
    if (!context) return
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    context.clearRect(0, 0, width, height)
    context.lineCap = 'round'
    context.lineJoin = 'round'

    // Match the video's object-fit calculation exactly. Drawing
    // directly in visible CSS pixels avoids relying on canvas object-fit,
    // whose intrinsic sizing can differ from the video after resizing.
    const fitScale = fit === 'cover'
      ? Math.max(width / sourceWidth, height / sourceHeight)
      : Math.min(width / sourceWidth, height / sourceHeight)
    const renderedWidth = sourceWidth * fitScale
    const renderedHeight = sourceHeight * fitScale
    const offsetX = (width - renderedWidth) / 2
    const offsetY = (height - renderedHeight) / 2

    const point = (landmark: RuntimeLandmark) => ({
      x: offsetX + landmark.x * renderedWidth,
      y: offsetY + landmark.y * renderedHeight,
    })
    const drawConnections = (
      values: RuntimeLandmark[],
      connections: Array<[number, number]>,
      color: string,
      lineWidth: number,
    ) => {
      context.strokeStyle = color
      context.lineWidth = lineWidth
      for (const [fromIndex, toIndex] of connections) {
        const from = values[fromIndex]
        const to = values[toIndex]
        if (!from || !to) continue
        const start = point(from)
        const end = point(to)
        context.beginPath()
        context.moveTo(start.x, start.y)
        context.lineTo(end.x, end.y)
        context.stroke()
      }
    }
    const drawPoints = (values: RuntimeLandmark[], color: string, radius: number, step = 1) => {
      context.fillStyle = color
      for (let index = 0; index < values.length; index += step) {
        const current = point(values[index])
        context.beginPath()
        context.arc(current.x, current.y, radius, 0, Math.PI * 2)
        context.fill()
      }
    }
    const handConnections: Array<[number, number]> = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [5, 9], [9, 10], [10, 11], [11, 12],
      [9, 13], [13, 14], [14, 15], [15, 16],
      [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
    ]
    const poseConnections: Array<[number, number]> = [
      [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8],
      [9, 10], [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21],
      [17, 19], [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
      [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [27, 29], [29, 31],
      [24, 26], [26, 28], [28, 30], [30, 32],
    ]
    if (features.pose) {
      const pose = landmarks(result, 'poseLandmarks')
      drawConnections(pose, poseConnections, '#38d9ff', 3)
      drawPoints(pose, '#ffffff', 3)
    }
    if (features.hands) {
      const left = landmarks(result, 'leftHandLandmarks')
      const right = landmarks(result, 'rightHandLandmarks')
      drawConnections(left, handConnections, '#ffd166', 4)
      drawPoints(left, '#fff1a8', 4)
      drawConnections(right, handConnections, '#ff7eb6', 4)
      drawPoints(right, '#ffc2dc', 4)
    }
    if (features.face) {
      drawPoints(
        landmarks(result, 'faceLandmarks'),
        'rgba(255,255,255,.72)',
        1.5,
        result.replaySampled ? 1 : 3,
      )
    }
  }

  function replayLandmarkFrame(
    result: RuntimeResult,
    source: HTMLVideoElement,
    t: number,
    crop?: RuntimeSourceCrop,
  ): RuntimeLandmarkFrame {
    const compact = (value: RuntimeLandmark) => ({
      x: value.x,
      y: value.y,
      ...(value.z === undefined ? {} : { z: value.z }),
      ...(value.visibility === undefined ? {} : { visibility: value.visibility }),
    })
    const copy = (field: string, sample = 1) => [
      landmarks(result, field)
        .filter((_, index) => index % sample === 0)
        .map(compact),
    ]
    return {
      faceLandmarks: copy('faceLandmarks', 3),
      height: crop
        ? Math.max(1, (source.videoHeight || 480) * crop.height)
        : source.videoHeight || 480,
      leftHandLandmarks: copy('leftHandLandmarks'),
      poseLandmarks: copy('poseLandmarks'),
      replaySampled: true,
      rightHandLandmarks: copy('rightHandLandmarks'),
      t,
      width: crop
        ? Math.max(1, (source.videoWidth || 640) * crop.width)
        : source.videoWidth || 640,
    }
  }

  function pointDistance(left: RuntimeLandmark, right: RuntimeLandmark) {
    return Math.hypot(left.x - right.x, left.y - right.y, (left.z ?? 0) - (right.z ?? 0))
  }

  function angle(first: RuntimeLandmark, middle: RuntimeLandmark, last: RuntimeLandmark) {
    const left = [first.x - middle.x, first.y - middle.y, (first.z ?? 0) - (middle.z ?? 0)]
    const right = [last.x - middle.x, last.y - middle.y, (last.z ?? 0) - (middle.z ?? 0)]
    const denominator = Math.hypot(...left) * Math.hypot(...right)
    if (!denominator) return 0
    const cosine = Math.max(-1, Math.min(1, left.reduce((sum, value, index) => sum + value * right[index], 0) / denominator))
    return Math.acos(cosine) / Math.PI
  }

  function handShape(hand: RuntimeLandmark[]) {
    if (hand.length < 21) return []
    const fingers = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]]
    return fingers.flatMap(([base, middle, distal, tip]) => [
      angle(hand[base], hand[middle], hand[distal]),
      angle(hand[middle], hand[distal], hand[tip]),
      pointDistance(hand[0], hand[tip]) / Math.max(pointDistance(hand[0], hand[9]), 0.001),
    ])
  }

  function handOrientation(hand: RuntimeLandmark[]) {
    if (hand.length < 18) return []
    const wrist = hand[0]
    const index = hand[5]
    const pinky = hand[17]
    const first = [index.x - wrist.x, index.y - wrist.y, (index.z ?? 0) - (wrist.z ?? 0)]
    const second = [pinky.x - wrist.x, pinky.y - wrist.y, (pinky.z ?? 0) - (wrist.z ?? 0)]
    const normal = [
      first[1] * second[2] - first[2] * second[1],
      first[2] * second[0] - first[0] * second[2],
      first[0] * second[1] - first[1] * second[0],
    ]
    const length = Math.hypot(...normal) || 1
    return normal.map((value) => value / length)
  }

  function trackedVector(vector: number[], expectedLength: number) {
    return vector.length
      ? [1, ...vector]
      : [0, ...Array(expectedLength).fill(0)]
  }

  function handLocation(hand: RuntimeLandmark[], center: { x: number; y: number }, scale: number) {
    return hand[0]
      ? [1, (hand[0].x - center.x) / scale, (hand[0].y - center.y) / scale, (hand[0].z ?? 0) / scale]
      : [0, 0, 0, 0]
  }

  function landmarkCenter(points: Array<RuntimeLandmark | undefined>, fallback: RuntimeLandmark) {
    const available = points.filter((point): point is RuntimeLandmark => Boolean(point))
    if (!available.length) return fallback
    return {
      x: available.reduce((total, point) => total + point.x, 0) / available.length,
      y: available.reduce((total, point) => total + point.y, 0) / available.length,
      z: available.reduce((total, point) => total + (point.z ?? 0), 0) / available.length,
    }
  }

  function bodyRelativeHandMetrics(
    hand: RuntimeLandmark[],
    anchors: {
      chest: RuntimeLandmark
      leftShoulder: RuntimeLandmark
      mouth: RuntimeLandmark
      nose: RuntimeLandmark
      rightShoulder: RuntimeLandmark
      shoulderCenter: RuntimeLandmark
    },
    scale: number,
  ) {
    if (hand.length < 18) return [0, ...Array(8).fill(0)]
    const palm = landmarkCenter([hand[0], hand[5], hand[9], hand[13], hand[17]], hand[0])
    const normalizedDistance = (anchor: RuntimeLandmark) => pointDistance(palm, anchor) / scale
    return [
      1,
      (palm.x - anchors.shoulderCenter.x) / scale,
      (palm.y - anchors.shoulderCenter.y) / scale,
      (palm.z ?? 0) / scale,
      normalizedDistance(anchors.nose),
      normalizedDistance(anchors.mouth),
      normalizedDistance(anchors.leftShoulder),
      normalizedDistance(anchors.rightShoulder),
      normalizedDistance(anchors.chest),
    ]
  }

  function hasTrackedHand(frame: MotionFeatureFrame) {
    // Smoothing averages the presence marker with nearby frames, so a tracked
    // hand can legitimately be fractional instead of exactly 1.
    return (frame.handShape[0] ?? 0) > 0.2 || (frame.handShape[16] ?? 0) > 0.2
  }

  function handPresenceRate(frames: MotionFeatureFrame[], markerIndex: 0 | 16) {
    if (!frames.length) return 0
    return frames.filter((frame) => (frame.handShape[markerIndex] ?? 0) > 0.2).length / frames.length
  }

  function satisfiesRequiredHand(frames: MotionFeatureFrame[], requiredHand: RuntimeRequiredHand) {
    const leftTracked = handPresenceRate(frames, 0) >= 0.25
    const rightTracked = handPresenceRate(frames, 16) >= 0.25
    if (requiredHand === 'left') return leftTracked
    if (requiredHand === 'right') return rightTracked
    if (requiredHand === 'both') return leftTracked && rightTracked
    return leftTracked || rightTracked
  }

  function requiredHandFeedback(requiredHand: RuntimeRequiredHand) {
    if (requiredHand === 'left') return 'Esta práctica utiliza la mano izquierda. Intenta nuevamente usando esa mano como mano principal.'
    if (requiredHand === 'right') return 'Esta práctica utiliza la mano derecha. Intenta nuevamente usando esa mano como mano principal.'
    if (requiredHand === 'both') return 'Esta práctica requiere ambas manos. Mantén las dos visibles durante todo el movimiento.'
    return 'Mantén al menos una mano visible durante todo el movimiento.'
  }

  function featureFrame(
    result: RuntimeResult,
    t: number,
    features: MotionActivity['features'],
  ): MotionFeatureFrame {
    const pose = features.pose ? landmarks(result, 'poseLandmarks') : []
    const left = features.hands ? landmarks(result, 'leftHandLandmarks') : []
    const right = features.hands ? landmarks(result, 'rightHandLandmarks') : []
    const leftWorld = features.hands ? landmarks(result, 'leftHandWorldLandmarks') : []
    const rightWorld = features.hands ? landmarks(result, 'rightHandWorldLandmarks') : []
    const leftShoulder = pose[11]
    const rightShoulder = pose[12]
    const center = leftShoulder && rightShoulder
      ? { x: (leftShoulder.x + rightShoulder.x) / 2, y: (leftShoulder.y + rightShoulder.y) / 2 }
      : { x: 0.5, y: 0.5 }
    const scale = leftShoulder && rightShoulder
      ? Math.max(pointDistance(leftShoulder, rightShoulder), 0.05)
      : 0.25
    const leftShape = handShape(left)
    const rightShape = handShape(right)
    const leftOrientation = handOrientation(leftWorld.length ? leftWorld : left)
    const rightOrientation = handOrientation(rightWorld.length ? rightWorld : right)
    const shoulderCenter = {
      ...center,
      z: leftShoulder && rightShoulder ? ((leftShoulder.z ?? 0) + (rightShoulder.z ?? 0)) / 2 : 0,
    }
    const normalizedLeftShoulder = leftShoulder ?? { x: center.x - scale / 2, y: center.y, z: 0 }
    const normalizedRightShoulder = rightShoulder ?? { x: center.x + scale / 2, y: center.y, z: 0 }
    const nose = pose[0] ?? { x: center.x, y: center.y - scale, z: 0 }
    const mouth = landmarkCenter(
      [pose[9], pose[10]],
      { x: center.x, y: center.y - scale * 0.72, z: 0 },
    )
    const hipCenter = pose[23] && pose[24]
      ? landmarkCenter([pose[23], pose[24]], shoulderCenter)
      : undefined
    const chest = hipCenter
      ? {
          x: shoulderCenter.x + (hipCenter.x - shoulderCenter.x) * 0.35,
          y: shoulderCenter.y + (hipCenter.y - shoulderCenter.y) * 0.35,
          z: (shoulderCenter.z ?? 0) + ((hipCenter.z ?? 0) - (shoulderCenter.z ?? 0)) * 0.35,
        }
      : { x: center.x, y: center.y + scale * 0.72, z: shoulderCenter.z }
    const bodyAnchors = {
      chest,
      leftShoulder: normalizedLeftShoulder,
      mouth,
      nose,
      rightShoulder: normalizedRightShoulder,
      shoulderCenter,
    }
    const location = [
      ...handLocation(left, center, scale),
      ...handLocation(right, center, scale),
      ...bodyRelativeHandMetrics(left, bodyAnchors, scale),
      ...bodyRelativeHandMetrics(right, bodyAnchors, scale),
    ]
    const face = features.face ? landmarks(result, 'faceLandmarks') : []
    const mouthOpen = face[13] && face[14] ? pointDistance(face[13], face[14]) / scale : undefined
    const facePosture = [
      ...(pose[0] ? [(pose[0].x - center.x) / scale, (pose[0].y - center.y) / scale] : []),
      ...(mouthOpen === undefined ? [] : [mouthOpen]),
    ]
    const qualitySignals = [
      ...(features.hands ? [left.length >= 21 || right.length >= 21 ? 1 : 0] : []),
      ...(features.pose ? [pose.length >= 13
        ? [pose[0], pose[11], pose[12]].reduce((total, point) => total + (point?.visibility ?? 1), 0) / 3
        : 0] : []),
      ...(features.face ? [face.length ? 1 : 0] : []),
    ]
    return {
      t,
      handShape: [
        ...trackedVector(leftShape, 15),
        ...trackedVector(rightShape, 15),
      ],
      location,
      orientation: [
        ...trackedVector(leftOrientation, 3),
        ...trackedVector(rightOrientation, 3),
      ],
      trajectory: [],
      facePosture,
      quality: qualitySignals.length
        ? qualitySignals.reduce((total, value) => total + value, 0) / qualitySignals.length
        : 1,
    }
  }

  function addTrajectories(frames: MotionFeatureFrame[]) {
    return frames.map((frame, index) => {
      const previous = frames[Math.max(0, index - 1)]
      const length = Math.min(frame.location.length, previous.location.length)
      return {
        ...frame,
        trajectory: Array.from({ length }, (_, coordinate) => frame.location[coordinate] - previous.location[coordinate]),
      }
    })
  }

  function prepareSequence(frames: MotionFeatureFrame[], activity: MotionActivity) {
    const tracked = runtimeHelpers.filterMotionFrames(frames, activity.processing.minConfidence)
    const smoothed = runtimeHelpers.smoothMotionSequence(addTrajectories(tracked), activity.processing.smoothing)
    return activity.processing.checkpointReduction ? runtimeHelpers.reduceMotionCheckpoints(smoothed) : smoothed
  }

  function activeContext() {
    const context = { ...(runtimeConfig.currentContext ?? {}) }
    try {
      const parameters = new URLSearchParams(runtimeWindow.location.search)
      parameters.forEach((value, key) => {
        if (!key.startsWith('psl-context-')) return
        const parsed = JSON.parse(value) as { dataSourceId?: unknown; recordId?: unknown }
        if (typeof parsed.dataSourceId === 'string' && typeof parsed.recordId === 'string') {
          context[key.slice('psl-context-'.length)] = {
            dataSourceId: parsed.dataSourceId,
            recordId: parsed.recordId,
          }
        }
      })
    } catch {
      return context
    }
    return context
  }

  function fieldValue(record: unknown, path: string) {
    let value = record
    for (const segment of path.split('.')) {
      if (!value || typeof value !== 'object') return undefined
      value = (value as Record<string, unknown>)[segment]
    }
    return value
  }

  type RuntimeSession = { access_token: string; user?: { id?: string } }

  function storedSession(source: Extract<DataSource, { type: 'supabase' }>) {
    try {
      const project = runtimeConfig.authentication ?? source
      const key = `psl-auth:${new URL(project.projectUrl).hostname}`
      const value = JSON.parse(runtimeWindow.localStorage.getItem(key) ?? 'null') as RuntimeSession | null
      return typeof value?.access_token === 'string' ? value : undefined
    } catch {
      return undefined
    }
  }

  function storageAddress(value: string) {
    const match = /^storage:\/\/([^/]+)\/(.+)$/i.exec(value)
    return match ? { bucket: match[1], path: match[2] } : undefined
  }

  function encodedStoragePath(path: string) {
    return path.split('/').map((segment) => encodeURIComponent(segment)).join('/')
  }

  async function resolvedMediaUrl(dataSourceId: string, value: unknown) {
    if (typeof value !== 'string' || !value.trim()) return undefined
    if (/^https?:\/\//i.test(value)) return { url: value, revoke: false }
    const address = storageAddress(value)
    if (!address) return undefined
    const source = runtimeConfig.dataSources?.find((candidate) => candidate.id === dataSourceId)
    if (!source || source.type !== 'supabase') return undefined
    const session = storedSession(source)
    if (!session) throw new Error('Inicia sesión para ver el video de referencia.')
    const response = await runtimeWindow.fetch(
      `${source.projectUrl.replace(/\/$/, '')}/storage/v1/object/authenticated/${encodeURIComponent(address.bucket)}/${encodedStoragePath(address.path)}`,
      { headers: {
        apikey: source.publishableKey,
        Authorization: `Bearer ${session.access_token}`,
      } },
    )
    if (!response.ok) throw new Error('No se pudo descargar el video de referencia.')
    return { url: URL.createObjectURL(await response.blob()), revoke: true }
  }

  async function resolveDataRecord(
    dataSourceId: string,
    contextKey: string,
    selector?: { recordId?: string; recordMode?: 'context' | 'first' | 'last' | 'specific' },
  ) {
    const source = runtimeConfig.dataSources?.find((candidate) => candidate.id === dataSourceId)
    if (!source) return undefined
    const recordMode = selector?.recordMode ?? 'context'
    const contextualReference = activeContext()[contextKey]
    const selectedRecordId = recordMode === 'specific'
      ? selector?.recordId
      : recordMode === 'context' ? contextualReference?.recordId : undefined
    if ((recordMode === 'context' || recordMode === 'specific') && !selectedRecordId) return undefined
    if (source.type === 'static') {
      if (selectedRecordId) return source.records.find((record) => record.id === selectedRecordId)
      return recordMode === 'last' ? source.records.at(-1) : source.records[0]
    }
    if (source.type === 'rest') {
      const url = selectedRecordId
        ? source.recordUrl.replace('{id}', encodeURIComponent(selectedRecordId))
        : source.listUrl
      if (!url) return undefined
      const response = await runtimeWindow.fetch(url)
      if (!response.ok) return undefined
      const result = await response.json() as unknown
      return Array.isArray(result)
        ? recordMode === 'last' ? result.at(-1) : result[0]
        : result
    }
    const session = storedSession(source)
    if (source.requiresAuth && !session) return undefined
    const url = new URL(`${source.projectUrl.replace(/\/$/, '')}/rest/v1/${encodeURIComponent(source.table)}`)
    url.searchParams.set('select', '*')
    url.searchParams.set('limit', '1')
    if (selectedRecordId) url.searchParams.set('id', `eq.${selectedRecordId}`)
    if (!selectedRecordId && source.publishedOnly) url.searchParams.set('published', 'eq.true')
    if (!selectedRecordId) {
      url.searchParams.set('order', `${source.orderColumn ?? 'id'}.${recordMode === 'last' ? 'desc' : 'asc'}`)
    }
    const response = await runtimeWindow.fetch(url.href, { headers: {
      apikey: source.publishableKey,
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    } })
    if (!response.ok) return undefined
    const result = await response.json() as unknown
    return Array.isArray(result) ? result[0] : result
  }

  function parsedTemplate(value: unknown) {
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) as unknown : value
      if (!parsed || typeof parsed !== 'object') return undefined
      const record = parsed as Record<string, unknown>
      if (record.version !== 2) return undefined
      const frames = record.frames
      if (!Array.isArray(frames) || !frames.length) return undefined
      const landmarkFrames = Array.isArray(record.landmarkFrames)
        ? record.landmarkFrames.filter((frame): frame is RuntimeLandmarkFrame => Boolean(
            frame && typeof frame === 'object'
            && Number.isFinite((frame as RuntimeLandmarkFrame).t)
            && Number.isFinite((frame as RuntimeLandmarkFrame).width)
            && Number.isFinite((frame as RuntimeLandmarkFrame).height),
          ))
        : []
      const sourceSegment = record.sourceSegment && typeof record.sourceSegment === 'object'
        && Number.isFinite((record.sourceSegment as { startSeconds?: unknown }).startSeconds)
        && Number.isFinite((record.sourceSegment as { endSeconds?: unknown }).endSeconds)
        ? record.sourceSegment as { endSeconds: number; startSeconds: number }
        : undefined
      const sourceCrop = record.sourceCrop && typeof record.sourceCrop === 'object'
        && Number.isFinite((record.sourceCrop as { x?: unknown }).x)
        && Number.isFinite((record.sourceCrop as { y?: unknown }).y)
        && Number.isFinite((record.sourceCrop as { width?: unknown }).width)
        && Number.isFinite((record.sourceCrop as { height?: unknown }).height)
        ? record.sourceCrop as RuntimeSourceCrop
        : undefined
      const requiredHand = record.requiredHand === 'left'
        || record.requiredHand === 'right'
        || record.requiredHand === 'both'
        || record.requiredHand === 'either'
        ? record.requiredHand as RuntimeRequiredHand
        : 'either'
      const measurementModel = record.measurementModel === 'body-relative-v2'
        ? 'body-relative-v2' as const
        : undefined
      const stages: MotionStageDefinition[] = Array.isArray(record.stages)
        ? record.stages.filter((stage): stage is MotionStageDefinition => Boolean(
            stage && typeof stage === 'object'
            && typeof (stage as MotionStageDefinition).id === 'string'
            && typeof (stage as MotionStageDefinition).label === 'string'
            && Number.isFinite((stage as MotionStageDefinition).progress),
          )).map((stage) => ({
            id: stage.id,
            label: stage.label,
            progress: Math.max(0, Math.min(1, stage.progress)),
            scored: stage.scored !== false,
          })).sort((left, right) => left.progress - right.progress)
        : []
      return {
        durationMs: Number.isFinite(record.durationMs)
          ? Number(record.durationMs)
          : (frames as MotionFeatureFrame[]).at(-1)?.t ?? 0,
        frames: frames as MotionFeatureFrame[],
        landmarkFrames,
        measurementModel,
        requiredHand,
        sourceCrop,
        sourceSegment,
        storedClip: record.storedClip === true,
        storedClipDurationMs: Number.isFinite(record.storedClipDurationMs)
          ? Number(record.storedClipDurationMs)
          : undefined,
        stages,
        version: 2 as const,
      }
    } catch {
      return undefined
    }
  }

  function referenceStatus(value: unknown) {
    if (!value || typeof value !== 'object') return undefined
    const status = (value as { status?: unknown }).status
    return typeof status === 'string' ? status : undefined
  }

  function waitFor(element: HTMLMediaElement, eventName: string) {
    return new Promise<void>((resolve, reject) => {
      const done = () => {
        cleanup()
        resolve()
      }
      const fail = () => {
        cleanup()
        reject(new Error('No se pudo cargar el video de referencia.'))
      }
      const cleanup = () => {
        element.removeEventListener(eventName, done)
        element.removeEventListener('error', fail)
      }
      element.addEventListener(eventName, done, { once: true })
      element.addEventListener('error', fail, { once: true })
    })
  }

  async function seek(video: HTMLVideoElement, time: number) {
    if (Math.abs(video.currentTime - time) < 0.01) return
    const waiting = waitFor(video, 'seeked')
    video.currentTime = time
    await waiting
  }

  async function analyzeReferenceVideo(url: string, features: MotionActivity['features']) {
    const video = runtimeDocument.createElement('video')
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.src = url
    await waitFor(video, 'loadedmetadata')
    const duration = Math.min(Number.isFinite(video.duration) ? video.duration : 4, 8)
    const frames: MotionFeatureFrame[] = []
    const count = 16
    for (let index = 0; index < count; index += 1) {
      const time = duration * index / Math.max(1, count - 1)
      await seek(video, Math.min(time, Math.max(0, duration - 0.01)))
      frames.push(featureFrame(await detectFrame(video), time * 1_000, features))
    }
    video.removeAttribute('src')
    video.load()
    return addTrajectories(frames)
  }

  function templateFramesForCurrentMeasurements(
    template: NonNullable<ReturnType<typeof parsedTemplate>>,
    activity: MotionActivity,
  ) {
    if (template.measurementModel === 'body-relative-v2' || !template.landmarkFrames.length) {
      return template.frames
    }
    // Older references already contain the original landmarks. Rebuild their
    // feature vectors in memory so they receive the improved body-relative
    // measurements without requiring another recording or a database change.
    return template.landmarkFrames.map((frame) => featureFrame(frame, frame.t, activity.features))
  }

  async function referenceFrames(activity: MotionActivity) {
    if (activity.reference.type === 'none') {
      throw new Error('Selecciona una referencia en las propiedades del componente.')
    }
    if (activity.reference.type === 'data') {
      const record = await resolveDataRecord(
        activity.reference.dataSourceId,
        activity.reference.contextKey,
        activity.reference,
      )
      if (!record) {
        throw new Error(activity.reference.recordMode === 'context'
          ? 'Abre esta página desde una tarjeta para seleccionar la práctica.'
          : activity.reference.recordMode === 'specific'
            ? 'El registro específico no está disponible.'
            : 'La colección no contiene un registro visible.')
      }
      const storedReference = fieldValue(record, activity.reference.templateField)
      const template = parsedTemplate(storedReference)
      if (template) {
        const frames = templateFramesForCurrentMeasurements(template, activity)
        return {
          frames,
          requiredHand: template.requiredHand,
          stages: template.stages.length
            ? template.stages
            : runtimeHelpers.suggestMotionStages(frames),
        }
      }
      const video = fieldValue(record, activity.reference.videoField)
      const resolvedVideo = await resolvedMediaUrl(activity.reference.dataSourceId, video)
      if (!resolvedVideo) {
        const status = referenceStatus(storedReference)
        if (status === 'pending_capture' || status === 'ready') {
          throw new Error('Esta práctica todavía no tiene una captura MediaPipe utilizable. Crea y guarda una referencia con cuadros antes de publicarla.')
        }
        throw new Error('El registro no contiene una plantilla o un video de referencia válido.')
      }
      try {
        const frames = await analyzeReferenceVideo(resolvedVideo.url, activity.features)
        return { frames, requiredHand: 'either' as const, stages: runtimeHelpers.suggestMotionStages(frames) }
      } finally {
        if (resolvedVideo.revoke) URL.revokeObjectURL(resolvedVideo.url)
      }
    }
    if (activity.reference.type === 'template') {
      return {
        frames: activity.reference.template.frames,
        requiredHand: 'either' as const,
        stages: runtimeHelpers.suggestMotionStages(activity.reference.template.frames),
      }
    }
    if (activity.reference.url.toLowerCase().endsWith('.json')) {
      const response = await runtimeWindow.fetch(activity.reference.url)
      if (!response.ok) throw new Error('No se pudo cargar la plantilla de referencia.')
      const template = parsedTemplate(await response.json())
      if (template) {
        const frames = templateFramesForCurrentMeasurements(template, activity)
        return {
          frames,
          requiredHand: template.requiredHand,
          stages: template.stages.length
            ? template.stages
            : runtimeHelpers.suggestMotionStages(frames),
        }
      }
      throw new Error('La plantilla de referencia no contiene cuadros válidos.')
    }
    const frames = await analyzeReferenceVideo(activity.reference.url, activity.features)
    return { frames, requiredHand: 'either' as const, stages: runtimeHelpers.suggestMotionStages(frames) }
  }

  async function saveResult(
    activity: MotionActivity,
    result: ReturnType<typeof compareMotionSequences>,
    durationMs: number,
    landmarkFrames: RuntimeLandmarkFrame[],
    stageResults: MotionStageComparison[] = [],
  ) {
    if (!activity.persistence) return
    const source = runtimeConfig.dataSources?.find((candidate) => candidate.id === activity.persistence!.dataSourceId)
    if (!source || source.type !== 'supabase') throw new Error('La colección de resultados no está disponible.')
    const session = storedSession(source)
    if (source.requiresAuth && !session) throw new Error('Inicia sesión para guardar el resultado.')
    const relation = activeContext()[activity.persistence.contextKey]
    const row: Record<string, unknown> = {
      [activity.persistence.scoreField]: result.overallScore,
      [activity.persistence.feedbackField]: result.feedback,
      [activity.persistence.resultField]: {
        engine: 'mediapipe-holistic',
        templateVersion: 2,
        scores: result.scores,
        stages: stageResults,
        alignmentFrames: result.path.length,
        landmarkFrames,
      },
      [activity.persistence.durationField]: Math.round(durationMs / 1_000),
      ...(activity.persistence.relationField && relation
        ? { [activity.persistence.relationField]: relation.recordId }
        : {}),
      ...(source.requiresAuth && session?.user?.id ? { user_id: session.user.id } : {}),
    }
    const response = await runtimeWindow.fetch(
      `${source.projectUrl.replace(/\/$/, '')}/rest/v1/${encodeURIComponent(source.table)}`,
      {
        method: 'POST',
        headers: {
          apikey: source.publishableKey,
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(row),
      },
    )
    if (!response.ok) throw new Error('El resultado se calculó, pero no pudo guardarse.')
  }

  function scoreLabel(component: string) {
    const labels: Record<string, string> = {
      handShape: 'Forma de mano',
      location: 'Ubicación',
      orientation: 'Orientación',
      trajectory: 'Trayectoria',
      timing: 'Ritmo',
      facePosture: 'Rostro y postura',
    }
    return labels[component] ?? component
  }

  function findActivityRoot(activity: MotionActivity) {
    return [...runtimeDocument.querySelectorAll<HTMLElement>('[data-motion-activity]')]
      .find((element) => element.getAttribute('data-psl-element-id') === activity.elementId)
      ?? runtimeDocument.querySelectorAll<HTMLElement>('[data-motion-activity]')[
        runtimeConfig.activities.filter((candidate) => candidate.pageId === activity.pageId).indexOf(activity)
      ]
  }

  const disposers: Array<() => void> = []
  for (const activity of runtimeConfig.activities) {
    if (activity.pageId !== runtimeConfig.currentPage) continue
    const root = findActivityRoot(activity)
    if (!root) continue
    const button = root.querySelector<HTMLButtonElement>('[data-motion-start]')
    const stopButton = root.querySelector<HTMLButtonElement>('[data-motion-stop]')
    const replayButton = root.querySelector<HTMLButtonElement>('[data-motion-replay]')
    const videoSourceControls = root.querySelector<HTMLElement>('[data-motion-video-source]')
    const fileInput = root.querySelector<HTMLInputElement>('[data-motion-file]')
    const cropBox = root.querySelector<HTMLElement>('[data-motion-crop-box]')
    const cropEditButton = root.querySelector<HTMLButtonElement>('[data-motion-crop-edit]')
    const cropResetButton = root.querySelector<HTMLButtonElement>('[data-motion-crop-reset]')
    const segmentStart = root.querySelector<HTMLInputElement>('[data-motion-segment-start]')
    const segmentEnd = root.querySelector<HTMLInputElement>('[data-motion-segment-end]')
    const video = root.querySelector<HTMLVideoElement>('[data-motion-camera]')
    const motionInput = root.querySelector<HTMLElement>('[data-motion-part="input"]')
    const overlay = root.querySelector<HTMLCanvasElement>('[data-motion-overlay]')
    const placeholder = root.querySelector<HTMLElement>('[data-motion-placeholder]')
    const status = root.querySelector<HTMLElement>('[data-motion-status]')
    const results = root.querySelector<HTMLElement>('[data-motion-results]')
    const overall = root.querySelector<HTMLElement>('[data-motion-overall]')
    const scores = root.querySelector<HTMLElement>('[data-motion-scores]')
    const feedback = root.querySelector<HTMLElement>('[data-motion-feedback]')
    const stageResults = root.querySelector<HTMLElement>('[data-motion-stage-results]')
    const stageScores = root.querySelector<HTMLElement>('[data-motion-stage-scores]')
    const download = root.querySelector<HTMLAnchorElement>('[data-motion-download]')
    const storedTemplateField = activity.mode === 'reference'
      ? runtimeDocument.querySelector<HTMLInputElement>('[data-motion-template-field]')
      : undefined
    const requiredHandSelect = activity.mode === 'reference'
      ? root.closest<HTMLElement>('.movement-reference-required')
        ?.querySelector<HTMLSelectElement>('[data-motion-required-hand]')
      : undefined
    const sourceModeButtons = activity.mode === 'reference'
      ? [...root.closest<HTMLElement>('.movement-reference-required')
        ?.querySelectorAll<HTMLButtonElement>('[data-motion-source-mode]') ?? []]
      : []
    const existingSourceButton = sourceModeButtons.find((candidate) =>
      candidate.dataset.motionSourceMode === 'existing')
    const referenceSection = activity.mode === 'reference'
      ? root.closest<HTMLElement>('.movement-reference-required')
      : undefined
    const stageEditor = referenceSection?.querySelector<HTMLElement>('[data-motion-stage-editor]')
    const stageList = referenceSection?.querySelector<HTMLElement>('[data-motion-stage-list]')
    const stageAddButton = referenceSection?.querySelector<HTMLButtonElement>('[data-motion-stage-add]')
    const stageEditorStatus = referenceSection?.querySelector<HTMLElement>('[data-motion-stage-status]')
    const workspace = root.closest<HTMLElement>('[data-motion-workspace]')
    const referencePreview = workspace?.querySelector<HTMLCanvasElement>('[data-motion-reference-preview]')
    const referenceVideo = workspace?.querySelector<HTMLVideoElement>('[data-motion-reference-video]')
    const referenceEmpty = workspace?.querySelector<HTMLElement>('[data-motion-reference-empty]')
    const referenceReplay = workspace?.querySelector<HTMLButtonElement>('[data-motion-reference-replay]')
    const referencePreviewStatus = workspace?.querySelector<HTMLElement>('[data-motion-reference-status]')
    const comparisonContainer = activity.mode === 'compare' ? workspace?.parentElement : undefined
    const syncReplayButton = comparisonContainer?.querySelector<HTMLButtonElement>('[data-motion-sync-replay]')
    const syncReplayStatus = comparisonContainer?.querySelector<HTMLElement>('[data-motion-sync-status]')
    const resultsDock = comparisonContainer?.querySelector<HTMLElement>('[data-motion-results-dock]')
    if (!button || !video || !status || !results || !overall || !scores || !feedback) continue
    if (activity.mode === 'compare' && resultsDock) resultsDock.append(results)
    button.textContent = activity.mode === 'reference' ? 'Iniciar grabación'
      : activity.mode === 'analyze' ? 'Analizar movimiento' : 'Comenzar comparación'
    if (stopButton) stopButton.textContent = activity.mode === 'compare'
      ? 'Detener y comparar'
      : 'Detener y guardar'
    if (replayButton) replayButton.textContent = activity.mode === 'compare'
      ? 'Ver mi intento'
      : 'Reproducir referencia'
    if (videoSourceControls) videoSourceControls.hidden = activity.mode !== 'reference'
    status.textContent = activity.mode === 'compare' && activity.reference.type === 'none'
      ? 'Selecciona una referencia en Movimiento.'
      : 'Listo para comenzar.'

    let stream: MediaStream | undefined
    let downloadUrl: string | undefined
    let stopRequested = false
    let recordedLandmarkFrames: RuntimeLandmarkFrame[] = []
    let replayGeneration = 0
    let referenceReplayGeneration = 0
    let selectedVideoUrl: string | undefined
    let learnerRecordingUrl: string | undefined
    let previewTemplate: ReturnType<typeof parsedTemplate>
    let previewVideoUrl: string | undefined
    let previewVideoObjectUrl: string | undefined
    let manualCrop: RuntimeSourceCrop | undefined
    let cropping = false
    let cropStart: { x: number; y: number } | undefined
    let cropDraft: { height: number; width: number; x: number; y: number } | undefined
    let cropOrigin: { height: number; width: number; x: number; y: number } | undefined
    let cropInteraction: 'draw' | 'move' | 'top' | 'right' | 'bottom' | 'left' | undefined
    let editableStages: MotionStageDefinition[] = []
    let timelineCursorProgress = 0
    let referenceSourceMode: 'existing' | 'camera' | 'video' = 'camera'
    let displayedReferenceFrame: RuntimeLandmarkFrame | undefined
    const preparedClipInput = fileInput as (HTMLInputElement & {
      __motionReferenceClip?: File
    }) | null
    const referenceStage = referencePreview?.parentElement
    const syncReferencePresentation = () => {
      if (!referenceStage || !referencePreview) return
      const crop = previewTemplate?.storedClip ? undefined : previewTemplate?.sourceCrop
      const storedFrame = previewTemplate?.storedClip
        ? previewTemplate.landmarkFrames[0]
        : undefined
      const sourceWidth = storedFrame?.width
        || referenceVideo?.videoWidth
        || (crop ? undefined : previewTemplate?.landmarkFrames[0]?.width)
        || 16
      const sourceHeight = storedFrame?.height
        || referenceVideo?.videoHeight
        || (crop ? undefined : previewTemplate?.landmarkFrames[0]?.height)
        || 9

      // Stored clips and their landmarks were created from the same canvas, so
      // its frame dimensions are the authoritative presentation ratio. Using
      // media metadata here can turn a landscape analysis into a tall stage.
      if (sourceWidth > 0 && sourceHeight > 0) {
        referenceStage.style.aspectRatio = `${sourceWidth} / ${sourceHeight}`
      }
      referenceStage.style.width = '100%'
      referenceStage.style.height = 'auto'
      referenceStage.style.minHeight = '0'
      referenceStage.style.maxHeight = 'none'
      referenceStage.style.alignSelf = 'start'
      if (activity.componentType === 'reference-view') {
        root.style.height = 'auto'
        root.style.minHeight = '0'
        root.style.alignContent = 'start'
      }
      if (referenceVideo) {
        referenceVideo.style.objectFit = previewTemplate?.storedClip ? 'cover' : 'contain'
        referenceVideo.style.width = '100%'
        referenceVideo.style.height = '100%'
        referenceVideo.style.left = '0'
        referenceVideo.style.top = '0'
        referenceVideo.style.transformOrigin = '50% 50%'
      }

      // Landmark coordinates were captured relative to sourceCrop. Keep the
      // full video visible and place the overlay canvas over that rectangle.
      // Mirrored reference stages need the rectangle mirrored as well.
      if (crop && referenceVideo?.videoWidth) {
        const videoTransform = runtimeWindow.getComputedStyle(referenceVideo).transform
        const mirrored = videoTransform !== 'none'
          && (videoTransform.startsWith('matrix(-1,') || videoTransform.startsWith('matrix3d(-1,'))
        const cropLeft = mirrored ? 1 - crop.x - crop.width : crop.x
        referencePreview.style.left = `${cropLeft * 100}%`
        referencePreview.style.top = `${crop.y * 100}%`
        referencePreview.style.width = `${crop.width * 100}%`
        referencePreview.style.height = `${crop.height * 100}%`
      } else {
        referencePreview.style.left = '0'
        referencePreview.style.top = '0'
        referencePreview.style.width = '100%'
        referencePreview.style.height = '100%'
      }
      referencePreview.style.right = 'auto'
      referencePreview.style.bottom = 'auto'
    }
    const drawReferenceFrame = (frame: RuntimeLandmarkFrame) => {
      if (!referencePreview) return
      displayedReferenceFrame = frame
      syncReferencePresentation()
      drawHolisticOverlay(
        referencePreview,
        frame.width,
        frame.height,
        frame,
        activity.features,
      )
    }
    const redrawDisplayedReference = () => {
      const frame = displayedReferenceFrame
      if (!frame) return
      syncReferencePresentation()
      runtimeWindow.requestAnimationFrame(() => {
        if (displayedReferenceFrame === frame) drawReferenceFrame(frame)
      })
    }
    const ResizeObserverConstructor = (runtimeWindow as Window & {
      ResizeObserver?: typeof ResizeObserver
    }).ResizeObserver
    const referenceResizeObserver = referenceStage && typeof ResizeObserverConstructor === 'function'
      ? new ResizeObserverConstructor(redrawDisplayedReference)
      : undefined
    if (referenceStage) referenceResizeObserver?.observe(referenceStage)
    const selectedSourceCrop = () => manualCrop
    const applyVideoCrop = (element: HTMLVideoElement, crop?: RuntimeSourceCrop) => {
      if (!crop) {
        element.style.removeProperty('width')
        element.style.removeProperty('height')
        element.style.removeProperty('left')
        element.style.removeProperty('top')
        element.style.removeProperty('object-fit')
        element.style.removeProperty('transform-origin')
        return
      }
      element.style.objectFit = 'cover'
      // The enlarged video must mirror around the center of the selected crop,
      // which is the center of the visible frame. Mirroring around the center
      // of the full enlarged element shifts landmarks for off-center crops.
      element.style.transformOrigin = `${(crop.x + crop.width / 2) * 100}% 50%`
      element.style.width = `${100 / crop.width}%`
      element.style.height = `${100 / crop.height}%`
      element.style.left = `${-crop.x * 100 / crop.width}%`
      element.style.top = `${-crop.y * 100 / crop.height}%`
    }
    const persistStageDefinitions = (message: string) => {
      if (!storedTemplateField?.value.trim()) {
        if (stageEditorStatus) stageEditorStatus.textContent = 'Crea primero una referencia para definir sus etapas.'
        return
      }
      try {
        const existing = JSON.parse(storedTemplateField.value) as Record<string, unknown>
        existing.stages = editableStages
        storedTemplateField.value = JSON.stringify(existing)
        storedTemplateField.dispatchEvent(new Event('input', { bubbles: true }))
        storedTemplateField.dispatchEvent(new Event('change', { bubbles: true }))
        if (stageEditorStatus) stageEditorStatus.textContent = message
      } catch {
        if (stageEditorStatus) stageEditorStatus.textContent = 'No se pudieron actualizar las etapas.'
      }
    }
    const stageTemplate = () => storedTemplateField?.value.trim()
      ? parsedTemplate(storedTemplateField.value)
      : undefined
    const stageDurationMs = () => stageTemplate()?.durationMs ?? 0
    const stageTimeLabel = (progress: number) => {
      const seconds = stageDurationMs() * progress / 1_000
      return `${seconds.toFixed(1)} s`
    }
    const previewStageProgress = (progress: number) => {
      timelineCursorProgress = Math.max(0, Math.min(1, progress))
      const playhead = referenceSection?.querySelector<HTMLElement>('[data-motion-stage-playhead]')
      const fill = referenceSection?.querySelector<HTMLElement>('[data-motion-stage-fill]')
      if (playhead) playhead.style.left = `${timelineCursorProgress * 100}%`
      if (fill) fill.style.width = `${timelineCursorProgress * 100}%`
      const frameIndex = Math.round(
        timelineCursorProgress * Math.max(0, recordedLandmarkFrames.length - 1),
      )
      const frame = recordedLandmarkFrames[frameIndex]
      if (frame && overlay) {
        overlay.hidden = false
        drawHolisticOverlay(overlay, frame.width, frame.height, frame, activity.features)
        if (placeholder) placeholder.hidden = true
      }
      const template = stageTemplate()
      if (fileInput?.files?.[0] && selectedVideoUrl && Number.isFinite(video.duration)) {
        const start = template?.sourceSegment?.startSeconds
          ?? Number(segmentStart?.value ?? 0)
        const end = template?.sourceSegment?.endSeconds
          ?? Number(segmentEnd?.value ?? video.duration)
        video.pause()
        video.currentTime = Math.max(0, Math.min(
          video.duration,
          start + Math.max(0, end - start) * timelineCursorProgress,
        ))
        video.hidden = false
        applyVideoCrop(video, template?.sourceCrop ?? manualCrop)
      }
    }
    const renderStageEditor = (
      stages: MotionStageDefinition[],
      selectedStageId?: string,
    ) => {
      if (!stageEditor || !stageList) return
      editableStages = stages
        .map((stage) => ({
          id: stage.id,
          label: stage.label,
          progress: Math.max(0, Math.min(1, stage.progress)),
          scored: stage.scored !== false,
        }))
        .sort((left, right) => left.progress - right.progress)
      stageEditor.hidden = !editableStages.length
      if (!editableStages.length) {
        stageList.replaceChildren()
        return
      }
      const selected = editableStages.find((stage) => stage.id === selectedStageId)
        ?? editableStages.find((stage) => stage.progress >= timelineCursorProgress)
        ?? editableStages.at(-1)!
      const timeline = runtimeDocument.createElement('div')
      timeline.className = 'motion-stage-timeline is-video-overlay'
      timeline.dataset.motionStageOverlay = 'true'
      const rail = runtimeDocument.createElement('div')
      rail.className = 'motion-stage-timeline__rail'
      rail.setAttribute('aria-label', 'Línea de tiempo de la referencia')
      const fill = runtimeDocument.createElement('span')
      fill.className = 'motion-stage-timeline__fill'
      fill.dataset.motionStageFill = 'true'
      const playhead = runtimeDocument.createElement('span')
      playhead.className = 'motion-stage-timeline__playhead'
      playhead.dataset.motionStagePlayhead = 'true'
      rail.append(fill, playhead)
      const progressFromPointer = (clientX: number) => {
        const bounds = rail.getBoundingClientRect()
        return bounds.width
          ? Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width))
          : 0
      }
      rail.addEventListener('click', (event) => {
        if (event.target !== rail && event.target !== fill) return
        previewStageProgress(progressFromPointer(event.clientX))
      })
      editableStages.forEach((stage, index) => {
        const fixed = stage.id === 'start' || stage.id === 'end'
        const marker = runtimeDocument.createElement('button')
        marker.type = 'button'
        marker.className = `motion-stage-marker${fixed ? ' is-fixed' : ''}${stage.scored === false ? ' is-not-scored' : ''}`
        marker.style.left = `${stage.progress * 100}%`
        marker.dataset.motionStageId = stage.id
        marker.setAttribute('role', 'slider')
        marker.setAttribute('aria-label', `${stage.label}, ${stageTimeLabel(stage.progress)}`)
        marker.setAttribute('aria-valuemin', '0')
        marker.setAttribute('aria-valuemax', '100')
        marker.setAttribute('aria-valuenow', String(Math.round(stage.progress * 100)))
        const markerLabel = runtimeDocument.createElement('span')
        markerLabel.className = 'motion-stage-marker__label'
        markerLabel.textContent = stage.scored === false ? `${stage.label} · no cuenta` : stage.label
        marker.append(markerLabel)
        const updateStagePosition = (progress: number) => {
          if (fixed) return
          stage.progress = Number(Math.max(0, Math.min(1, progress)).toFixed(3))
          marker.style.left = `${stage.progress * 100}%`
          marker.setAttribute('aria-valuenow', String(Math.round(stage.progress * 100)))
          marker.setAttribute('aria-label', `${stage.label}, ${stageTimeLabel(stage.progress)}`)
          previewStageProgress(stage.progress)
          const inspectorTime = stageList.querySelector<HTMLOutputElement>('[data-motion-stage-time]')
          if (inspectorTime) inspectorTime.textContent = stageTimeLabel(stage.progress)
        }
        marker.addEventListener('click', (event) => {
          event.stopPropagation()
          previewStageProgress(stage.progress)
          renderStageEditor(editableStages, stage.id)
        })
        marker.addEventListener('pointerdown', (event) => {
          if (fixed) return
          event.preventDefault()
          marker.setPointerCapture(event.pointerId)
          updateStagePosition(progressFromPointer(event.clientX))
        })
        marker.addEventListener('pointermove', (event) => {
          if (!marker.hasPointerCapture(event.pointerId)) return
          updateStagePosition(progressFromPointer(event.clientX))
        })
        marker.addEventListener('pointerup', (event) => {
          if (!marker.hasPointerCapture(event.pointerId)) return
          marker.releasePointerCapture(event.pointerId)
          editableStages.sort((left, right) => left.progress - right.progress)
          persistStageDefinitions('Momento actualizado. Guarda la práctica para conservarlo.')
          renderStageEditor(editableStages, stage.id)
        })
        marker.addEventListener('keydown', (event) => {
          if (fixed || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return
          event.preventDefault()
          const direction = event.key === 'ArrowRight' ? 1 : -1
          updateStagePosition(stage.progress + direction * (event.shiftKey ? 0.05 : 0.01))
          persistStageDefinitions('Momento actualizado. Guarda la práctica para conservarlo.')
        })
        rail.append(marker)
        if (index === 0 && timelineCursorProgress === 0) previewStageProgress(stage.progress)
      })
      timeline.append(rail)
      const inspector = runtimeDocument.createElement('div')
      inspector.className = 'motion-stage-inspector'
      const labelField = runtimeDocument.createElement('label')
      labelField.setAttribute('aria-label', 'Momento seleccionado')
      const label = runtimeDocument.createElement('input')
      label.type = 'text'
      label.value = selected.label
      label.maxLength = 40
      label.setAttribute('aria-label', `Nombre de ${selected.label}`)
      label.addEventListener('change', () => {
        selected.label = label.value.trim() || 'Momento'
        persistStageDefinitions('Nombre actualizado. Guarda la práctica para conservarlo.')
        renderStageEditor(editableStages, selected.id)
      })
      labelField.append(label)
      const output = runtimeDocument.createElement('output')
      output.dataset.motionStageTime = 'true'
      output.textContent = stageTimeLabel(selected.progress)
      const remove = runtimeDocument.createElement('button')
      remove.type = 'button'
      remove.textContent = 'Quitar'
      remove.hidden = selected.id === 'start' || selected.id === 'end'
      remove.addEventListener('click', () => {
        editableStages = editableStages.filter((candidate) => candidate.id !== selected.id)
        persistStageDefinitions('Momento eliminado. Guarda la práctica para conservar el cambio.')
        renderStageEditor(editableStages)
      })
      const scoreToggle = runtimeDocument.createElement('label')
      scoreToggle.className = 'motion-stage-score-toggle'
      scoreToggle.hidden = selected.id !== 'start' && selected.id !== 'end'
      const scoreCheckbox = runtimeDocument.createElement('input')
      scoreCheckbox.type = 'checkbox'
      scoreCheckbox.checked = selected.scored !== false
      const scoreToggleText = runtimeDocument.createElement('span')
      scoreToggleText.textContent = 'Contar en puntuación'
      scoreCheckbox.addEventListener('change', () => {
        selected.scored = scoreCheckbox.checked
        persistStageDefinitions(scoreCheckbox.checked
          ? `${selected.label} contará en la puntuación.`
          : `${selected.label} no contará en la puntuación.`)
        renderStageEditor(editableStages, selected.id)
      })
      scoreToggle.append(scoreCheckbox, scoreToggleText)
      inspector.append(labelField, output, scoreToggle, remove)
      motionInput?.querySelector('[data-motion-stage-overlay]')?.remove()
      motionInput?.append(timeline)
      stageList.replaceChildren(inspector)
      previewStageProgress(timelineCursorProgress)
    }
    const addStage = () => {
      if (!editableStages.length) {
        if (stageEditorStatus) stageEditorStatus.textContent = 'Crea primero una referencia.'
        return
      }
      const ordered = editableStages.slice().sort((left, right) => left.progress - right.progress)
      let gapStart = ordered[0]?.progress ?? 0
      let gapEnd = ordered[1]?.progress ?? 1
      for (let index = 1; index < ordered.length; index += 1) {
        const currentGap = ordered[index].progress - ordered[index - 1].progress
        if (currentGap > gapEnd - gapStart) {
          gapStart = ordered[index - 1].progress
          gapEnd = ordered[index].progress
        }
      }
      let selectedProgress = timelineCursorProgress
      if (editableStages.some((stage) => Math.abs(stage.progress - selectedProgress) < 0.03)) {
        selectedProgress = (gapStart + gapEnd) / 2
      }
      const stage = {
        id: `key-${Date.now()}`,
        label: `Momento clave ${editableStages.length - 1}`,
        progress: Number(selectedProgress.toFixed(3)),
      }
      editableStages.push(stage)
      editableStages.sort((left, right) => left.progress - right.progress)
      persistStageDefinitions('Momento agregado. Muévelo hasta la posición adecuada y guarda la práctica.')
      renderStageEditor(editableStages, stage.id)
    }
    const invalidateReferenceAnalysis = () => {
      if (preparedClipInput) preparedClipInput.__motionReferenceClip = undefined
      if (storedTemplateField) {
        storedTemplateField.value = ''
        storedTemplateField.dispatchEvent(new Event('input', { bubbles: true }))
      }
      if (replayButton) replayButton.hidden = true
      if (stageEditor) stageEditor.hidden = true
      if (stageList) stageList.replaceChildren()
      motionInput?.querySelector('[data-motion-stage-overlay]')?.remove()
      editableStages = []
      results.hidden = true
    }
    const containedVideoBounds = () => {
      if (!motionInput) return undefined
      const container = motionInput.getBoundingClientRect()
      const sourceWidth = video.videoWidth || container.width
      const sourceHeight = video.videoHeight || container.height
      if (!container.width || !container.height || !sourceWidth || !sourceHeight) return undefined
      const scale = Math.min(container.width / sourceWidth, container.height / sourceHeight)
      const width = sourceWidth * scale
      const height = sourceHeight * scale
      return { x: (container.width - width) / 2, y: (container.height - height) / 2, width, height }
    }
    const renderCropBox = (rectangle?: { height: number; width: number; x: number; y: number }) => {
      if (!cropBox || !rectangle) return
      cropBox.hidden = false
      cropBox.style.left = `${rectangle.x}px`
      cropBox.style.top = `${rectangle.y}px`
      cropBox.style.width = `${rectangle.width}px`
      cropBox.style.height = `${rectangle.height}px`
    }
    const renderStoredCropBox = () => {
      const bounds = containedVideoBounds()
      if (!bounds || !manualCrop) {
        if (cropBox) cropBox.hidden = true
        return
      }
      renderCropBox({
        x: bounds.x + manualCrop.x * bounds.width,
        y: bounds.y + manualCrop.y * bounds.height,
        width: manualCrop.width * bounds.width,
        height: manualCrop.height * bounds.height,
      })
    }
    const cropPoint = (event: PointerEvent) => {
      if (!motionInput) return undefined
      const container = motionInput.getBoundingClientRect()
      const bounds = containedVideoBounds()
      if (!bounds) return undefined
      return {
        bounds,
        x: Math.max(bounds.x, Math.min(bounds.x + bounds.width, event.clientX - container.left)),
        y: Math.max(bounds.y, Math.min(bounds.y + bounds.height, event.clientY - container.top)),
      }
    }
    const storedCropRectangle = () => {
      const bounds = containedVideoBounds()
      if (!bounds || !manualCrop) return undefined
      return {
        x: bounds.x + manualCrop.x * bounds.width,
        y: bounds.y + manualCrop.y * bounds.height,
        width: manualCrop.width * bounds.width,
        height: manualCrop.height * bounds.height,
      }
    }
    const beginCrop = (event: PointerEvent) => {
      if (!cropping) return
      const point = cropPoint(event)
      if (!point) return
      event.preventDefault()
      cropStart = { x: point.x, y: point.y }
      const target = event.target as HTMLElement
      const handle = target.closest<HTMLElement>('[data-motion-crop-handle]')
      const rectangle = storedCropRectangle()
      if (handle && rectangle) {
        cropInteraction = handle.dataset.motionCropHandle as typeof cropInteraction
        cropOrigin = rectangle
        cropDraft = rectangle
      } else if (cropBox?.contains(target) && rectangle) {
        cropInteraction = 'move'
        cropOrigin = rectangle
        cropDraft = rectangle
      } else {
        cropInteraction = 'draw'
        cropOrigin = undefined
        cropDraft = undefined
        if (cropBox) cropBox.hidden = true
      }
      motionInput?.setPointerCapture?.(event.pointerId)
    }
    const updateCrop = (event: PointerEvent) => {
      if (!cropping || !cropStart || !cropInteraction) return
      const point = cropPoint(event)
      if (!point) return
      event.preventDefault()
      const bounds = point.bounds
      const minimumWidth = Math.min(24, bounds.width)
      const minimumHeight = Math.min(14, bounds.height)
      const initial = cropOrigin
      if (cropInteraction === 'draw' || !initial) {
        cropDraft = {
          x: Math.min(cropStart.x, point.x),
          y: Math.min(cropStart.y, point.y),
          width: Math.abs(point.x - cropStart.x),
          height: Math.abs(point.y - cropStart.y),
        }
      } else if (cropInteraction === 'move') {
        cropDraft = {
          ...initial,
          x: Math.max(bounds.x, Math.min(bounds.x + bounds.width - initial.width,
            initial.x + point.x - cropStart.x)),
          y: Math.max(bounds.y, Math.min(bounds.y + bounds.height - initial.height,
            initial.y + point.y - cropStart.y)),
        }
      } else if (cropInteraction === 'left') {
        const right = initial.x + initial.width
        const left = Math.max(bounds.x, Math.min(right - minimumWidth, point.x))
        cropDraft = { ...initial, x: left, width: right - left }
      } else if (cropInteraction === 'right') {
        const right = Math.max(initial.x + minimumWidth,
          Math.min(bounds.x + bounds.width, point.x))
        cropDraft = { ...initial, width: right - initial.x }
      } else if (cropInteraction === 'top') {
        const bottom = initial.y + initial.height
        const top = Math.max(bounds.y, Math.min(bottom - minimumHeight, point.y))
        cropDraft = { ...initial, y: top, height: bottom - top }
      } else {
        const bottom = Math.max(initial.y + minimumHeight,
          Math.min(bounds.y + bounds.height, point.y))
        cropDraft = { ...initial, height: bottom - initial.y }
      }
      renderCropBox(cropDraft)
    }
    const finishCrop = (event: PointerEvent) => {
      if (!cropping || !cropStart || !cropInteraction) return
      updateCrop(event)
      const bounds = containedVideoBounds()
      const draft = cropDraft
      cropStart = undefined
      cropOrigin = undefined
      cropInteraction = undefined
      cropDraft = undefined
      if (!bounds || !draft || draft.width < 24 || draft.height < 14) {
        status.textContent = 'Arrastra un área más grande sobre el video.'
        renderStoredCropBox()
        return
      }
      manualCrop = {
        x: Math.max(0, Math.min(1, (draft.x - bounds.x) / bounds.width)),
        y: Math.max(0, Math.min(1, (draft.y - bounds.y) / bounds.height)),
        width: Math.min(1, draft.width / bounds.width),
        height: Math.min(1, draft.height / bounds.height),
      }
      invalidateReferenceAnalysis()
      renderStoredCropBox()
      status.textContent = 'Área lista. Puedes moverla o ajustar cada borde; después analiza el tramo.'
    }
    const editCrop = () => {
      if (!fileInput?.files?.[0]) {
        status.textContent = 'Selecciona primero un video de referencia.'
        return
      }
      cropping = true
      cropStart = undefined
      cropOrigin = undefined
      cropInteraction = undefined
      applyVideoCrop(video)
      video.style.objectFit = 'contain'
      motionInput?.classList.add('is-cropping')
      renderStoredCropBox()
      status.textContent = manualCrop
        ? 'Mueve el área completa o arrastra cualquiera de sus cuatro bordes.'
        : 'Arrastra sobre el video para crear el área que se utilizará.'
    }
    const resetCrop = () => {
      if (!fileInput?.files?.[0]) return
      manualCrop = undefined
      cropping = false
      cropStart = undefined
      cropOrigin = undefined
      cropInteraction = undefined
      motionInput?.classList.remove('is-cropping')
      if (cropBox) cropBox.hidden = true
      applyVideoCrop(video)
      invalidateReferenceAnalysis()
      status.textContent = 'Se utilizará el video completo. Analiza nuevamente el tramo.'
    }
    const loadExistingTemplate = () => {
      if (!storedTemplateField?.value.trim() || activity.mode !== 'reference') return
      const existing = parsedTemplate(storedTemplateField.value)
      if (!existing?.landmarkFrames.length) return
      if (requiredHandSelect) requiredHandSelect.value = existing.requiredHand
      renderStageEditor(existing.stages.length
        ? existing.stages
        : runtimeHelpers.suggestMotionStages(existing.frames))
      manualCrop = existing.sourceCrop
      recordedLandmarkFrames = existing.landmarkFrames
      const firstFrame = recordedLandmarkFrames[0]
      video.hidden = true
      if (overlay) {
        overlay.hidden = false
        drawHolisticOverlay(overlay, firstFrame.width, firstFrame.height, firstFrame, activity.features)
      }
      if (placeholder) placeholder.hidden = true
      if (replayButton) replayButton.hidden = false
      existingSourceButton?.removeAttribute('hidden')
      setReferenceSourceMode('existing')
    }
    const updateRequiredHand = () => {
      if (!storedTemplateField?.value.trim() || !requiredHandSelect) return
      try {
        const existing = JSON.parse(storedTemplateField.value) as Record<string, unknown>
        existing.requiredHand = requiredHandSelect.value
        storedTemplateField.value = JSON.stringify(existing)
        storedTemplateField.dispatchEvent(new Event('input', { bubbles: true }))
        storedTemplateField.dispatchEvent(new Event('change', { bubbles: true }))
        status.textContent = 'Regla de mano actualizada. Guarda la práctica para conservarla.'
      } catch {
        status.textContent = 'Graba la referencia para guardar la regla de mano seleccionada.'
      }
    }
    const stopStream = () => {
      stream?.getTracks().forEach((track) => track.stop())
      stream = undefined
      video.srcObject = null
    }
    const captureVideo = async (
      source: HTMLVideoElement,
      durationMs: number,
      manualStop = false,
    ) => {
      if (source.paused) await source.play().catch(() => undefined)
      const startedAt = performance.now()
      const frames: MotionFeatureFrame[] = []
      const landmarkFrames: RuntimeLandmarkFrame[] = []
      let displayedSecond = -1
      while (performance.now() - startedAt < durationMs && !(manualStop && stopRequested)) {
        const elapsed = performance.now() - startedAt
        const displayedTime = manualStop
          ? Math.floor(elapsed / 1_000)
          : Math.max(1, Math.ceil((durationMs - elapsed) / 1_000))
        if (displayedTime !== displayedSecond) {
          displayedSecond = displayedTime
          status.textContent = `Grabando movimiento… ${displayedTime} s`
        }
        const result = await detectFrame(source)
        if (overlay) {
          overlay.hidden = false
          drawHolisticOverlay(
            overlay,
            source.videoWidth || 640,
            source.videoHeight || 480,
            result,
            activity.features,
          )
        }
        frames.push(featureFrame(result, elapsed, activity.features))
        landmarkFrames.push(replayLandmarkFrame(result, source, elapsed))
        await new Promise((resolve) => runtimeWindow.setTimeout(resolve, 60))
      }
      return {
        durationMs: Math.min(durationMs, performance.now() - startedAt),
        frames,
        landmarkFrames,
        sourceCrop: undefined,
        sourceSegment: undefined,
      }
    }
    const analyzeSelectedVideo = async (source: HTMLVideoElement) => {
      if (source.readyState < 2) await waitFor(source, 'loadeddata')
      const duration = Number.isFinite(source.duration) ? source.duration : 0
      const requestedStart = Number(segmentStart?.value ?? 0)
      const requestedEnd = Number(segmentEnd?.value ?? duration)
      const startSeconds = Math.max(0, Math.min(requestedStart, Math.max(0, duration - 0.1)))
      const endSeconds = Math.max(
        startSeconds + 0.1,
        Math.min(requestedEnd, duration || requestedEnd),
      )
      if (!duration || endSeconds <= startSeconds) {
        throw new Error('Elige un tramo válido del video.')
      }
      const segmentDuration = endSeconds - startSeconds
      const sampleCount = Math.max(8, Math.min(48, Math.ceil(segmentDuration * 6)))
      const crop = selectedSourceCrop()
      const frames: MotionFeatureFrame[] = []
      const landmarkFrames: RuntimeLandmarkFrame[] = []
      video.hidden = false
      applyVideoCrop(video, crop)
      if (placeholder) placeholder.hidden = true
      for (let index = 0; index < sampleCount; index += 1) {
        const progress = index / Math.max(1, sampleCount - 1)
        const sourceTime = startSeconds + segmentDuration * progress
        const elapsed = segmentDuration * progress * 1_000
        status.textContent = `Analizando video… ${Math.round(progress * 100)}%`
        await seek(source, Math.min(sourceTime, Math.max(0, duration - 0.01)))
        const result = await detectFrame(source, crop)
        if (overlay) {
          overlay.hidden = false
          drawHolisticOverlay(
            overlay,
            crop ? (source.videoWidth || 640) * crop.width : source.videoWidth || 640,
            crop ? (source.videoHeight || 480) * crop.height : source.videoHeight || 480,
            result,
            activity.features,
            crop ? 'cover' : 'contain',
          )
        }
        frames.push(featureFrame(result, elapsed, activity.features))
        landmarkFrames.push(replayLandmarkFrame(result, source, elapsed, crop))
      }
      return {
        durationMs: segmentDuration * 1_000,
        frames,
        landmarkFrames,
        sourceCrop: crop,
        sourceSegment: { endSeconds, startSeconds },
      }
    }
    const createSelectedVideoClip = async (
      source: HTMLVideoElement,
      crop: RuntimeSourceCrop | undefined,
      segment: { endSeconds: number; startSeconds: number },
    ) => {
      const MediaRecorderConstructor = (runtimeWindow as Window & {
        MediaRecorder?: typeof MediaRecorder
      }).MediaRecorder
      if (typeof MediaRecorderConstructor !== 'function') {
        throw new Error('Este navegador no puede preparar el tramo de video. Usa una versión reciente de Chrome.')
      }
      if (source.readyState < 2) await waitFor(source, 'loadeddata')
      const canvas = runtimeDocument.createElement('canvas')
      const sourceX = Math.round((source.videoWidth || 640) * (crop?.x ?? 0))
      const sourceY = Math.round((source.videoHeight || 480) * (crop?.y ?? 0))
      const sourceWidth = Math.max(2, Math.round((source.videoWidth || 640) * (crop?.width ?? 1)))
      const sourceHeight = Math.max(2, Math.round((source.videoHeight || 480) * (crop?.height ?? 1)))
      const outputScale = Math.min(1, 960 / sourceWidth)
      canvas.width = Math.max(2, Math.round(sourceWidth * outputScale / 2) * 2)
      canvas.height = Math.max(2, Math.round(sourceHeight * outputScale / 2) * 2)
      const context = canvas.getContext('2d')
      if (!context || typeof canvas.captureStream !== 'function') {
        throw new Error('Este navegador no puede recortar el video seleccionado.')
      }
      const mimeType = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
      ].find((candidate) => MediaRecorderConstructor.isTypeSupported?.(candidate)) ?? 'video/webm'
      const outputStream = canvas.captureStream(30)
      const recorder = new MediaRecorderConstructor(outputStream, {
        mimeType,
        videoBitsPerSecond: 2_000_000,
      })
      const chunks: Blob[] = []
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size) chunks.push(event.data)
      })
      const stopped = new Promise<void>((resolve, reject) => {
        recorder.addEventListener('stop', () => resolve(), { once: true })
        recorder.addEventListener('error', () => reject(new Error('No se pudo preparar el tramo de video.')), { once: true })
      })
      const drawFrame = () => context.drawImage(
        source,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        canvas.width,
        canvas.height,
      )
      try {
        source.pause()
        await seek(source, segment.startSeconds)
        drawFrame()
        recorder.start(250)
        await source.play()
        await new Promise<void>((resolve) => {
          const render = () => {
            drawFrame()
            if (source.currentTime >= segment.endSeconds || source.ended) {
              resolve()
              return
            }
            runtimeWindow.requestAnimationFrame(render)
          }
          runtimeWindow.requestAnimationFrame(render)
        })
        source.pause()
        if (recorder.state !== 'inactive') recorder.stop()
        await stopped
      } finally {
        source.pause()
        outputStream.getTracks().forEach((track) => track.stop())
      }
      if (!chunks.length) throw new Error('No se pudo crear el tramo recortado del video.')
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType })
      return new File([blob], 'reference-clip.webm', { type: blob.type || 'video/webm' })
    }
    const loadReferencePreview = async () => {
      if (!referencePreview || !referencePreviewStatus || (activity.mode !== 'compare' && activity.componentType !== 'reference-view')) return
      try {
        if (activity.reference.type === 'data') {
          const record = await resolveDataRecord(
            activity.reference.dataSourceId,
            activity.reference.contextKey,
            activity.reference,
          )
          if (!record) {
            throw new Error(activity.reference.recordMode === 'context'
              ? 'Abre esta página desde una tarjeta para seleccionar la práctica.'
              : 'No se encontró el registro configurado.')
          }
          previewTemplate = parsedTemplate(fieldValue(record, activity.reference.templateField))
          const media = fieldValue(record, activity.reference.videoField)
          const resolvedVideo = await resolvedMediaUrl(activity.reference.dataSourceId, media)
          previewVideoUrl = resolvedVideo?.url
          previewVideoObjectUrl = resolvedVideo?.revoke ? resolvedVideo.url : undefined
        } else if (activity.reference.type === 'template') {
          previewTemplate = {
            ...activity.reference.template,
            landmarkFrames: [],
            measurementModel: undefined,
            requiredHand: 'either',
            sourceCrop: undefined,
            sourceSegment: undefined,
            storedClip: false,
            storedClipDurationMs: undefined,
            stages: runtimeHelpers.suggestMotionStages(activity.reference.template.frames)
              .map((stage) => ({ ...stage, scored: stage.scored !== false })),
          }
        } else if (activity.reference.type === 'url') {
          if (activity.reference.url.toLowerCase().endsWith('.json')) {
            const response = await runtimeWindow.fetch(activity.reference.url)
            if (!response.ok) throw new Error('No se pudo cargar la plantilla de referencia.')
            previewTemplate = parsedTemplate(await response.json())
          } else {
            previewVideoUrl = activity.reference.url
          }
        }
        if (referenceVideo && previewVideoUrl) {
          referenceVideo.src = previewVideoUrl
          referenceVideo.hidden = false
          syncReferencePresentation()
        }
        if (!previewTemplate?.landmarkFrames.length) {
          referencePreviewStatus.textContent = previewVideoUrl
            ? 'Video de referencia listo. Esta fuente no incluye puntos guardados.'
            : 'La práctica no tiene una reproducción visual guardada.'
          if (referenceEmpty) {
            referenceEmpty.hidden = Boolean(previewVideoUrl)
            referenceEmpty.textContent = 'Referencia visual no disponible.'
          }
          if (referenceReplay) referenceReplay.disabled = !previewVideoUrl
          return
        }
        const firstFrame = previewTemplate.landmarkFrames[0]
        syncReferencePresentation()
        referencePreview.hidden = false
        drawReferenceFrame(firstFrame)
        if (referenceEmpty) referenceEmpty.hidden = true
        if (referenceReplay) referenceReplay.disabled = false
        const segment = previewTemplate.sourceSegment
          ? ` · ${previewTemplate.sourceSegment.startSeconds.toFixed(1)}–${previewTemplate.sourceSegment.endSeconds.toFixed(1)} s`
          : ''
        referencePreviewStatus.textContent = previewVideoUrl
          ? `Video y puntos listos${segment}.`
          : `Puntos de referencia listos${segment}. El video original no está guardado.`
      } catch (error) {
        referencePreviewStatus.textContent = error instanceof Error
          ? error.message
          : 'No se pudo cargar la referencia de esta práctica.'
        if (referenceEmpty) referenceEmpty.textContent = 'Referencia no disponible.'
      }
    }
    const landmarkRange = (frames: RuntimeLandmarkFrame[], range: [number, number] = [0, 1]) => {
      if (!frames.length) return []
      const start = Math.max(0, Math.min(1, range[0]))
      const end = Math.max(start, Math.min(1, range[1]))
      const startIndex = Math.floor(start * Math.max(0, frames.length - 1))
      const endIndex = Math.ceil(end * Math.max(0, frames.length - 1))
      return frames.slice(startIndex, endIndex + 1)
    }
    const replayStoredReference = async (range: [number, number] = [0, 1]) => {
      if (!referencePreview || !referenceReplay) return
      if (!previewTemplate?.landmarkFrames.length && referenceVideo && previewVideoUrl) {
        referenceReplay.disabled = true
        referencePreviewStatus!.textContent = 'Reproduciendo video de referencia…'
        try {
          referenceVideo.currentTime = 0
          await referenceVideo.play()
        } catch {
          referencePreviewStatus!.textContent = 'No se pudo reproducir el video de referencia.'
        } finally {
          referenceReplay.disabled = false
        }
        return
      }
      if (!previewTemplate?.landmarkFrames.length) return
      const replayFrames = landmarkRange(previewTemplate.landmarkFrames, range)
      if (!replayFrames.length) return
      const generation = ++referenceReplayGeneration
      referenceReplay.disabled = true
      if (referenceEmpty) referenceEmpty.hidden = true
      referencePreviewStatus!.textContent = 'Reproduciendo referencia…'
      try {
        if (referenceVideo && previewVideoUrl) {
          if (referenceVideo.readyState < 1) await waitFor(referenceVideo, 'loadedmetadata')
          const segmentStartTime = previewTemplate.storedClip
            ? 0
            : previewTemplate.sourceSegment?.startSeconds ?? 0
          const segmentEndTime = previewTemplate.storedClip
            ? (Number.isFinite(referenceVideo.duration) ? referenceVideo.duration : segmentStartTime)
            : previewTemplate.sourceSegment?.endSeconds
            ?? (Number.isFinite(referenceVideo.duration) ? referenceVideo.duration : segmentStartTime)
          await seek(referenceVideo, segmentStartTime + (segmentEndTime - segmentStartTime) * range[0])
          await referenceVideo.play()
        }
        let previousTime = replayFrames[0].t
        for (const frame of replayFrames) {
          if (generation !== referenceReplayGeneration) return
          const delay = Math.max(0, Math.min(500, frame.t - previousTime))
          if (delay) await new Promise((resolve) => runtimeWindow.setTimeout(resolve, delay))
          if (generation !== referenceReplayGeneration) return
          drawReferenceFrame(frame)
          previousTime = frame.t
        }
        referenceVideo?.pause()
        referencePreviewStatus!.textContent = 'Referencia terminada. Puedes reproducirla nuevamente.'
      } catch {
        referencePreviewStatus!.textContent = 'No se pudo reproducir el video; los puntos siguen disponibles.'
      } finally {
        if (generation === referenceReplayGeneration) referenceReplay.disabled = false
      }
    }
    const captureInput = async () => {
      if (fileInput?.files?.[0] && selectedVideoUrl) {
        motionInput?.classList.remove('is-mirrored')
        if (stopButton) stopButton.hidden = true
        return analyzeSelectedVideo(video)
      }
      if (activity.input.type === 'url') {
        motionInput?.classList.remove('is-mirrored')
        video.src = activity.input.url
        video.hidden = false
        if (placeholder) placeholder.hidden = true
        const frames = await analyzeReferenceVideo(activity.input.url, activity.features)
        return {
          durationMs: frames.at(-1)?.t ?? 0,
          frames,
          landmarkFrames: [],
          sourceCrop: undefined,
          sourceSegment: undefined,
        }
      }
      if (activity.input.type === 'element') {
        motionInput?.classList.remove('is-mirrored')
        const source = runtimeDocument.querySelector<HTMLVideoElement>(activity.input.selector)
        if (!source) throw new Error('No se encontró el video configurado como entrada.')
        if (placeholder) placeholder.hidden = true
        return captureVideo(source, activity.input.durationMs)
      }
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: activity.input.facingMode }, audio: false,
      })
      motionInput?.classList.toggle('is-mirrored', activity.input.facingMode === 'user')
      video.srcObject = stream
      await video.play()
      video.hidden = false
      if (placeholder) placeholder.hidden = true
      status.textContent = 'Prepárate…'
      await new Promise((resolve) => runtimeWindow.setTimeout(resolve, 1_000))
      const manualStop = activity.mode === 'reference' || activity.mode === 'compare'
      if (manualStop && stopButton) {
        stopButton.hidden = false
        stopButton.disabled = false
      }
      let recorder: MediaRecorder | undefined
      const recordedChunks: Blob[] = []
      let recorderStopped: Promise<void> | undefined
      const MediaRecorderConstructor = (runtimeWindow as Window & {
        MediaRecorder?: typeof MediaRecorder
      }).MediaRecorder
      if (activity.mode === 'compare' && typeof MediaRecorderConstructor === 'function') {
        try {
          const activeRecorder = new MediaRecorderConstructor(stream)
          recorder = activeRecorder
          activeRecorder.addEventListener('dataavailable', (event) => {
            if (event.data.size) recordedChunks.push(event.data)
          })
          recorderStopped = new Promise((resolve) => {
            activeRecorder.addEventListener('stop', () => resolve(), { once: true })
          })
          activeRecorder.start(250)
        } catch {
          recorder = undefined
          recorderStopped = undefined
        }
      }
      const captured = await captureVideo(video, activity.input.durationMs, manualStop)
      if (recorder?.state === 'recording') {
        recorder.stop()
        await recorderStopped
      }
      if (recordedChunks.length) {
        if (learnerRecordingUrl) URL.revokeObjectURL(learnerRecordingUrl)
        learnerRecordingUrl = URL.createObjectURL(new Blob(recordedChunks, {
          type: recorder?.mimeType || recordedChunks[0].type || 'video/webm',
        }))
      }
      return captured
    }
    const replay = async (range: [number, number] = [0, 1]) => {
      if (!overlay || !recordedLandmarkFrames.length || !replayButton) return
      const replayFrames = landmarkRange(recordedLandmarkFrames, range)
      if (!replayFrames.length) return
      const generation = ++replayGeneration
      button.disabled = true
      replayButton.disabled = true
      video.hidden = true
      overlay.hidden = false
      if (placeholder) placeholder.hidden = true
      status.textContent = activity.mode === 'compare'
        ? 'Reproduciendo tu intento…'
        : 'Reproduciendo referencia…'
      if (activity.mode === 'compare' && learnerRecordingUrl) {
        video.srcObject = null
        video.src = learnerRecordingUrl
        video.muted = true
        video.hidden = false
        if (video.readyState < 1) await waitFor(video, 'loadedmetadata')
        await seek(video, (Number.isFinite(video.duration) ? video.duration : 0) * range[0])
        await video.play().catch(() => undefined)
      }
      let previousTime = replayFrames[0].t
      for (const frame of replayFrames) {
        if (generation !== replayGeneration) return
        const delay = Math.max(0, Math.min(500, frame.t - previousTime))
        if (delay) await new Promise((resolve) => runtimeWindow.setTimeout(resolve, delay))
        if (generation !== replayGeneration) return
        drawHolisticOverlay(
          overlay,
          frame.width,
          frame.height,
          frame,
          activity.features,
        )
        previousTime = frame.t
      }
      video.pause()
      button.disabled = false
      replayButton.disabled = false
      status.textContent = activity.mode === 'compare'
        ? 'Recapitulación terminada. El video permanece solamente en esta pestaña.'
        : 'Reproducción terminada.'
    }
    const replayTogether = async (
      referenceRange: [number, number] = [0, 1],
      learnerRange: [number, number] = [0, 1],
    ) => {
      if (
        !syncReplayButton
        || !previewTemplate?.landmarkFrames.length
        || !recordedLandmarkFrames.length
      ) return
      syncReplayButton.disabled = true
      if (syncReplayStatus) syncReplayStatus.textContent = 'Reproduciendo la referencia y tu intento al mismo tiempo…'
      try {
        await Promise.all([replayStoredReference(referenceRange), replay(learnerRange)])
        if (syncReplayStatus) syncReplayStatus.textContent = 'Comparación terminada. Puedes reproducir ambas vistas nuevamente.'
      } finally {
        syncReplayButton.disabled = false
      }
    }
    const renderStageComparisons = (comparisons: MotionStageComparison[]) => {
      if (!stageResults || !stageScores) return
      stageResults.hidden = !comparisons.length
      stageScores.replaceChildren(...comparisons.map((stage) => {
        const item = runtimeDocument.createElement('article')
        item.className = 'motion-stage-result'
        const label = runtimeDocument.createElement('span')
        label.textContent = stage.label
        const score = runtimeDocument.createElement('strong')
        score.textContent = stage.scored === false ? 'No cuenta' : `${stage.score}%`
        if (stage.scored === false) item.classList.add('is-not-scored')
        const replayStage = runtimeDocument.createElement('button')
        replayStage.type = 'button'
        replayStage.textContent = 'Reproducir esta etapa'
        replayStage.addEventListener('click', () => {
          void replayTogether(stage.referenceRange, stage.learnerRange)
        })
        item.append(label, score, replayStage)
        return item
      }))
    }
    const selectVideoFile = async () => {
      if (selectedVideoUrl) URL.revokeObjectURL(selectedVideoUrl)
      selectedVideoUrl = undefined
      const file = fileInput?.files?.[0]
      if (!file) {
        video.removeAttribute('src')
        video.load()
        video.hidden = true
        if (placeholder) placeholder.hidden = false
        button.textContent = 'Iniciar grabación'
        motionInput?.classList.toggle(
          'is-mirrored',
          activity.input.type === 'camera' && activity.input.facingMode === 'user',
        )
        setReferenceSourceMode('video')
        return
      }
      selectedVideoUrl = URL.createObjectURL(file)
      manualCrop = undefined
      cropping = false
      cropStart = undefined
      cropDraft = undefined
      cropOrigin = undefined
      cropInteraction = undefined
      motionInput?.classList.remove('is-cropping')
      if (cropBox) cropBox.hidden = true
      invalidateReferenceAnalysis()
      motionInput?.classList.remove('is-mirrored')
      video.srcObject = null
      video.src = selectedVideoUrl
      applyVideoCrop(video)
      video.muted = true
      video.hidden = false
      if (placeholder) placeholder.hidden = true
      button.textContent = 'Analizar tramo del video'
      status.textContent = 'Cargando video…'
      try {
        if (video.readyState < 1) await waitFor(video, 'loadedmetadata')
        if (segmentStart) segmentStart.value = '0'
        if (segmentEnd) segmentEnd.value = String(Math.min(10, video.duration).toFixed(1))
        setReferenceSourceMode('video', true)
        status.textContent = `Video listo · ${video.duration.toFixed(1)} s. Elige el tramo.`
      } catch {
        status.textContent = 'No se pudo abrir ese archivo de video.'
      }
    }
    function setReferenceSourceMode(
      mode: 'existing' | 'camera' | 'video',
      preserveStatus = false,
    ) {
      if (activity.mode !== 'reference') return
      if (mode === 'existing' && !recordedLandmarkFrames.length) return
      referenceSourceMode = mode
      sourceModeButtons.forEach((candidate) => {
        candidate.setAttribute('aria-pressed', String(candidate.dataset.motionSourceMode === mode))
      })
      if (mode === 'camera' && fileInput?.value) {
        if (selectedVideoUrl) URL.revokeObjectURL(selectedVideoUrl)
        selectedVideoUrl = undefined
        fileInput.value = ''
        if (preparedClipInput) delete preparedClipInput.__motionReferenceClip
        video!.removeAttribute('src')
        video!.load()
        button!.textContent = 'Iniciar grabación'
      }
      if (videoSourceControls) videoSourceControls.hidden = mode !== 'video'
      button!.hidden = mode === 'existing'
        || (mode === 'video' && !fileInput?.files?.[0])
      if (replayButton) replayButton.hidden = mode !== 'existing'
        || !recordedLandmarkFrames.length
      if (mode === 'camera') button!.textContent = 'Iniciar grabación'
      if (mode === 'video' && fileInput?.files?.[0]) button!.textContent = 'Analizar tramo'
      if (!preserveStatus) status!.textContent = mode === 'existing'
        ? 'Referencia lista.'
        : mode === 'camera'
          ? 'Graba una nueva referencia.'
          : ''
    }
    const chooseReferenceSource = (event: Event) => {
      const requested = (event.currentTarget as HTMLButtonElement).dataset.motionSourceMode
      if (requested === 'existing' || requested === 'camera' || requested === 'video') {
        setReferenceSourceMode(requested)
      }
    }
    const start = async () => {
      if (activity.mode === 'compare') {
        recordedLandmarkFrames = []
        if (syncReplayButton) syncReplayButton.hidden = true
        if (syncReplayStatus) syncReplayStatus.textContent = 'Grabando un nuevo intento para compararlo con la referencia.'
        if (learnerRecordingUrl) URL.revokeObjectURL(learnerRecordingUrl)
        learnerRecordingUrl = undefined
      }
      cropping = false
      cropStart = undefined
      cropDraft = undefined
      cropOrigin = undefined
      cropInteraction = undefined
      motionInput?.classList.remove('is-cropping')
      if (cropBox) cropBox.hidden = true
      replayGeneration += 1
      stopRequested = false
      button.disabled = true
      sourceModeButtons.forEach((candidate) => { candidate.disabled = true })
      if (replayButton) replayButton.hidden = true
      video.hidden = true
      if (overlay) overlay.hidden = true
      if (placeholder) placeholder.hidden = false
      results.hidden = true
      if (stageResults) stageResults.hidden = true
      if (stageScores) stageScores.replaceChildren()
      if (download) download.hidden = true
      status.textContent = activity.mode === 'compare'
        ? 'Cargando MediaPipe y la referencia…' : 'Cargando MediaPipe…'
      try {
        // Do not count model download and initialization as recording time.
        await ensureLandmarker()
        const referenceData = activity.mode === 'compare'
          ? await referenceFrames(activity)
          : { frames: [], requiredHand: 'either' as const, stages: [] as MotionStageDefinition[] }
        const reference = prepareSequence(referenceData.frames, activity)
        if (activity.mode === 'compare' && reference.length < 4) {
          throw new Error('La referencia no contiene suficientes cuadros confiables.')
        }
        if (activity.mode === 'compare' && activity.features.hands
          && !reference.some(hasTrackedHand)) {
          throw new Error('La referencia no contiene seguimiento de manos suficiente.')
        }
        status.textContent = 'Realiza el movimiento ahora…'
        const captured = await captureInput()
        if (activity.mode === 'compare') recordedLandmarkFrames = captured.landmarkFrames
        const preparedInput = prepareSequence(captured.frames, activity)
        if (preparedInput.length < 4) {
          throw new Error('No hubo suficientes cuadros con seguimiento confiable. Mejora la luz y mantente dentro del encuadre.')
        }
        if (activity.features.hands && !preparedInput.some(hasTrackedHand)) {
          throw new Error('Mantén las manos visibles durante todo el movimiento.')
        }
        if (activity.features.pose && !preparedInput.some((frame) => frame.facePosture.length)) {
          throw new Error('Asegúrate de que la cabeza y los hombros estén visibles.')
        }
        const averageQuality = Math.round(preparedInput.reduce((total, frame) => total + (frame.quality ?? 1), 0) / preparedInput.length * 100)

        if (activity.mode === 'analyze') {
          overall.textContent = `${averageQuality}% de seguimiento`
          scores.replaceChildren()
          feedback.textContent = `Se extrajeron ${preparedInput.length} puntos temporales confiables. La secuencia está lista para usarse en otra acción.`
          results.hidden = false
          status.textContent = 'Análisis completado.'
          root.dispatchEvent(new CustomEvent('motion:analysis', { bubbles: true, detail: { frames: preparedInput, quality: averageQuality } }))
          return
        }

        if (activity.mode === 'reference') {
          recordedLandmarkFrames = captured.landmarkFrames
          const requiredHand = requiredHandSelect?.value === 'left'
            || requiredHandSelect?.value === 'right'
            || requiredHandSelect?.value === 'both'
            || requiredHandSelect?.value === 'either'
            ? requiredHandSelect.value as RuntimeRequiredHand
            : 'either'
          if (!satisfiesRequiredHand(preparedInput, requiredHand)) {
            throw new Error(requiredHandFeedback(requiredHand))
          }
          let preparedClip: File | undefined
          if (fileInput?.files?.[0] && captured.sourceSegment) {
            status.textContent = 'Preparando solamente el tramo y encuadre seleccionados…'
            preparedClip = await createSelectedVideoClip(
              video,
              captured.sourceCrop,
              captured.sourceSegment,
            )
            if (preparedClipInput) preparedClipInput.__motionReferenceClip = preparedClip
          }
          const template = {
            version: 2 as const,
            durationMs: captured.durationMs,
            frames: preparedInput,
            landmarkFrames: recordedLandmarkFrames,
            measurementModel: 'body-relative-v2' as const,
            requiredHand,
            stages: runtimeHelpers.suggestMotionStages(preparedInput),
            sourceCrop: captured.sourceCrop,
            sourceSegment: captured.sourceSegment,
            storedClip: Boolean(preparedClip),
            storedClipDurationMs: preparedClip ? captured.durationMs : undefined,
            approvedAt: new Date().toISOString(),
          }
          const templateField = runtimeDocument.querySelector<HTMLInputElement>(
            '[data-motion-template-field]',
          )
          if (templateField) {
            templateField.value = JSON.stringify(template)
            templateField.dispatchEvent(new Event('input', { bubbles: true }))
            templateField.dispatchEvent(new Event('change', { bubbles: true }))
          }
          renderStageEditor(template.stages)
          overall.textContent = 'Referencia lista'
          scores.replaceChildren()
          const segmentLabel = captured.sourceSegment
            ? ` · tramo ${captured.sourceSegment.startSeconds.toFixed(1)}–${captured.sourceSegment.endSeconds.toFixed(1)} s`
            : ''
          feedback.textContent = `${preparedInput.length} puntos clave · ${averageQuality}% de calidad de seguimiento${segmentLabel}. Revisa y guarda esta plantilla como referencia aprobada.`
          if (download) {
            if (downloadUrl) URL.revokeObjectURL(downloadUrl)
            downloadUrl = URL.createObjectURL(new Blob([JSON.stringify(template)], { type: 'application/json' }))
            download.href = downloadUrl
            download.download = 'motion-reference.json'
            download.hidden = false
          }
          results.hidden = false
          if (replayButton && recordedLandmarkFrames.length) replayButton.hidden = false
          status.textContent = 'Plantilla compilada localmente.'
          root.dispatchEvent(new CustomEvent('motion:reference', { bubbles: true, detail: template }))
          if (runtimeWindow.parent && runtimeWindow.parent !== runtimeWindow) {
            runtimeWindow.parent.postMessage({
              source: 'motion-analysis-runtime', action: 'reference', activityId: activity.id, template,
            } satisfies MotionReferenceRuntimeMessage, '*')
          }
          return
        }

        const comparison = runtimeHelpers.compareMotionSequences(reference, preparedInput)
        const stageComparisons = runtimeHelpers.compareMotionStages(
          reference,
          preparedInput,
          referenceData.stages,
        )
        const scoredStageComparisons = stageComparisons.filter((stage) => stage.scored !== false)
        if (scoredStageComparisons.length) {
          for (const component of Object.keys(comparison.scores) as Array<keyof typeof comparison.scores>) {
            comparison.scores[component] = Math.round(scoredStageComparisons
              .reduce((total, stage) => total + stage.scores[component], 0)
              / scoredStageComparisons.length)
          }
          comparison.overallScore = Math.round(scoredStageComparisons
            .reduce((total, stage) => total + stage.score, 0)
            / scoredStageComparisons.length)
        }
        if (!satisfiesRequiredHand(preparedInput, referenceData.requiredHand)) {
          const previousHandScore = comparison.scores.handShape
          comparison.scores.handShape = 0
          comparison.overallScore = Math.min(
            activity.passingScore - 1,
            Math.max(0, Math.round(comparison.overallScore - previousHandScore * 0.27)),
          )
          comparison.feedback = requiredHandFeedback(referenceData.requiredHand)
        }
        overall.textContent = `${comparison.overallScore}%`
        overall.setAttribute('aria-label', `${comparison.overallScore}% de coincidencia`)
        scores.replaceChildren(...Object.entries(comparison.scores).map(([component, score]) => {
          const item = runtimeDocument.createElement('div')
          item.className = 'motion-results__score'
          item.innerHTML = `<small>${scoreLabel(component)}</small><strong>${score}%</strong>`
          return item
        }))
        const weakestStage = scoredStageComparisons
          .slice()
          .sort((left, right) => left.score - right.score)[0]
        feedback.textContent = weakestStage && weakestStage.score < 75
          ? `${comparison.feedback} Revisa especialmente: ${weakestStage.label}.`
          : comparison.feedback
        renderStageComparisons(stageComparisons)
        results.hidden = false
        if (replayButton && recordedLandmarkFrames.length) replayButton.hidden = false
        if (syncReplayButton && recordedLandmarkFrames.length && previewTemplate?.landmarkFrames.length) {
          syncReplayButton.hidden = false
          if (syncReplayStatus) syncReplayStatus.textContent = 'Resultado listo. Reproduce ambas vistas para compararlas lado a lado.'
        }
        status.textContent = comparison.overallScore >= activity.passingScore ? 'Objetivo alcanzado.' : 'Inténtalo nuevamente con la sugerencia indicada.'
        root.dispatchEvent(new CustomEvent('motion:result', {
          bubbles: true,
          detail: comparison,
        }))
        try {
          await saveResult(
            activity,
            comparison,
            captured.durationMs,
            captured.landmarkFrames,
            stageComparisons,
          )
          if (activity.persistence) status.textContent += ' Resultado guardado.'
        } catch (error) {
          status.textContent = error instanceof Error ? error.message : 'No se pudo guardar el resultado.'
        }
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : 'No se pudo analizar el movimiento.'
        root.dispatchEvent(new CustomEvent('motion:error', { bubbles: true, detail: { message: status.textContent } }))
      } finally {
        stopStream()
        button.disabled = false
        sourceModeButtons.forEach((candidate) => { candidate.disabled = false })
        if (stopButton) {
          stopButton.hidden = true
          stopButton.disabled = true
        }
      }
    }
    const stop = () => {
      stopRequested = true
      if (stopButton) stopButton.disabled = true
      status.textContent = 'Procesando referencia…'
    }
    const replayCurrent = () => { void replay() }
    const replayReference = () => { void replayStoredReference() }
    const replaySynchronized = () => { void replayTogether() }
    const updateTimelinePlayhead = () => {
      if (!stageEditor || stageEditor.hidden || !Number.isFinite(video.currentTime)) return
      const template = stageTemplate()
      const start = fileInput?.files?.[0]
        ? template?.sourceSegment?.startSeconds ?? Number(segmentStart?.value ?? 0)
        : 0
      const end = fileInput?.files?.[0]
        ? template?.sourceSegment?.endSeconds ?? Number(segmentEnd?.value ?? video.duration)
        : Number.isFinite(video.duration) ? video.duration : start
      if (end <= start) return
      timelineCursorProgress = Math.max(0, Math.min(1, (video.currentTime - start) / (end - start)))
      const playhead = referenceSection?.querySelector<HTMLElement>('[data-motion-stage-playhead]')
      const fill = referenceSection?.querySelector<HTMLElement>('[data-motion-stage-fill]')
      if (playhead) playhead.style.left = `${timelineCursorProgress * 100}%`
      if (fill) fill.style.width = `${timelineCursorProgress * 100}%`
    }
    button.addEventListener('click', start)
    stopButton?.addEventListener('click', stop)
    replayButton?.addEventListener('click', replayCurrent)
    referenceReplay?.addEventListener('click', replayReference)
    syncReplayButton?.addEventListener('click', replaySynchronized)
    stageAddButton?.addEventListener('click', addStage)
    fileInput?.addEventListener('change', selectVideoFile)
    sourceModeButtons.forEach((candidate) =>
      candidate.addEventListener('click', chooseReferenceSource))
    segmentStart?.addEventListener('change', invalidateReferenceAnalysis)
    segmentEnd?.addEventListener('change', invalidateReferenceAnalysis)
    cropEditButton?.addEventListener('click', editCrop)
    cropResetButton?.addEventListener('click', resetCrop)
    motionInput?.addEventListener('pointerdown', beginCrop)
    motionInput?.addEventListener('pointermove', updateCrop)
    motionInput?.addEventListener('pointerup', finishCrop)
    motionInput?.addEventListener('pointercancel', finishCrop)
    storedTemplateField?.addEventListener('input', loadExistingTemplate)
    requiredHandSelect?.addEventListener('change', updateRequiredHand)
    video.addEventListener('timeupdate', updateTimelinePlayhead)
    referenceVideo?.addEventListener('loadedmetadata', syncReferencePresentation)
    void loadReferencePreview()
    if (activity.mode === 'reference') setReferenceSourceMode(referenceSourceMode)
    loadExistingTemplate()
    disposers.push(() => {
      replayGeneration += 1
      referenceReplayGeneration += 1
      button.removeEventListener('click', start)
      stopButton?.removeEventListener('click', stop)
      replayButton?.removeEventListener('click', replayCurrent)
      referenceReplay?.removeEventListener('click', replayReference)
      syncReplayButton?.removeEventListener('click', replaySynchronized)
      stageAddButton?.removeEventListener('click', addStage)
      fileInput?.removeEventListener('change', selectVideoFile)
      sourceModeButtons.forEach((candidate) =>
        candidate.removeEventListener('click', chooseReferenceSource))
      segmentStart?.removeEventListener('change', invalidateReferenceAnalysis)
      segmentEnd?.removeEventListener('change', invalidateReferenceAnalysis)
      cropEditButton?.removeEventListener('click', editCrop)
      cropResetButton?.removeEventListener('click', resetCrop)
      motionInput?.removeEventListener('pointerdown', beginCrop)
      motionInput?.removeEventListener('pointermove', updateCrop)
      motionInput?.removeEventListener('pointerup', finishCrop)
      motionInput?.removeEventListener('pointercancel', finishCrop)
      storedTemplateField?.removeEventListener('input', loadExistingTemplate)
      requiredHandSelect?.removeEventListener('change', updateRequiredHand)
      video.removeEventListener('timeupdate', updateTimelinePlayhead)
      referenceVideo?.removeEventListener('loadedmetadata', syncReferencePresentation)
      referenceResizeObserver?.disconnect()
      stopStream()
      referenceVideo?.pause()
      if (selectedVideoUrl) URL.revokeObjectURL(selectedVideoUrl)
      if (downloadUrl) URL.revokeObjectURL(downloadUrl)
      if (learnerRecordingUrl) URL.revokeObjectURL(learnerRecordingUrl)
      if (previewVideoObjectUrl) URL.revokeObjectURL(previewVideoObjectUrl)
    })
  }

  const close = () => {
    disposers.forEach((dispose) => dispose())
    landmarker?.close()
    landmarker = undefined
    landmarkerPromise = undefined
    landmarkerDelegate = undefined
  }
  runtimeWindow.addEventListener('pagehide', close, { once: true })
  return close
}

export function createMotionRuntimeSource() {
  const serializedFunction = (value: (...args: never[]) => unknown) =>
    `const ${value.name} = ${value.toString()};`
  return [
    serializedFunction(motionVectorDistance),
    serializedFunction(motionFrameDistance),
    serializedFunction(filterMotionFrames),
    serializedFunction(smoothMotionSequence),
    serializedFunction(reduceMotionCheckpoints),
    serializedFunction(alignMotionSequences),
    serializedFunction(scoreDistance),
    serializedFunction(compareMotionSequences),
    serializedFunction(suggestMotionStages),
    serializedFunction(compareMotionStages),
    `(${installMotionRuntime.toString()})(window, document, { compareMotionStages, compareMotionSequences, filterMotionFrames, reduceMotionCheckpoints, smoothMotionSequence, suggestMotionStages });`,
  ].join('\n')
}

export function createMotionConfigSource(config: MotionRuntimeConfig) {
  const serialized = JSON.stringify(config).replaceAll('<', '\\u003c')
  return `window.__MOTION_ANALYSIS__ = ${serialized};\n`
}
