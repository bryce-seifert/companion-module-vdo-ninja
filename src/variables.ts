import type { CompanionVariableDefinitions, CompanionVariableValue } from '@companion-module/base'
import type VDONinjaInstance from './main.js'

export type VariablesSchema = Record<string, CompanionVariableValue>

export function UpdateVariableDefinitions(self: VDONinjaInstance): void {
	const variables: CompanionVariableDefinitions<VariablesSchema> = {}

	for (const data of Object.values(self.states)) {
		const name = data.label ? `(${data.label})` : ''

		if (data.streamID) {
			if (data.director) {
				variables[`director_mic`] = { name: `Director - Mic` }
				variables[`director_camera`] = { name: `Director - Camera` }
				variables[`director_speaker`] = { name: `Director - Speaker` }
			} else if (data.position) {
				variables[`guest_${data.position}_streamID`] = { name: `Guest ${data.position} - StreamID` }
				variables[`guest_${data.position}_mic`] = { name: `Guest ${data.position} ${name} - Mic` }
				variables[`guest_${data.position}_camera`] = { name: `Guest ${data.position} ${name} - Camera` }
				variables[`guest_${data.position}_label`] = { name: `Guest ${data.position} - Label` }
				variables[`guest_${data.position}_scenes`] = { name: `Guest ${data.position} - Scenes` }
			}
			variables[`${data.streamID}_mic`] = { name: `Stream ID: ${data.streamID} - Mic` }
			variables[`${data.streamID}_camera`] = { name: `Stream ID: ${data.streamID} - Camera` }
			variables[`${data.streamID}_label`] = { name: `Stream ID: ${data.streamID} - Label` }
			variables[`${data.streamID}_scenes`] = { name: `Stream ID: ${data.streamID} - Scenes` }
		}
	}

	self.setVariableDefinitions(variables)
}

export function UpdateVariableValues(self: VDONinjaInstance): void {
	for (const data of Object.values(self.states)) {
		let label = data.label ? data.label : `Guest ${data.position}`
		const sceneList: string[] = []

		if (data.scenes) {
			for (const scene in data.scenes) {
				if (data.scenes[scene] === true) {
					sceneList.push(scene)
				}
			}
		}

		if (data.streamID) {
			if (data.director) {
				label = 'Director'
				self.setVariableValues({
					director_mic: data.muted ? 'Muted' : 'Unmuted',
					director_camera: data.videoMuted ? 'Muted' : 'Unmuted',
					director_speaker: data.speakerMuted ? 'Muted' : 'Unmuted',
				})
			} else if (data.position) {
				self.setVariableValues({
					[`guest_${data.position}_streamID`]: data.streamID,
					[`guest_${data.position}_mic`]: data.muted || data.others?.['mute-guest'] == '1' ? 'Muted' : 'Unmuted',
					[`guest_${data.position}_camera`]:
						data.videoMuted || data.others?.['hide-guest'] == '1' ? 'Muted' : 'Unmuted',
					[`guest_${data.position}_label`]: label,
					[`guest_${data.position}_scenes`]: sceneList.length ? sceneList : 'None',
				})
			}
			self.setVariableValues({
				[`${data.streamID}_mic`]: data.muted || data.others?.['mute-guest'] == '1' ? 'Muted' : 'Unmuted',
				[`${data.streamID}_camera`]: data.videoMuted || data.others?.['hide-guest'] == '1' ? 'Muted' : 'Unmuted',
				[`${data.streamID}_label`]: label,
				[`${data.streamID}_scenes`]: sceneList.length ? sceneList : 'None',
			})
		}
	}
}
