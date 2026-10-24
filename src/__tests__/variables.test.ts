import { describe, expect, it } from 'vitest'
import { GetPresets } from '../presets.js'
import { GetVariableDefinitions, GetVariableValues } from '../variables.js'
import { director, guest, local, statesOf } from './helpers/streams.js'

describe('variables', () => {
	it('defines director, guest and per-stream variables', () => {
		expect(Object.keys(GetVariableDefinitions(statesOf(director, guest)))).toEqual([
			'director_mic',
			'director_camera',
			'director_speaker',
			'directorStream_mic',
			'directorStream_camera',
			'directorStream_label',
			'directorStream_scenes',
			'guest_2_streamID',
			'guest_2_mic',
			'guest_2_camera',
			'guest_2_label',
			'guest_2_scenes',
			'guestStream_mic',
			'guestStream_camera',
			'guestStream_label',
			'guestStream_scenes',
		])
	})

	it('reports the state of each stream', () => {
		expect(GetVariableValues(statesOf(director, guest))).toEqual({
			director_mic: 'Unmuted',
			director_camera: 'Unmuted',
			director_speaker: 'Unmuted',
			directorStream_mic: 'Unmuted',
			directorStream_camera: 'Unmuted',
			directorStream_label: 'Director',
			directorStream_scenes: 'None',
			guest_2_streamID: 'guestStream',
			guest_2_mic: 'Unmuted',
			guest_2_camera: 'Muted',
			guest_2_label: 'Alice',
			guest_2_scenes: ['1', '3'],
			guestStream_mic: 'Unmuted',
			guestStream_camera: 'Muted',
			guestStream_label: 'Alice',
			guestStream_scenes: ['1', '3'],
		})
	})

	it('shows a guest muted by the director as muted', () => {
		const values = GetVariableValues(statesOf({ ...guest, others: { 'mute-guest': '1' } }))
		expect(values.guest_2_mic).toBe('Muted')
	})

	it('only defines per-stream variables for a plain local stream', () => {
		expect(Object.keys(GetVariableDefinitions(statesOf(local)))).toEqual([
			'localStream_mic',
			'localStream_camera',
			'localStream_label',
			'localStream_scenes',
		])
	})
})

describe('presets', () => {
	it('builds guest and director presets', () => {
		const { structure, presets } = GetPresets(statesOf(director, guest, local))
		expect(structure).toEqual([
			{ id: 'guest', name: 'Guest Actions', definitions: ['guest_2_mic', 'guest_2_camera'] },
			{
				id: 'director',
				name: 'Director Actions',
				definitions: ['director_mic', 'director_camera', 'director_speaker'],
			},
		])
		expect(presets).toMatchSnapshot()
	})

	it('builds no presets without guests or a director', () => {
		const { presets } = GetPresets(statesOf(local))
		expect(presets).toEqual({})
	})
})
