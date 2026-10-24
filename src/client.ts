import { EventEmitter } from 'node:events'
import WebSocket from 'ws'
import type { JsonValue } from '@companion-module/base'
import {
	buildRequest,
	parseDetails,
	parseMessage,
	type ApiUpdate,
	type GuestCommands,
	type GuestTarget,
	type LocalCommands,
} from './api.js'
import type { StreamChoice, StreamState } from './types.js'

export type ClientStatus = 'connecting' | 'ok' | 'connection_failure'
export type ClientLogLevel = 'debug' | 'info' | 'warn' | 'error'

export type ClientEvents = {
	status: [status: ClientStatus]
	log: [level: ClientLogLevel, message: string]
	/** The set of streams changed, so anything defined per stream needs rebuilding */
	streamsChanged: []
	/** The state of one or more streams changed */
	stateChanged: []
}

/** Local commands whose callback result is the new muted state of the local stream */
const LocalStateResults = {
	mic: 'muted',
	camera: 'videoMuted',
	speaker: 'speakerMuted',
} as const satisfies Partial<Record<keyof LocalCommands, keyof StreamState>>

type PendingRequest = {
	action: string
	target: GuestTarget | null
	value: JsonValue | undefined
	timer: NodeJS.Timeout
}

/** How long to wait for a callback; VDO.Ninja normally replies within a second */
const PendingTimeout = 10_000

export type ClientOptions = {
	url: string
	apiID: string
	reconnectDelay: number
}

/** Connection to the VDO.Ninja API relay, tracking the state of every stream it reports */
export class VdoNinjaClient extends EventEmitter<ClientEvents> {
	states: Record<string, StreamState> = {}
	streams: StreamChoice[] = []

	readonly #options: ClientOptions
	#ws: WebSocket | undefined
	#reconnectTimer: NodeJS.Timeout | undefined
	#connected: boolean | null = null
	#destroyed = false
	#nextCid = 1
	readonly #pending = new Map<number, PendingRequest>()

	constructor(options: ClientOptions) {
		super()
		this.#options = options
	}

