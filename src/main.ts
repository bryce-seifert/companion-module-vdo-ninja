import { InstanceBase, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import WebSocket from 'ws'
import { UpdateActions, type ActionsSchema } from './actions.js'
import {
	buildRequest,
	parseDetails,
	parseMessage,
	type ApiUpdate,
	type GuestCommands,
	type GuestTarget,
	type LocalCommands,
} from './api.js'
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

				ws.send(JSON.stringify({ join: this.config.apiID }))
				this.sendLocal('getDetails', {})
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
		const message = parseMessage(data.toString())
		switch (message.type) {
			case 'callback': {
				const { action, value, local, result } = message.callback
				if (action == 'getDetails') {
					for (const details of parseDetails(result)) {
						this.processGetDetails(details)
					}
				} else if (local && (action === 'mic' || action === 'camera') && typeof result === 'boolean') {
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
				this.log('debug', `Ignored VDO.Ninja message: ${message.reason}`)
				break
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

	processUpdate(data: ApiUpdate): void {
		const state = data.streamID ? this.states[data.streamID] : undefined
		if (state) {
			switch (data.action) {
				case 'hangup':
					{
						delete this.states[state.streamID]
						const hangup = this.streams.findIndex((o) => o.id === state.streamID)
						this.streams.splice(hangup, 1)
						this.initActions()
						this.initVariables()
						this.initFeedbacks()
					}
					break
				case 'director':
					state.director = data.value
					this.initActions()
					this.initVariables()
					this.initFeedbacks()
					break
				case 'endViewConnection':
					{
						delete this.states[data.value]
						const endView = this.streams.findIndex((o) => o.id === data.value)
						this.streams.splice(endView, 1)
						this.initActions()
						this.initVariables()
						this.initFeedbacks()
					}
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
					state.speakerMuted = data.value
					break
				case 'details':
				case 'positionChange':
				case 'newViewConnection':
					this.sendLocal('getDetails', {})
					break
			}
			this.updateVariables()
			this.checkAllFeedbacks()
		}
		if (data.action === 'seeding' || (data.action === 'tracksAdded' && data.value)) {
			this.sendLocal('getDetails', {})
		}
	}

	sendLocal<K extends keyof LocalCommands>(action: K, args: LocalCommands[K], local = false): void {
		this.ws?.send(JSON.stringify(buildRequest(action, null, args, local)))
	}

	sendGuest<K extends keyof GuestCommands>(action: K, target: GuestTarget, args: GuestCommands[K]): void {
		this.ws?.send(JSON.stringify(buildRequest(action, target, args, false)))
	}
}
