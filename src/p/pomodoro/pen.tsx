import { useDocumentTitle, useInterval, useLocalStorage } from 'https://esm.sh/@mantine/hooks'
import {
	Button,
	Field,
	Fieldset,
	Input,
	Modal,
	Range,
	Select,
	ThemePicker,
	ThemeProvider,
	toast,
	Toaster,
	Toggle,
} from 'https://esm.sh/@trenaryja/ui'
import React, { useEffect, useEffectEvent, useRef, useState } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'
import { LuRefreshCw, LuSettings, LuSkipForward } from 'https://esm.sh/react-icons/lu'
import * as R from 'https://esm.sh/remeda'

type TimerMode = 'longBreak' | 'pomodoro' | 'shortBreak'

type Settings = {
	alarmRepeat: number
	alarmSound: string
	alarmVolume: number
	autoStartBreaks: boolean
	autoStartPomodoros: boolean
	longBreakDuration: number
	longBreakInterval: number
	notificationsEnabled: boolean
	pomodoroDuration: number
	shortBreakDuration: number
}

const LABELS: Record<TimerMode, string> = { pomodoro: 'Pomodoro', shortBreak: 'Short Break', longBreak: 'Long Break' }
const MODES = R.keys(LABELS)

const DEFAULTS: Settings = {
	alarmRepeat: 1,
	alarmSound: 'completed',
	alarmVolume: 100,
	autoStartBreaks: false,
	autoStartPomodoros: false,
	longBreakDuration: 15,
	longBreakInterval: 4,
	notificationsEnabled: false,
	pomodoroDuration: 25,
	shortBreakDuration: 5,
}

const CDN = 'https://reactsounds.sfo3.cdn.digitaloceanspaces.com/v1'
const SOUNDS: Record<string, { label: string; url: string }> = {
	completed: { label: 'Completed', url: `${CDN}/notification/completed.31e527e.mp3` },
	reminder: { label: 'Reminder', url: `${CDN}/notification/reminder.6d68587.mp3` },
	success: { label: 'Success', url: `${CDN}/notification/success.f38c2ed.mp3` },
	chime: { label: 'Chime', url: `${CDN}/ui/success_chime.436ed4a.mp3` },
	bling: { label: 'Bling', url: `${CDN}/ui/success_bling.3f44a2f.mp3` },
	levelUp: { label: 'Level Up', url: `${CDN}/arcade/level_up.0aba301.mp3` },
	powerUp: { label: 'Power Up', url: `${CDN}/arcade/power_up.bcafcc5.mp3` },
	notification: { label: 'Notification', url: `${CDN}/notification/notification.595d086.mp3` },
	warning: { label: 'Warning', url: `${CDN}/notification/warning.207aed9.mp3` },
}

const msFor = (mode: TimerMode, settings: Settings) => settings[`${mode}Duration`] * 60_000

const nextMode = (current: TimerMode, count: number, interval: number): TimerMode =>
	current === 'pomodoro' ? ((count + 1) % interval === 0 ? 'longBreak' : 'shortBreak') : 'pomodoro'

const formatTime = (ms: number) => {
	const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
	return {
		mm: String(Math.floor(totalSeconds / 60)).padStart(2, '0'),
		ss: String(totalSeconds % 60).padStart(2, '0'),
	}
}

const playSound = (key: string, volume: number) => {
	const audio = new Audio((SOUNDS[key] ?? SOUNDS.completed!).url)
	audio.volume = volume / 100
	// autoplay policy rejects until the page has been clicked; playAlarm repeats, so one id collapses the toasts
	audio.play().catch(() => toast.error('Sound blocked — click the page to allow audio', { id: 'audio-blocked' }))
}

const playAlarm = ({ alarmSound, alarmVolume, alarmRepeat }: Settings) => {
	let repeats = 0
	playSound(alarmSound, alarmVolume)

	if (alarmRepeat > 1) {
		const id = setInterval(() => {
			playSound(alarmSound, alarmVolume)
			repeats += 1
			if (repeats >= alarmRepeat - 1) clearInterval(id)
		}, 700)
	}
}

const notify = (title: string, body: string) => {
	if ('Notification' in window && Notification.permission === 'granted') void new Notification(title, { body })
}

