import React from 'https://esm.sh/react'

export function playNote(audioContext: AudioContext, frequency: number) {
	const oscillator = audioContext.createOscillator()
	const gain = audioContext.createGain()

	oscillator.connect(gain)
	gain.connect(audioContext.destination)
	oscillator.frequency.value = frequency
	oscillator.type = 'sine'
	gain.gain.setValueAtTime(0.3, audioContext.currentTime)
	// exponentialRampToValueAtTime cannot target 0, so decay to a near-silent floor instead
	gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.8)
	oscillator.start(audioContext.currentTime)
	oscillator.stop(audioContext.currentTime + 0.8)
}

// Browsers only let an AudioContext start from a user gesture, so create it lazily on first note
export const resumeAudioContext = (ref: React.RefObject<AudioContext | null>) => {
	ref.current ??= new AudioContext()
	void ref.current.resume()
	return ref.current
}
