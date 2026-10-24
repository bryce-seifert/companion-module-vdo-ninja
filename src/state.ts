import type { StreamState } from './types.js'

/** Guest states read from the director controls that VDO.Ninja reports in `others` */
export function isHandRaised(state: StreamState): boolean {
	return state.others?.['hand-raised'] === true
}

/** The guest is waiting in the room's queue for the director to admit them */
export function isQueued(state: StreamState): boolean {
	return state.others?.['remove-queue'] === true
}

export function isHighlighted(state: StreamState): boolean {
	return state.featured === true
}

export function isInGroup(state: StreamState, group: number | string): boolean {
	return state.group?.some((g) => String(g) === String(group)) ?? false
}

export function slotOf(state: StreamState): number | null {
	return typeof state.slot === 'number' ? state.slot : null
}
