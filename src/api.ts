/**
 * Types for the VDO.Ninja remote control API ("Companion Ninja").
 *
 * There is no published schema. These are derived from
 * https://github.com/steveseguin/Companion-Ninja#readme and from VDO.Ninja's own handlers in lib.js
 * (`setupCommands`, `targetGuest`, `processMessage` and the `pokeAPI` calls), so re-check them
 * against new VDO.Ninja releases.
 */
import type { JsonObject, JsonValue } from '@companion-module/base'
import type { StreamState } from './types.js'

/** VDO.Ninja converts the strings "true"/"false" to booleans before handling a command */
export type BoolLike = boolean | 'true' | 'false'
export type Toggle = BoolLike | 'toggle'
/** Numeric values are parsed with parseInt/parseFloat, so numeric strings are accepted too */
export type NumberLike = number | string
/** Scene 0 to 8, or the name of an active custom scene */
export type SceneId = string | number
/** Guest slot (1 to 99), stream ID or peer UUID */
export type GuestTarget = string | number

type NoValue = Record<string, never>
type Value<T> = { value: T }
type Ptz = { value: NumberLike; value2?: 'abs' | BoolLike }

export type LayoutItem = {
	x: number
	y: number
	w: number
	h: number
	slot: number
	z?: number
	c?: boolean
}

/** Commands sent without a target, acting on the page the API ID is attached to */
export interface LocalCommands {
	speaker: Value<Toggle>
	mic: Value<Toggle>
	camera: Value<Toggle>
	/** 0 to 100, or true/false for 100%/muted */
	volume: Value<NumberLike | BoolLike>
	sendChat: Value<string>
	showChatOverlay: Value<string>
	record: Value<BoolLike>
	reload: NoValue
	hangup: NoValue
	/** true resets, false pauses, a number sets kbps */
	bitrate: Value<NumberLike | BoolLike>
	/** 0 (left) to 180 (right), or true/false to centre */
	panning: Value<NumberLike | BoolLike>
	togglehand: NoValue
	togglescreenshare: NoValue
	forceKeyframe: NoValue
	group: Value<NumberLike>
	joinGroup: Value<NumberLike>
	leaveGroup: Value<NumberLike>
	viewGroup: Value<NumberLike>
	joinViewGroup: Value<NumberLike>
	leaveViewGroup: Value<NumberLike>
	getDetails: NoValue
	getGuestList: NoValue
	requestStats: NoValue
	/** Optional inbound stream ID */
	getStats: { value?: string }
	nextSlide: NoValue
	prevSlide: NoValue
	/** A missing value toggles */
	soloVideo: { value?: Toggle }
	muteAllGuests: Value<Toggle>
	startRoomTimer: Value<NumberLike>
	stopRoomTimer: NoValue
	pauseRoomTimer: NoValue
	/** Delay in ms; value2 is the stream ID or UUID, or omitted for all streams */
	setBufferDelay: { value: NumberLike; value2?: string }
	activeSpeaker: { value?: 'toggle' | BoolLike | 1 | 2 | 3 }
	tallylight: Value<'onair' | 'active' | 'standby' | 'off' | number>
	aspectRatio: Value<NumberLike>
	/** value is the constraint name, value2 its value */
	videoConstraint: { value: string; value2: JsonValue }
	/** Relative adjustment, or absolute 0 to 1 when value2 is "abs" */
	zoom: Ptz
	focus: Ptz
	pan: Ptz
	tilt: Ptz
	/** 0 (dark) to 1 (bright) */
	exposure: Value<NumberLike>
	/** 0 is the auto mixer, 1+ the custom layouts from &layouts, or a layout to apply directly */
	layout: Value<number | LayoutItem[]>
}

/** Commands sent by a director with a guest as the target */
export interface GuestCommands {
	forward: Value<string>
	/** Toggles, unless value2 forces membership */
	addScene: { value: SceneId; value2?: BoolLike }
	setScene: { value: SceneId; value2?: BoolLike }
	muteScene: Value<SceneId>
	activateQueuedGuest: NoValue
	removeQueuedGuest: NoValue
	/** Destination slot, or 0 to unset */
	setslot: Value<NumberLike>
	group: Value<NumberLike>
	mic: NoValue
	hangup: NoValue
	soloChat: NoValue
	soloChatBidirectional: NoValue
	speaker: NoValue
	display: NoValue
	mirror: Value<Toggle>
	/** true advances 90 degrees, false resets */
	rotate: Value<BoolLike | 90 | 180 | 270>
	channel: Value<0 | 1 | 2>
	sendDirectorChat: Value<string>
	sendPinnedDirectorChat: Value<string>
	forceKeyframe: NoValue
	soloVideo: NoValue
	/** 0 to 200 */
	volume: Value<NumberLike>
	startRoomTimer: Value<NumberLike>
	stopRoomTimer: NoValue
	pauseRoomTimer: NoValue
	ptzZoom: Ptz
	ptzFocus: Ptz
	ptzPan: Ptz
	ptzTilt: Ptz
	ptzAutofocus: Value<BoolLike | 'manual' | 'off'>
	/** WIDTHxHEIGHT */
	requestResolution: Value<`${number}x${number}`>
	/** value2 is the max dimension */
	requestAspectRatio: { value: NumberLike; value2?: NumberLike }
	setWidth: Value<NumberLike>
	setHeight: Value<NumberLike>
	setAspectRatio: Value<NumberLike>
	refreshVideo: NoValue
	refreshConnection: NoValue
	recoverStream: NoValue
	mixorder: Value<-1 | 1>
}

