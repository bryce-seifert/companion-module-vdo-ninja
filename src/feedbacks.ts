import {
	combineRgb,
	type CompanionFeedbackDefinitions,
	type CompanionInputFieldCheckbox,
	type CompanionInputFieldDropdown,
} from '@companion-module/base'
import type { VdoNinjaClient } from './client.js'

type StreamStateOptions = {
	stream: string
	state: boolean
}

export type FeedbacksSchema = {
	mic: { type: 'boolean'; options: StreamStateOptions }
	camera: { type: 'boolean'; options: StreamStateOptions }
	speaker: { type: 'boolean'; options: StreamStateOptions }
	guestScene: { type: 'boolean'; options: { stream: string; scene: string } }
}

// Stored as a boolean, matching the true/false ids of the dropdown this replaced
const stateField: CompanionInputFieldCheckbox<'state'> = {
	type: 'checkbox',
	label: 'Muted',
	id: 'state',
	default: true,
}

export function GetFeedbacks(
	client: Pick<VdoNinjaClient, 'states' | 'streams'>,
): CompanionFeedbackDefinitions<FeedbacksSchema> {
	const ColorWhite = combineRgb(255, 255, 255)
	const ColorGreen = combineRgb(0, 200, 0)

	const streamField = (allowCustom: boolean): CompanionInputFieldDropdown<'stream', string> => ({
		type: 'dropdown',
		label: 'Stream',
		id: 'stream',
		allowCustom,
		default: client.streams[0]?.id ?? '',
		choices: client.streams,
	})

	return {
		mic: {
			type: 'boolean',
			name: 'Mic Status',
			description: 'If mic matches the selected state, change the style of the button',
			options: [streamField(true), stateField],
			defaultStyle: {
				color: ColorWhite,
				bgcolor: ColorGreen,
			},
			callback: (feedback) => {
				const stream = client.states[feedback.options.stream]
				if (!stream) return false
				if (stream.position && !stream.director && stream.others?.['mute-guest'] == '1') {
					return feedback.options.state ?? false
				}
				return stream.muted === feedback.options.state
			},
		},
		camera: {
			type: 'boolean',
			name: 'Camera Status',
			description: 'If camera matches the selected state, change the style of the button',
			options: [streamField(false), stateField],
			defaultStyle: {
				color: ColorWhite,
				bgcolor: ColorGreen,
			},
			callback: (feedback) => {
				const stream = client.states[feedback.options.stream]
				if (!stream) return false
				if (stream.position && !stream.director && stream.others?.['hide-guest'] == '1') {
					return feedback.options.state ?? false
				}
				return stream.videoMuted === feedback.options.state
			},
		},
		speaker: {
			type: 'boolean',
			name: 'Speaker Status',
			description: 'If speaker matches the selected state, change the style of the button',
			options: [streamField(false), stateField],
			defaultStyle: {
				color: ColorWhite,
				bgcolor: ColorGreen,
			},
			callback: (feedback) => {
				return client.states[feedback.options.stream]?.speakerMuted === feedback.options.state
			},
		},
		guestScene: {
			type: 'boolean',
			name: 'Guest in Scene',
			description: 'If a stream is active the selected scene, change the style of the button',
			options: [
				streamField(true),
				{
					type: 'textinput',
					label: 'Scene name or ID (0 to 8)',
					id: 'scene',
					default: '1',
				},
			],
			defaultStyle: {
				color: ColorWhite,
				bgcolor: ColorGreen,
			},
			callback: (feedback) => {
				return client.states[feedback.options.stream]?.scenes?.[feedback.options.scene] == true
			},
		},
	}
}
