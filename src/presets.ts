import {
	combineRgb,
	type CompanionPresetDefinitions,
	type CompanionPresetSection,
	type CompanionSimplePresetDefinition,
} from '@companion-module/base'
import type { ModuleSchema } from './main.js'
import type { StreamState } from './types.js'

export function GetPresets(states: Record<string, StreamState>): {
	structure: CompanionPresetSection<ModuleSchema>[]
	presets: CompanionPresetDefinitions<ModuleSchema>
} {
	const presets: CompanionPresetDefinitions<ModuleSchema> = {}
	const guestPresets: string[] = []
	const directorPresets: string[] = []

	const ColorWhite = combineRgb(255, 255, 255)
	const ColorBlack = combineRgb(0, 0, 0)
	const ColorGreen = combineRgb(0, 200, 0)

	const addPreset = (list: string[], id: string, preset: CompanionSimplePresetDefinition<ModuleSchema>) => {
		presets[id] = preset
		list.push(id)
	}

	for (const stream of Object.values(states)) {
		if (stream.position && !stream.director) {
			addPreset(guestPresets, `guest_${stream.position}_mic`, {
				type: 'simple',
				name: `guest_${stream.position}_mic`,
				style: {
					text: `$(VDO.Ninja:guest_${stream.position}_label)\\nMic\\n$(VDO.Ninja:guest_${stream.position}_mic)`,
					size: 'auto',
					color: ColorWhite,
					bgcolor: ColorBlack,
				},
				feedbacks: [
					{
						feedbackId: 'mic',
						options: {
							stream: stream.streamID,
							state: false,
						},
						style: {
							bgcolor: ColorGreen,
							color: ColorWhite,
						},
					},
				],
				steps: [
					{
						down: [
							{
								actionId: 'guestMic',
								options: {
									target: String(stream.position),
								},
							},
						],
						up: [],
					},
				],
			})
			addPreset(guestPresets, `guest_${stream.position}_camera`, {
				type: 'simple',
				name: `guest_${stream.position}_camera`,
				style: {
					text: `$(VDO.Ninja:guest_${stream.position}_label)\\nCamera\\n$(VDO.Ninja:guest_${stream.position}_camera)`,
					size: 'auto',
					color: ColorWhite,
					bgcolor: ColorBlack,
				},
				feedbacks: [
					{
						feedbackId: 'camera',
						options: {
							stream: stream.streamID,
							state: false,
						},
						style: {
							bgcolor: ColorGreen,
							color: ColorWhite,
						},
					},
				],
				steps: [
					{
						down: [],
						up: [],
					},
				],
			})
		} else if (stream.director) {
			addPreset(directorPresets, `director_mic`, {
				type: 'simple',
				name: stream.streamID,
				style: {
					text: `Director\\nMic\\n$(VDO.Ninja:director_mic)`,
					size: 'auto',
					color: ColorWhite,
					bgcolor: ColorBlack,
				},
				feedbacks: [
					{
						feedbackId: 'mic',
						options: {
							stream: stream.streamID,
							state: false,
						},
						style: {
							bgcolor: ColorGreen,
							color: ColorWhite,
						},
					},
				],
				steps: [
					{
						down: [
							{
								actionId: 'mic',
								options: {
									value: 'toggle',
								},
							},
						],
						up: [],
					},
				],
			})
			addPreset(directorPresets, `director_camera`, {
				type: 'simple',
				name: stream.streamID,
				style: {
					text: `Director\\nCamera\\n$(VDO.Ninja:director_camera)`,
					size: 'auto',
					color: ColorWhite,
					bgcolor: ColorBlack,
				},
				feedbacks: [
					{
						feedbackId: 'camera',
						options: {
							stream: stream.streamID,
							state: false,
						},
						style: {
							bgcolor: ColorGreen,
							color: ColorWhite,
						},
					},
				],
				steps: [
					{
						down: [
							{
								actionId: 'camera',
								options: {
									value: 'toggle',
								},
							},
						],
						up: [],
					},
				],
			})
			addPreset(directorPresets, `director_speaker`, {
				type: 'simple',
				name: stream.streamID,
				style: {
					text: `Director\\nSpeaker\\n$(VDO.Ninja:director_speaker)`,
					size: 'auto',
					color: ColorWhite,
					bgcolor: ColorBlack,
				},
				feedbacks: [
					{
						feedbackId: 'speaker',
						options: {
							stream: stream.streamID,
							state: false,
						},
						style: {
							bgcolor: ColorGreen,
							color: ColorWhite,
						},
					},
				],
				steps: [
					{
						down: [
							{
								actionId: 'speaker',
								options: {
									value: 'toggle',
								},
							},
						],
						up: [],
					},
				],
			})
		}
	}

	const structure: CompanionPresetSection<ModuleSchema>[] = [
		{ id: 'guest', name: 'Guest Actions', definitions: guestPresets },
		{ id: 'director', name: 'Director Actions', definitions: directorPresets },
	]

	return { structure, presets }
}
