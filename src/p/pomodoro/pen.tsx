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
	Toaster,
	Toggle,
	toast,
} from 'https://esm.sh/@trenaryja/ui'
import { useEffect, useRef, useState } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'
import { LuRefreshCw, LuSettings, LuSkipForward } from 'https://esm.sh/react-icons/lu'

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
const MODES = Object.keys(LABELS) as TimerMode[]

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

const msFor = (mode: TimerMode, s: Settings) => (s[`${mode}Duration` as keyof Settings] as number) * 60_000

const nextMode = (cur: TimerMode, count: number, interval: number): TimerMode =>
	cur === 'pomodoro' ? ((count + 1) % interval === 0 ? 'longBreak' : 'shortBreak') : 'pomodoro'

const formatTime = (ms: number) => {
	const s = Math.max(0, Math.ceil(ms / 1000))
	return { mm: String(Math.floor(s / 60)).padStart(2, '0'), ss: String(s % 60).padStart(2, '0') }
}

const playSound = (key: string, vol: number) => {
	const a = new Audio((SOUNDS[key] ?? SOUNDS.completed).url)
	a.volume = vol / 100
	a.play()
}

const playAlarm = ({ alarmSound, alarmVolume, alarmRepeat }: Settings) => {
	let n = 0
	playSound(alarmSound, alarmVolume)

	if (alarmRepeat > 1) {
		const id = setInterval(() => {
			playSound(alarmSound, alarmVolume)
			n += 1
			if (n >= alarmRepeat - 1) clearInterval(id)
		}, 700)
	}
}

const notify = (title: string, body: string) => {
	if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body })
}

const useTimer = (settings: Settings) => {
	const [state, setState] = useLocalStorage<{
		isRunning: boolean
		mode: TimerMode
		pomodoroCount: number
		remainingMs: number
		targetEndTime: number | null
	}>({
		key: 'pomo-timer',
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
			const r = state.targetEndTime - Date.now()
			return r > 0 ? r : 0
		}

		return state.remainingMs
	})

	const completedRef = useRef(false)
	const onCompleteRef = useRef<(() => void) | null>(null)

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

	const interval = useInterval(() => {
		if (!state.isRunning || !state.targetEndTime) return
		const r = state.targetEndTime - Date.now()
		setDisplayMs(r > 0 ? r : 0)
	}, 100)

	useEffect(() => {
		if (state.isRunning) interval.start()
		else interval.stop()
		return interval.stop
	}, [state.isRunning])
	useEffect(() => {
		if (!state.isRunning || displayMs > 0 || completedRef.current) return
		completedRef.current = true
		transition(state.mode, state.pomodoroCount)
		onCompleteRef.current?.()
		const t = setTimeout(() => {
			completedRef.current = false
		}, 500)
		return () => clearTimeout(t)
	}, [displayMs, state.isRunning])
	useEffect(() => {
		if (state.isRunning && state.targetEndTime) {
			const r = state.targetEndTime - Date.now()
			setDisplayMs(r > 0 ? r : 0)
		}
	}, [])

	const start = () => {
		const ms = displayMs > 0 ? displayMs : msFor(state.mode, settings)
		setState((s) => ({ ...s, isRunning: true, targetEndTime: Date.now() + ms }))
	}

	const pause = () => setState((s) => ({ ...s, isRunning: false, targetEndTime: null, remainingMs: displayMs }))

	const reset = () => {
		const ms = msFor(state.mode, settings)
		setState((s) => ({ ...s, isRunning: false, targetEndTime: null, remainingMs: ms }))
		setDisplayMs(ms)
	}

	const skip = () => {
		completedRef.current = false
		transition(state.mode, state.pomodoroCount)
	}

	const switchMode = (mode: TimerMode) => {
		const ms = msFor(mode, settings)
		setState((s) => ({ ...s, mode, isRunning: false, targetEndTime: null, remainingMs: ms }))
		setDisplayMs(ms)
		completedRef.current = false
	}

	return { displayMs, onCompleteRef, pause, reset, skip, start, state, switchMode }
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
	const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings((prev) => ({ ...prev, [k]: v }))

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
	const [settings, setSettings] = useLocalStorage<Settings>({ key: 'pomo-settings', defaultValue: DEFAULTS })
	const [settingsOpen, setSettingsOpen] = useState(false)
	const { displayMs, onCompleteRef, pause, reset, skip, start, state, switchMode } = useTimer(settings)

	useEffect(() => {
		onCompleteRef.current = () => {
			playAlarm(settings)
			if (settings.notificationsEnabled)
				notify(`${LABELS[state.mode]} complete!`, state.mode === 'pomodoro' ? 'Time for a break!' : 'Back to work!')
			toast(`${LABELS[state.mode]} complete!`)
		}
	})

	useEffect(() => {
		if (settings.notificationsEnabled && 'Notification' in window && Notification.permission === 'default')
			Notification.requestPermission()
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
						<Button className='btn-ghost btn-circle' onClick={reset} title='Reset (R)'>
							<LuRefreshCw />
						</Button>
					)}
					<Button className='btn-lg' onClick={toggle}>
						{state.isRunning ? 'Pause' : 'Start'}
					</Button>
					{state.isRunning && (
						<Button className='btn-ghost btn-circle' onClick={skip} title='Skip (S)'>
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

createRoot(document.getElementById('root') as HTMLElement).render(<Root />)
