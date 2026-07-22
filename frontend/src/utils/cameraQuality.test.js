import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeImageData, assessCameraCapture, formatBytes } from './cameraQuality.js'

test('accepts a standard camera capture', () => {
  const result = assessCameraCapture({
    width: 1920,
    height: 1080,
    sizeBytes: 250000,
    analysis: { brightness: 130, contrast: 35, sharpness: 9 },
  })

  assert.deepEqual(result.blockers, [])
  assert.deepEqual(result.warnings, [])
})

test('blocks a capture with insufficient resolution', () => {
  const result = assessCameraCapture({
    width: 320,
    height: 240,
    sizeBytes: 250000,
    analysis: { brightness: 130, contrast: 35, sharpness: 9 },
  })

  assert.equal(result.blockers.length, 1)
})

test('reports a dark capture as a warning', () => {
  const result = assessCameraCapture({
    width: 1920,
    height: 1080,
    sizeBytes: 250000,
    analysis: { brightness: 35, contrast: 35, sharpness: 9 },
  })

  assert.equal(result.warnings.length, 1)
})

test('calculates simple local image metrics', () => {
  const metrics = analyzeImageData({
    data: new Uint8ClampedArray([
      0, 0, 0, 255,
      0, 0, 0, 255,
      0, 0, 0, 255,
      0, 0, 0, 255,
      255, 255, 255, 255,
      0, 0, 0, 255,
      0, 0, 0, 255,
      0, 0, 0, 255,
    ]),
  })

  assert.equal(metrics.brightness, 128)
  assert.equal(formatBytes(1024 * 1024), '1.00 Mo')
})