/** The JSON object sent over the websocket */
export type ApiRequest = {
	action: string
	target: GuestTarget
	value: JsonValue
	value2?: JsonValue
	/** Not part of the API: echoed back in the callback, so the module can tell its local commands apart */
	local: boolean
}

export function buildRequest(
	action: string,
	target: GuestTarget | null,
	args: { value?: JsonValue; value2?: JsonValue },
	local: boolean,
): ApiRequest {
	const request: ApiRequest = {
		action,
		target: target ?? 'null',
		value: args.value ?? 'null',
		local,
	}
	if (args.value2 !== undefined) request.value2 = args.value2
	return request
}

/** Updates whose value is the new boolean state */
const BooleanUpdateActions = [
	'muted',
	'videoMuted',
	'speakerMuted',
	'director',
	'hangup',
	'directorMuted',
	'directorVideoHide',
	'remoteVideoMuted',
	// Not sent by current VDO.Ninja releases, kept for older ones and for local command callbacks
	'mic',
	'camera',
	'speaker',
	'remoteMuted',
] as const

/** Updates that only signal that a fresh getDetails is needed */
const RefreshUpdateActions = ['details', 'positionChange', 'newViewConnection', 'seeding', 'tracksAdded'] as const

export type BooleanUpdateAction = (typeof BooleanUpdateActions)[number]
export type RefreshUpdateAction = (typeof RefreshUpdateActions)[number]

type UpdateBase = { streamID: string | null }

export type ApiUpdate =
	| (UpdateBase & { action: BooleanUpdateAction; value: boolean })
	| (UpdateBase & { action: 'endViewConnection'; value: string })
	| (UpdateBase & { action: RefreshUpdateAction; value: JsonValue })

/** A command response: the original request echoed back with its result */
export type ApiCallback = {
	action: string
	value?: JsonValue
	local?: boolean
	result: JsonValue
}

export type ApiMessage =
	| { type: 'update'; update: ApiUpdate }
	| { type: 'callback'; callback: ApiCallback }
	| { type: 'ignored'; reason: string }

function isObject(value: unknown): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function includes<T extends string>(list: readonly T[], value: string): value is T {
	return (list as readonly string[]).includes(value)
}

function parseUpdate(raw: unknown): ApiUpdate | string {
	if (!isObject(raw) || typeof raw.action !== 'string') return 'malformed update'
	const streamID = typeof raw.streamID === 'string' ? raw.streamID : null
	const { action, value } = raw

	if (includes(BooleanUpdateActions, action)) {
		return typeof value === 'boolean' ? { streamID, action, value } : `non-boolean value for ${action}`
	}
	if (action === 'endViewConnection') {
		return typeof value === 'string'
			? { streamID, action: 'endViewConnection', value }
			: 'non-string value for endViewConnection'
	}
	if (includes(RefreshUpdateActions, action)) {
		return { streamID, action, value: value ?? null }
	}
	return `unhandled update ${action}`
}

function parseCallback(raw: unknown): ApiCallback | string {
	if (!isObject(raw) || typeof raw.action !== 'string') return 'malformed callback'
	return {
		action: raw.action,
		value: raw.value,
		local: raw.local === true,
		result: raw.result ?? null,
	}
}

export function parseMessage(text: string): ApiMessage {
	let raw: unknown
	try {
		raw = JSON.parse(text)
	} catch {
		return { type: 'ignored', reason: 'invalid JSON' }
	}
	if (!isObject(raw)) return { type: 'ignored', reason: 'not an object' }

	if ('callback' in raw) {
		const callback = parseCallback(raw.callback)
		return typeof callback === 'string' ? { type: 'ignored', reason: callback } : { type: 'callback', callback }
	}
	if ('update' in raw) {
		const update = parseUpdate(raw.update)
		return typeof update === 'string' ? { type: 'ignored', reason: update } : { type: 'update', update }
	}
	return { type: 'ignored', reason: 'unknown message' }
}

/** getDetails returns one entry per stream; entries without a stream ID are dropped */
export function parseDetails(result: JsonValue): StreamState[] {
	if (!isObject(result) && !Array.isArray(result)) return []
	return Object.values(result).filter(
		(entry): entry is StreamState => isObject(entry) && typeof entry.streamID === 'string',
	)
}
