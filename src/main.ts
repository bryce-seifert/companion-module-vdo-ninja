import { InstanceBase, InstanceStatus, type JsonValue, type SomeCompanionConfigField } from '@companion-module/base'
import WebSocket from 'ws'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { GetConfigFields, type ModuleConfig } from './config.js'
import { UpdateFeedbacks, type FeedbacksSchema } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import type { StreamChoice, StreamState } from './types.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateVariableDefinitions, UpdateVariableValues, type VariablesSchema } from './variables.js'

export type ModuleSchema = {
	config: ModuleConfig
	secrets: undefined
	actions: ActionsSchema
	feedbacks: FeedbacksSchema
	variables: VariablesSchema
}

type UpdateMessage = {
	streamID: string
	action: string
	value: JsonValue
}

type WebSocketMessage = {
	callback?: {
		action: string
		value?: JsonValue
		local?: boolean
		result: JsonValue
	}
	update?: UpdateMessage
}

export { UpgradeScripts }

export default class VDONinjaInstance extends InstanceBase<ModuleSchema> {
	config!: ModuleConfig
	connected: boolean | null = null
	states: Record<string, StreamState> = {}
	streams: StreamChoice[] = []
	ws?: WebSocket
	reconnect?: NodeJS.Timeout

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.updateStatus(InstanceStatus.Connecting)

		this.config = config

		this.connected = null
		this.states = {}
		this.streams = []
		this.initWebSocket()
		this.initActions()
		this.initFeedbacks()
		this.initVariables()
	}

	async destroy(): Promise<void> {
		this.states = {}
		this.streams = []
		if (this.ws !== undefined) {
			this.ws.close(1000)
			delete this.ws
		}
		if (this.reconnect) {
			clearInterval(this.reconnect)
		}
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
		if (this.reconnect) {
			clearInterval(this.reconnect)
		}
		this.initWebSocket()
	}

	initVariables(): void {
		UpdateVariableDefinitions(this)
	}

	updateVariables(): void {
		UpdateVariableValues(this)
	}

	initFeedbacks(): void {
		UpdateFeedbacks(this)
	}

	initPresets(): void {
		UpdatePresets(this)
	}

	initActions(): void {
		UpdateActions(this)
	}

	initWebSocket(): void {
		if (this.reconnect) {
			clearInterval(this.reconnect)
		}
		if (this.config.apiID) {
			if (this.ws !== undefined) {
				this.ws.close(1000)
				delete this.ws
			}

			let serverUrl = 'api.vdo.ninja'
			if (this.config.wsCustom && this.config.wsServer) {
				serverUrl = this.config.wsServer
			}

			const ws = new WebSocket(`wss://${serverUrl}:443`)
			this.ws = ws

			ws.on('open', () => {
				if (!this.connected) {
					this.log('info', `Connection opened to VDO.Ninja`)
					this.connected = true
				}
				this.updateStatus(InstanceStatus.Ok)

				ws.send(`{"join": "${this.config.apiID}" }`)
				ws.send(`{"action": "getDetails"}`)
			})

			ws.on('close', (code) => {
				if (code !== 1000 && code !== 1006) {
					this.connected = false
					this.log('debug', `Websocket closed:  ${code}`)
				}
				this.reconnect = setInterval(() => {
					this.initWebSocket()
				}, 1000)
			})

			ws.on('message', this.messageReceivedFromWebSocket.bind(this))

			ws.on('error', (error: NodeJS.ErrnoException) => {
				if (this.connected !== false) {
					this.connected = false
					this.updateStatus(InstanceStatus.ConnectionFailure)
					if (error?.code == 'ENOTFOUND') {
						this.log('error', `Unable to reach ${serverUrl}`)
					} else {
						this.log('error', `WebSocket ${error}`)
					}
				}
				if (this.ws !== undefined) {
					this.ws.close()
				}
			})
		} else {
			this.log('warn', `API ID required to connect to VDO.Ninja, please add one in the module settings`)
			this.updateStatus(InstanceStatus.BadConfig, 'Missing API ID')
		}
	}

	messageReceivedFromWebSocket(data: WebSocket.RawData): void {
		// eslint-disable-next-line @typescript-eslint/no-base-to-string
		const message = JSON.parse(data.toString()) as WebSocketMessage
		if (message?.callback) {
			const callback = message.callback
			const result = callback.result
			if (callback.action == 'getDetails') {
				for (const details of Object.values(result as Record<string, StreamState>)) {
					this.processGetDetails(details)
				}
			} else if (callback.local) {
				for (const state of Object.values(this.states)) {
					if (state.localStream && callback.value !== 'toggle') {
						this.processUpdate({ streamID: state.streamID, action: callback.action, value: result })
					}
				}
			}
		} else if (message?.update) {
			this.processUpdate(message.update)
		}
	}

	processGetDetails(data: StreamState): void {
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
			this.initFeedbacks()
			this.initVariables()
			this.initPresets()
		} else {
			this.streams.push(streamObject)
			this.initFeedbacks()
			this.initVariables()
			this.updateVariables()
			this.initPresets()
		}
		this.checkAllFeedbacks()
		this.updateVariables()
	}

	processUpdate(data: UpdateMessage): void {
		const state = this.states[data.streamID]
		if (state) {
			switch (data.action) {
				case 'hangup':
					{
						delete this.states[data.streamID]
						const hangup = this.streams.findIndex((o) => o.id === data.streamID)
						this.streams.splice(hangup, 1)
						this.initActions()
						this.initVariables()
						this.initFeedbacks()
					}
					break
				case 'newViewConnection':
					this.ws?.send(`{"action": "getDetails"}`)
					break
				case 'director':
					state.director = data.value as boolean
					this.initActions()
					this.initVariables()
					this.initFeedbacks()
					break
				case 'endViewConnection':
					{
						const streamID = data.value as string
						delete this.states[streamID]
						const endView = this.streams.findIndex((o) => o.id === streamID)
						this.streams.splice(endView, 1)
						this.initActions()
						this.initVariables()
						this.initFeedbacks()
					}
					break
				case 'positionChange':
					this.ws?.send(`{"action": "getDetails"}`)
					break
				case 'directorMuted':
					state.others = { ...state.others, 'mute-guest': data.value ? '1' : '0' }
					break
				case 'directorVideoHide':
					state.others = { ...state.others, 'hide-guest': data.value ? '1' : '0' }
					break
				case 'remoteMuted':
				case 'mic':
					state.muted = data.value as boolean
					break
				case 'remoteVideoMuted':
				case 'camera':
					state.videoMuted = data.value as boolean
					break
				case 'details':
					this.ws?.send(`{"action": "getDetails"}`)
					break
				default:
					state[data.action] = data.value
					break
			}
			this.updateVariables()
			this.checkAllFeedbacks()
		}
		if (data.action === 'seeding' || (data.action === 'tracksAdded' && data.value)) {
			this.ws?.send(`{"action": "getDetails"}`)
		}
	}

	sendRequest(action: string, target?: string | null, value?: JsonValue, local?: boolean, value2?: JsonValue): void {
		const object: Record<string, JsonValue> = {
			action: action ?? 'null',
			target: target ?? 'null',
			value: value ?? 'null',
			local: local ?? false,
		}
		if (value2 !== undefined) object.value2 = value2
		this.ws?.send(JSON.stringify(object))
	}
}
