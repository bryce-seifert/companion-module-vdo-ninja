export type StreamState = {
	streamID: string
	label?: string
	director?: boolean
	position?: number
	localStream?: boolean
	muted?: boolean
	videoMuted?: boolean
	speakerMuted?: boolean
	others?: Record<string, string>
	scenes?: Record<string, boolean>
}

export type StreamChoice = {
	id: string
	label: string
}
