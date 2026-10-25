import { ThemeProvider } from 'https://esm.sh/@trenaryja/ui'
import { parseAsString, parseAsStringLiteral, useQueryState } from 'https://esm.sh/nuqs'
import { NuqsAdapter } from 'https://esm.sh/nuqs/adapters/react'
import React, { useEffect, useRef, useState } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'
import * as R from 'https://esm.sh/remeda'
import { BandsView } from './bands'
import {
	DEFAULTS,
	type Settings,
	SettingsContext,
	VIEWS,
	applyDetection,
	readOrigin,
	startEntries,
	toPlaces,
	usePersistence,
} from './board'
import { AddPlaceButton, BoardHeader, KeyboardHints, ListView, SearchDialog, useSearch } from './board-chrome'
import { fallbackCity, useDetectedCity } from './location'
import { useScrubber } from './scrubber'
import type { City } from './time'
import { useWeather } from './weather'

const App = () => {
	// The board and the view are shareable, so they ride in the URL; the rest are your preferences and stay
	// on this device. Replace, not push — thirty scrubs shouldn't cost thirty presses of the back button
	const [cities, setCities] = useQueryState('cities', parseAsString.withOptions({ history: 'replace' }))
	const [viewParam, setViewParam] = useQueryState(
		'view',
		parseAsStringLiteral(VIEWS).withOptions({ history: 'replace' }),
	)
	// A link's board is read once, at mount: from here on the URL mirrors state rather than driving it
	const origin = useRef(readOrigin(cities, viewParam)).current

	const [now, setNow] = useState(() => Date.now())
	const [scrubbed, setScrubbed] = useState<number | null>(null)
	const [places, setPlaces] = useState(() => toPlaces(startEntries(origin, fallbackCity)))
	const [preferences, setPreferences] = useState(origin.preferences)
	const [view, setView] = useState(origin.view)
	const { searchMode, query, setQuery, searchInputRef, openSearch, closeSearch } = useSearch()
	const [expandedIds, setExpandedIds] = useState<string[]>([])

	const { detected, pending: detectPending } = useDetectedCity()
	// Adjusting state during render (not in an effect) is the React-sanctioned shape for this,
	// same as useCitySearch above
	const [appliedDetection, setAppliedDetection] = useState(detected)

	if (origin.seeded && appliedDetection !== detected) {
		setAppliedDetection(detected)
		setPlaces(applyDetection(places, detected))
	}

	const reference = places[0]?.city ?? fallbackCity
	const instant = scrubbed ?? now
	const { weather, ready: weatherReady } = useWeather(
		places.map((place) => place.city),
		preferences.fahrenheit,
	)

	const { animateTo, scrubToWall } = useScrubber({
		now,
		instant,
		referenceTimeZone: reference.timeZone,
		searchOpen: searchMode !== null,
		onScrub: setScrubbed,
		onCloseSearch: closeSearch,
	})

	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), 1000)
		return () => clearInterval(id)
	}, [])

	usePersistence({ origin, places, detected, preferences, view, cities, setCities })

	useEffect(() => {
		void setViewParam(view === DEFAULTS.view ? null : view)
	}, [view, setViewParam])

	const pickCity = (city: City) => {
		if (searchMode?.kind === 'place')
			setPlaces(
				places.map((place) =>
					place.id === searchMode.id
						? {
								...place,
								city,
								// a label that was just echoing the old city follows the move; a person's name stays
								label: place.label.toLowerCase() === place.city.name.toLowerCase() ? city.name : place.label,
							}
						: place,
				),
			)
		else setPlaces([...places, { id: R.randomString(21), label: city.name, city }])
		closeSearch()
	}

	const settings: Settings = {
		...preferences,
		instant,
		reference,
		weather,
		weatherReady,
		scrubToWall,
		rename: (id, label) => setPlaces(places.map((place) => (place.id === id ? { ...place, label } : place))),
		remove: (id) => setPlaces(places.filter((place) => place.id !== id)),
	}

	return (
		<ThemeProvider>
			<SettingsContext value={settings}>
				<div className='flex min-h-dvh flex-col'>
					<BoardHeader
						view={view}
						onView={setView}
						places={places}
						preferences={preferences}
						onPreferences={(patch) => setPreferences({ ...preferences, ...patch })}
						expandedIds={expandedIds}
						onExpandedIds={setExpandedIds}
					/>

					{view === 'bands' ? (
						<BandsView places={places} now={now} scrubbed={scrubbed} onScrub={setScrubbed} onSettle={animateTo} />
					) : (
						<ListView
							places={places}
							now={now}
							scrubbed={scrubbed}
							expandedIds={expandedIds}
							onSettle={animateTo}
							onExpandedIds={setExpandedIds}
							onReorder={setPlaces}
							onEditLocation={(place) => openSearch({ kind: 'place', id: place.id }, place.city.name)}
						/>
					)}

					<KeyboardHints />

					<AddPlaceButton shown={view === 'list' || !places.length} onClick={() => openSearch({ kind: 'add' })} />

					{searchMode !== null && (
						<SearchDialog
							query={query}
							onQuery={setQuery}
							now={now}
							hour12={preferences.hour12}
							detected={detected}
							detectPending={detectPending}
							onPick={pickCity}
							onClose={closeSearch}
							inputRef={searchInputRef}
						/>
					)}
				</div>
			</SettingsContext>
		</ThemeProvider>
	)
}

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('#root is missing from index.html')
createRoot(rootElement).render(
	<NuqsAdapter>
		<App />
	</NuqsAdapter>,
)
