import { EventEmitter } from 'node:events'
import WebSocket from 'ws'
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
		this.states = {}
		this.streams = []
	}

	sendLocal<K extends keyof LocalCommands>(action: K, args: LocalCommands[K], local = false): void {
		this.#send(buildRequest(action, null, args, local))
	}

	sendGuest<K extends keyof GuestCommands>(action: K, target: GuestTarget, args: GuestCommands[K]): void {
		this.#send(buildRequest(action, target, args, false))
	}

	#send(request: object): void {
		if (this.#ws?.readyState === WebSocket.OPEN) {
			this.#ws.send(JSON.stringify(request))
		}
	}

	handleMessage(text: string): void {
		const message = parseMessage(text)
		switch (message.type) {
			case 'callback': {
				const { action, value, local, result } = message.callback
				if (action == 'getDetails') {
					for (const details of parseDetails(result)) {
						this.processDetails(details)
					}
				} else if (
					local &&
					(action === 'mic' || action === 'camera' || action === 'speaker') &&
					typeof result === 'boolean'
				) {
					for (const state of Object.values(this.states)) {
						if (state.localStream && value !== 'toggle') {
							this.processUpdate({ streamID: state.streamID, action, value: result })
						}
					}
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

	processDetails(data: StreamState): void {
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

		const streamObject = { id: data.streamID, label: label }

		const index = this.streams.findIndex((o) => o.id === data.streamID)
		if (index !== -1) {
			this.streams.splice(index, 1, streamObject)
		} else {
			this.streams.push(streamObject)
		}
		this.emit('streamsChanged')
		this.emit('stateChanged')
	}

	processUpdate(data: ApiUpdate): void {
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
				case 'mic':
					state.muted = data.value
					break
				case 'videoMuted':
				case 'remoteVideoMuted':
				case 'camera':
					state.videoMuted = data.value
					break
				case 'speakerMuted':
				case 'speaker':
					state.speakerMuted = data.value
					break
				case 'details':
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