	connect(): void {
		clearTimeout(this.#reconnectTimer)
		if (this.#destroyed) return

		this.#ws?.close(1000)

		const ws = new WebSocket(this.#options.url)
		this.#ws = ws

		ws.on('open', () => {
			if (!this.#connected) {
				this.emit('log', 'info', `Connection opened to VDO.Ninja`)
				this.#connected = true
			}
			this.emit('status', 'ok')

			ws.send(JSON.stringify({ join: this.#options.apiID }))
			this.sendLocal('getDetails', {})
		})

		ws.on('close', (code) => {
			// A socket replaced by connect() or closed by destroy() must not schedule a reconnect
			if (ws !== this.#ws || this.#destroyed) return
			if (code !== 1000 && code !== 1006) {
				this.#connected = false
				this.emit('log', 'debug', `Websocket closed:  ${code}`)
			}
			this.#reconnectTimer = setTimeout(() => this.connect(), this.#options.reconnectDelay)
		})

		ws.on('message', (data: WebSocket.RawData) => {
			// eslint-disable-next-line @typescript-eslint/no-base-to-string
			this.handleMessage(data.toString())
		})

		ws.on('error', (error: NodeJS.ErrnoException) => {
			if (this.#connected !== false) {
				this.#connected = false
				this.emit('status', 'connection_failure')
				if (error?.code == 'ENOTFOUND') {
					this.emit('log', 'error', `Unable to reach ${this.#options.url}`)
				} else {
					this.emit('log', 'error', `WebSocket ${error}`)
				}
			}
			ws.close()
		})
	}

	destroy(): void {
		this.#destroyed = true
		clearTimeout(this.#reconnectTimer)
		this.#ws?.close(1000)
		this.#ws = undefined
		for (const { timer } of this.#pending.values()) clearTimeout(timer)
		this.#pending.clear()
		this.states = {}
		this.streams = []
	}

	sendLocal<K extends keyof LocalCommands>(action: K, args: LocalCommands[K]): void {
		this.#send(action, null, args)
	}

	sendGuest<K extends keyof GuestCommands>(action: K, target: GuestTarget, args: GuestCommands[K]): void {
		this.#send(action, target, args)
	}

	/** Requests awaiting a callback, for tests */
	get pendingRequests(): number {
		return this.#pending.size
	}

	#send(action: string, target: GuestTarget | null, args: { value?: JsonValue; value2?: JsonValue }): void {
		if (this.#ws?.readyState !== WebSocket.OPEN) return

		const cid = this.#nextCid++
		const timer = setTimeout(() => this.#pending.delete(cid), PendingTimeout)
		this.#pending.set(cid, { action, target, value: args.value, timer })
		this.#ws.send(JSON.stringify(buildRequest(action, target, args, cid)))
	}

	/** Callbacks are relayed to every controller on the API ID, so only our own requests are matched */
	#takePending(cid: number | undefined): PendingRequest | undefined {
		if (cid === undefined) return undefined
		const request = this.#pending.get(cid)
		if (request) {
			clearTimeout(request.timer)
			this.#pending.delete(cid)
		}
		return request
	}

	#applyResult(request: PendingRequest, result: JsonValue): void {
		// A toggle is followed by an update with the new state, so only explicit values are applied here
		if (request.target !== null || request.value === 'toggle' || typeof result !== 'boolean') return
		if (!(request.action in LocalStateResults)) return

		const field = LocalStateResults[request.action as keyof typeof LocalStateResults]
		for (const state of Object.values(this.states)) {
			if (state.localStream) state[field] = result
		}
		this.emit('stateChanged')
	}

	handleMessage(text: string): void {
		const message = parseMessage(text)
		switch (message.type) {
			case 'callback': {
				const { action, cid, result } = message.callback
				const request = this.#takePending(cid)
				if (action == 'getDetails') {
					this.#applyDetails(result)
				} else if (request) {
					this.#applyResult(request, result)
				}
				break
			}
			case 'update':
				this.processUpdate(message.update)
				break
			case 'ignored':
				this.emit('log', 'debug', `Ignored VDO.Ninja message: ${message.reason}`)
				break
		}
	}

	/** Stores the details of each stream given, returning false when there were none */
	#applyDetails(result: JsonValue): boolean {
		const entries = parseDetails(result)
		if (entries.length === 0) return false

		let streamsChanged = false
		for (const details of entries) {
			if (this.#storeDetails(details)) streamsChanged = true
		}
		if (streamsChanged) this.emit('streamsChanged')
		this.emit('stateChanged')
		return true
	}

	/** Returns whether the stream is new or its label changed, which is what per-stream definitions depend on */
	#storeDetails(data: StreamState): boolean {
		this.states[data.streamID] = data
		let label = data.streamID
		const name = data.label ? `(${data.label})` : ''

		if (data.director) {
			label = 'Director'
		} else if (data.position) {
			label = `Guest ${data.position} ${name}`
		} else if (data.label) {
			label = data.label
		}

		if (data.localStream) {
			label = `${label} (Local)`
		}

		const index = this.streams.findIndex((o) => o.id === data.streamID)
		if (index === -1) {
			this.streams.push({ id: data.streamID, label })
			return true
		}
		if (this.streams[index].label === label) return false
		this.streams.splice(index, 1, { id: data.streamID, label })
		return true
	}

	processUpdate(data: ApiUpdate): void {
		if (data.action === 'details') {
			if (!this.#applyDetails(data.value)) this.sendLocal('getDetails', {})
			return
		}

		const state = data.streamID ? this.states[data.streamID] : undefined
		if (state) {
			switch (data.action) {
				case 'hangup':
					this.#removeStream(state.streamID)
					break
				case 'director':
					state.director = data.value
					this.emit('streamsChanged')
					break
				case 'endViewConnection':
					this.#removeStream(data.value)
					break
				case 'directorMuted':
					state.others = { ...state.others, 'mute-guest': data.value ? '1' : '0' }
					break
				case 'directorVideoHide':
					state.others = { ...state.others, 'hide-guest': data.value ? '1' : '0' }
					break
				case 'muted':
				case 'remoteMuted':
					state.muted = data.value
					break
				case 'videoMuted':
				case 'remoteVideoMuted':
					state.videoMuted = data.value
					break
				case 'speakerMuted':
					state.speakerMuted = data.value
					break
				case 'positionChange':
				case 'newViewConnection':
					this.sendLocal('getDetails', {})
					break
			}
			this.emit('stateChanged')
		}
		if (data.action === 'seeding' || (data.action === 'tracksAdded' && data.value)) {
			this.sendLocal('getDetails', {})
		}
	}

	#removeStream(streamID: string): void {
		delete this.states[streamID]
		const index = this.streams.findIndex((o) => o.id === streamID)
		if (index !== -1) this.streams.splice(index, 1)
		this.emit('streamsChanged')
	}
}
