import React, { useEffect, useReducer, useState } from 'https://esm.sh/react'
import {
	WiCloudy,
	WiDayCloudy,
	WiDaySunny,
	WiFog,
	WiNightAltCloudy,
	WiNightClear,
	WiRain,
	WiShowers,
	WiSnow,
	WiSprinkle,
	WiThunderstorm,
} from 'https://esm.sh/react-icons/wi'
import * as R from 'https://esm.sh/remeda'
import { z } from 'https://esm.sh/zod'
import { type City, fetchJson, isUtc, round, weekdayOf } from './time'

export type Weather = { temperature: number; code: number; feelsLike: number }

export const weatherKey = (city: City) => `${city.latitude.toFixed(2)},${city.longitude.toFixed(2)}`

const weatherIcon = (code: number, day: boolean) => {
	if (code === 0) return day ? WiDaySunny : WiNightClear
	if (code <= 2) return day ? WiDayCloudy : WiNightAltCloudy
	if (code === 3) return WiCloudy
	if (code === 45 || code === 48) return WiFog
	if (code < 60) return WiSprinkle
	if (code < 70) return WiRain
	if (code < 80) return WiSnow
	if (code < 85) return WiShowers
	if (code < 95) return WiSnow
	return WiThunderstorm
}

// Render helper: picking one of the static react-icons components is a lookup, not a component creation
export const weatherGlyph = (code: number, day: boolean, className: string) => {
	const Icon = weatherIcon(code, day)

	return <Icon className={className} />
}

const currentWeatherSchema = z.object({
	current: z
		.object({ temperature_2m: z.number(), weather_code: z.number(), apparent_temperature: z.number() })
		.optional(),
})

// Live weather from open-meteo; no API key required.
const fetchWeather = async (keys: string[], fahrenheit: boolean) => {
	const coords = (index: number) => keys.map((key) => key.split(',')[index]).join(',')
	const parsed = await fetchJson(
		`https://api.open-meteo.com/v1/forecast?latitude=${coords(0)}&longitude=${coords(1)}&current=temperature_2m,weather_code,apparent_temperature${fahrenheit ? '&temperature_unit=fahrenheit' : ''}`,
		z.union([z.array(currentWeatherSchema), currentWeatherSchema]),
	)
	const list = Array.isArray(parsed) ? parsed : [parsed]
	const next: Record<string, Weather> = {}
	for (const [key, { current }] of R.zip(keys, list))
		if (current)
			next[key] = {
				temperature: current.temperature_2m,
				code: current.weather_code,
				feelsLike: current.apparent_temperature,
			}
	return next
}

export const useWeather = (cities: City[], fahrenheit: boolean) => {
	const [weather, setWeather] = useState<Record<string, Weather>>({})
	const [ready, setReady] = useState(false)
	const signature = cities
		.filter((city) => !isUtc(city))
		.map(weatherKey)
		.join(';')

	useEffect(() => {
		if (!signature) return
		let cancelled = false
		const keys = signature.split(';')

		const load = () =>
			fetchWeather(keys, fahrenheit)
				.then((next) => {
					if (!cancelled) setWeather(next)
				})
				// weather is decoration — fail silent, cards just omit it
				.catch(() => undefined)
				.finally(() => {
					if (!cancelled) setReady(true)
				})

		void load()
		const id = setInterval(() => void load(), 15 * 60_000)

		return () => {
			cancelled = true
			clearInterval(id)
		}
	}, [signature, fahrenheit])

	return { weather, ready }
}

// Forecast is fetched per city per mode, on first expand.
// One cell shape serves both modes: hourly = temp + rain %, daily = high (primary) / low (secondary) + rain %
type ForecastCell = {
	time: string
	label: string
	code: number
	day: boolean
	primary: string
	secondary?: string
	precip: number
}

export const FORECAST_MODES = ['daily', 'hourly'] as const
type ForecastMode = (typeof FORECAST_MODES)[number]

const FORECAST_FIELDS: Record<ForecastMode, string> = {
	hourly: 'hourly=temperature_2m,weather_code,precipitation_probability,is_day&forecast_hours=12',
	daily: 'daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=7',
}
const forecastCache = new Map<string, ForecastCell[]>()

const forecastBlockSchema = z.record(z.string(), z.array(z.unknown())).optional()

export const useForecast = (city: City, fahrenheit: boolean, mode: ForecastMode) => {
	const [, bump] = useReducer((count: number) => count + 1, 0)
	const key = `${weatherKey(city)}:${fahrenheit}:${mode}`

	useEffect(() => {
		if (forecastCache.has(key)) return
		let cancelled = false

		const load = async () => {
			try {
				const parsed = await fetchJson(
					`https://api.open-meteo.com/v1/forecast?latitude=${city.latitude}&longitude=${city.longitude}&${FORECAST_FIELDS[mode]}&timezone=auto${fahrenheit ? '&temperature_unit=fahrenheit' : ''}`,
					z.object({ hourly: forecastBlockSchema, daily: forecastBlockSchema }),
				)
				const block = parsed[mode] ?? {}
				const at = (field: string, index: number) => round(block[field]?.[index])
				const hourly = mode === 'hourly'
				forecastCache.set(
					key,
					(block.time ?? []).map(String).map((time, index) => ({
						time,
						// hourly labels depend on the 12/24h setting, so ForecastPanel derives them from `time` at render
						label: index === 0 ? (hourly ? 'now' : 'today') : hourly ? '' : weekdayOf(time),
						code: at('weather_code', index),
						day: !hourly || at('is_day', index) === 1,
						primary: `${at(hourly ? 'temperature_2m' : 'temperature_2m_max', index)}°`,
						secondary: hourly ? undefined : `${at('temperature_2m_min', index)}°`,
						precip: at(hourly ? 'precipitation_probability' : 'precipitation_probability_max', index),
					})),
				)
			} catch {
				forecastCache.set(key, []) // failed — panel just shows nothing
			}

			if (!cancelled) bump()
		}

		void load()

		return () => {
			cancelled = true
		}
	}, [key, city, fahrenheit, mode])

	const cells = forecastCache.get(key)
	return { cells, loading: cells === undefined }
}
