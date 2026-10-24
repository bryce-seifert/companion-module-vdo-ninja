export type StreamState = {
	streamID: string
	label?: string | false
	director?: boolean | null
	position?: number | null
	localStream?: boolean
	muted?: boolean
	videoMuted?: boolean
	speakerMuted?: boolean
	/** The state of each director control for this guest, keyed by control name */
	others?: Record<string, string | boolean>
	scenes?: Record<string, boolean>
}

export type StreamChoice = {
	id: string
	label: string
}
