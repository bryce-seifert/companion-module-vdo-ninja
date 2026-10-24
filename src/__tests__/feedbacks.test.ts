import { describe, expect, it } from 'vitest'
import { GetFeedbacks, type FeedbacksSchema } from '../feedbacks.js'
import type { StreamChoice, StreamState } from '../types.js'
import { checkFeedback, definition } from './helpers/definitions.js'
import { director, guest, local, statesOf } from './helpers/streams.js'

function setup(states: Record<string, StreamState>, streams: StreamChoice[] = []) {
	const feedbacks = GetFeedbacks({ states, streams })

	function check<K extends keyof FeedbacksSchema>(id: K, options: FeedbacksSchema[K]['options']): unknown {
		return checkFeedback({ states, streams }, id, options)
	}

	return { feedbacks, check }
}

describe('feedbacks', () => {
	it('offers the known streams, defaulting to the first', () => {
		const streams = [
			{ id: 'a', label: 'A' },
			{ id: 'b', label: 'B' },
		]
		const { feedbacks } = setup({}, streams)
		expect(definition(feedbacks.mic, 'mic').options[0]).toMatchObject({ id: 'stream', default: 'a', choices: streams })
	})

	it('defaults to an empty stream when there are none', () => {
		const { feedbacks } = setup({})
		expect(definition(feedbacks.mic, 'mic').options[0]).toMatchObject({ id: 'stream', default: '', choices: [] })
	})

	it.each([
		['mic', { ...local, muted: true }, true, true],
		['mic', { ...local, muted: true }, false, false],
		['camera', { ...local, videoMuted: true }, true, true],
		['speaker', { ...local, speakerMuted: true }, true, true],
		['speaker', { ...local, speakerMuted: false }, true, false],
	] as const)('%s compares the stream state', (id, stream, state, expected) => {
		const { check } = setup(statesOf(stream))
		expect(check(id, { stream: stream.streamID, state })).toBe(expected)
	})

	it('treats a guest muted by the director as muted', () => {
		const { check } = setup(statesOf({ ...guest, muted: false, others: { 'mute-guest': '1' } }))
		expect(check('mic', { stream: 'guestStream', state: true })).toBe(true)
	})

	it('treats a guest hidden by the director as camera off', () => {
		const { check } = setup(statesOf({ ...guest, videoMuted: false, others: { 'hide-guest': '1' } }))
		expect(check('camera', { stream: 'guestStream', state: true })).toBe(true)
	})

	it('ignores the director controls for the director stream', () => {
		const { check } = setup(statesOf({ ...director, muted: false, others: { 'mute-guest': '1' } }))
		expect(check('mic', { stream: 'directorStream', state: true })).toBe(false)
	})

	it('is false for an unknown stream', () => {
		const { check } = setup(statesOf(local))
		expect(check('mic', { stream: 'nobody', state: false })).toBe(false)
		expect(check('guestScene', { stream: 'nobody', scene: '1' })).toBe(false)
	})

	it.each([
		['1', true],
		['2', false],
		['8', false],
	])('guestScene checks scene %s', (scene, expected) => {
		const { check } = setup(statesOf(guest))
		expect(check('guestScene', { stream: 'guestStream', scene })).toBe(expected)
	})
})