const useTimer = (settings: Settings, onComplete: (completedMode: TimerMode) => void) => {
	const [state, setState] = useLocalStorage<{
		isRunning: boolean
		mode: TimerMode
		pomodoroCount: number
		remainingMs: number
		targetEndTime: number | null
	}>({
		key: 'pomo-timer',
		// read during render, not in an effect: client-only SPA, so there's no SSR markup to mismatch
		getInitialValueInEffect: false,
		defaultValue: {
			isRunning: false,
			mode: 'pomodoro',
			pomodoroCount: 0,
			remainingMs: settings.pomodoroDuration * 60_000,
			targetEndTime: null,
		},
	})

	const [displayMs, setDisplayMs] = useState(() => {
		if (state.isRunning && state.targetEndTime) {
			const remaining = state.targetEndTime - Date.now()
			return remaining > 0 ? remaining : 0
		}

		return state.remainingMs
	})

	const completedRef = useRef(false)

	const transition = (fromMode: TimerMode, count: number) => {
		const next = nextMode(fromMode, count, settings.longBreakInterval)
		const newCount = fromMode === 'pomodoro' ? count + 1 : count
		const ms = msFor(next, settings)
		const auto =
			(next !== 'pomodoro' && settings.autoStartBreaks) || (next === 'pomodoro' && settings.autoStartPomodoros)
		setState({
			mode: next,
			pomodoroCount: next === 'pomodoro' && fromMode === 'longBreak' ? 0 : newCount,
			isRunning: auto,
			targetEndTime: auto ? Date.now() + ms : null,
			remainingMs: ms,
		})
		setDisplayMs(ms)
		return { auto }
	}

	const { start: startTick, stop: stopTick } = useInterval(() => {
		if (!state.isRunning || !state.targetEndTime) return
		const remaining = state.targetEndTime - Date.now()
		setDisplayMs(remaining > 0 ? remaining : 0)
	}, 100)

	useEffect(() => {
		if (state.isRunning) startTick()
		else stopTick()
		return stopTick
	}, [state.isRunning, startTick, stopTick])

	const completeTimer = useEffectEvent(() => {
		const completedMode = state.mode
		transition(completedMode, state.pomodoroCount)
		onComplete(completedMode)
	})

	useEffect(() => {
		if (displayMs > 0) {
			completedRef.current = false
			return
		}
		if (!state.isRunning || completedRef.current) return
		completedRef.current = true
		completeTimer()
	}, [displayMs, state.isRunning])

	const start = () => {
		const ms = displayMs > 0 ? displayMs : msFor(state.mode, settings)
		setState((current) => ({ ...current, isRunning: true, targetEndTime: Date.now() + ms }))
	}

	const pause = () =>
		setState((current) => ({ ...current, isRunning: false, targetEndTime: null, remainingMs: displayMs }))

	const reset = () => {
		const ms = msFor(state.mode, settings)
		setState((current) => ({ ...current, isRunning: false, targetEndTime: null, remainingMs: ms }))
		setDisplayMs(ms)
	}

	const activeDurationMs = msFor(state.mode, settings)
	const lastDurationRef = useRef(activeDurationMs)
	const resetToDuration = useEffectEvent(() => reset())

	useEffect(() => {
		// pause() parks partial time in remainingMs, so only a real duration edit may overwrite it
		if (lastDurationRef.current === activeDurationMs) return
		lastDurationRef.current = activeDurationMs
		if (!state.isRunning) resetToDuration()
	}, [activeDurationMs, state.isRunning])

	const skip = () => {
		completedRef.current = false
		transition(state.mode, state.pomodoroCount)
	}

	const switchMode = (mode: TimerMode) => {
		const ms = msFor(mode, settings)
		setState((current) => ({ ...current, mode, isRunning: false, targetEndTime: null, remainingMs: ms }))
		setDisplayMs(ms)
		completedRef.current = false
	}

	return { displayMs, pause, reset, skip, start, state, switchMode }
}

function SettingsModal({
	open,
	onOpenChange,
	settings: s,
	setSettings,
}: {
	onOpenChange: (v: boolean) => void
	open: boolean
	setSettings: (s: ((p: Settings) => Settings) | Settings) => void
	settings: Settings
}) {
	const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
		setSettings((previous) => ({ ...previous, [key]: value }))

	return (
		<Modal open={open} onOpenChange={onOpenChange} backdropBlur>
			{() => (
				<div className='w-[min(28rem,90vw)] space-y-5 p-6'>
					<div className='grid grid-cols-3 gap-3'>
						<Field label='Pomodoro'>
							<Input
								type='number'
								min={1}
								max={120}
								value={s.pomodoroDuration}
								onChange={(e) => set('pomodoroDuration', Math.max(1, +e.target.value))}
							/>
						</Field>
						<Field label='Short Break'>
							<Input
								type='number'
								min={1}
								max={60}
								value={s.shortBreakDuration}
								onChange={(e) => set('shortBreakDuration', Math.max(1, +e.target.value))}
							/>
						</Field>
						<Field label='Long Break'>
							<Input
								type='number'
								min={1}
								max={60}
								value={s.longBreakDuration}
								onChange={(e) => set('longBreakDuration', Math.max(1, +e.target.value))}
							/>
						</Field>
					</div>
					<Field label='Auto Start Breaks' labelPlacement='left-center'>
						<Toggle checked={s.autoStartBreaks} onChange={(e) => set('autoStartBreaks', e.target.checked)} />
					</Field>
					<Field label='Auto Start Pomodoros' labelPlacement='left-center'>
						<Toggle checked={s.autoStartPomodoros} onChange={(e) => set('autoStartPomodoros', e.target.checked)} />
					</Field>
					<Field label='Long Break Interval' labelPlacement='left-center'>
						<Input
							className='w-20 text-center'
							type='number'
							min={1}
							max={12}
							value={s.longBreakInterval}
							onChange={(e) => set('longBreakInterval', Math.max(1, +e.target.value))}
						/>
					</Field>

					<Fieldset legend='Alarm Sound'>
						<div className='space-y-3'>
							<div className='flex gap-2'>
								<Select className='flex-1' value={s.alarmSound} onChange={(e) => set('alarmSound', e.target.value)}>
									{Object.entries(SOUNDS).map(([k, v]) => (
										<option key={k} value={k}>
											{v.label}
										</option>
									))}
								</Select>
								<Button className='btn-ghost btn-sm' onClick={() => playSound(s.alarmSound, s.alarmVolume)}>
									Test
								</Button>
							</div>
							<Field label={`Volume: ${s.alarmVolume}%`}>
								<Range min={0} max={100} value={s.alarmVolume} onChange={(e) => set('alarmVolume', +e.target.value)} />
							</Field>
							<Field label='Repeat' labelPlacement='left-center'>
								<Input
									className='w-20 text-center'
									type='number'
									min={1}
									max={10}
									value={s.alarmRepeat}
									onChange={(e) => set('alarmRepeat', Math.max(1, Math.min(10, +e.target.value)))}
								/>
							</Field>
						</div>
					</Fieldset>

					<Fieldset legend='Notifications'>
						<Field label='Enable Notifications' labelPlacement='left-center'>
							<Toggle
								checked={s.notificationsEnabled}
								onChange={(e) => set('notificationsEnabled', e.target.checked)}
							/>
						</Field>
					</Fieldset>

					<div className='flex justify-end pt-2'>
						<Button className='btn-ghost btn-sm' onClick={() => setSettings(DEFAULTS)}>
							Reset to Defaults
						</Button>
					</div>
				</div>
			)}
		</Modal>
	)
}

function Root() {
	const [settings, setSettings] = useLocalStorage<Settings>({
		key: 'pomo-settings',
		getInitialValueInEffect: false,
		defaultValue: DEFAULTS,
	})
	const [settingsOpen, setSettingsOpen] = useState(false)
	const { displayMs, pause, reset, skip, start, state, switchMode } = useTimer(settings, (completedMode) => {
		playAlarm(settings)
		if (settings.notificationsEnabled)
			notify(`${LABELS[completedMode]} complete!`, completedMode === 'pomodoro' ? 'Time for a break!' : 'Back to work!')
		toast(`${LABELS[completedMode]} complete!`)
	})

	useEffect(() => {
		if (settings.notificationsEnabled && 'Notification' in window && Notification.permission === 'default')
			void Notification.requestPermission()
	}, [settings.notificationsEnabled])

	const { mm, ss } = formatTime(displayMs)
	useDocumentTitle(`${mm}:${ss} - ${LABELS[state.mode]}`)
	const toggle = () => (state.isRunning ? pause() : start())

	return (
		<ThemeProvider>
			<Toaster />
			<main className='grid min-h-screen place-content-center justify-items-center gap-6 p-6'>
				<div className='flex gap-4'>
					<Button className='btn-ghost btn-square' onClick={() => setSettingsOpen(true)} title='Settings'>
						<LuSettings />
					</Button>
					<ThemePicker variant='modal' />
				</div>

				<div className='flex gap-1'>
					{MODES.map((m) => (
						<Button
							key={m}
							className={`btn-sm ${state.mode === m ? 'btn-active' : 'btn-ghost'}`}
							onClick={() => switchMode(m)}
						>
							{LABELS[m]}
						</Button>
					))}
				</div>

				<div className='text-[clamp(4rem,18vw,10rem)] font-mono'>
					{mm}:{ss}
				</div>

				<div className='flex items-center gap-3'>
					{state.isRunning && (
						<Button className='btn-ghost btn-circle' onClick={reset} title='Reset'>
							<LuRefreshCw />
						</Button>
					)}
					<Button className='btn-lg' onClick={toggle}>
						{state.isRunning ? 'Pause' : 'Start'}
					</Button>
					{state.isRunning && (
						<Button className='btn-ghost btn-circle' onClick={skip} title='Skip'>
							<LuSkipForward />
						</Button>
					)}
				</div>

				<SettingsModal
					open={settingsOpen}
					onOpenChange={setSettingsOpen}
					settings={settings}
					setSettings={setSettings}
				/>
			</main>
		</ThemeProvider>
	)
}

createRoot(document.getElementById('root')!).render(<Root />)
