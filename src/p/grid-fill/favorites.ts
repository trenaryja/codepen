import { useState } from 'https://esm.sh/react'
import { z } from 'https://esm.sh/zod'

export const useFavorites = () => {
	const [favorites, setFavorites] = useState<Set<string>>(() => {
		try {
			const stored = localStorage.getItem('grid-fill:favorites')
			return new Set(stored ? z.array(z.string()).parse(JSON.parse(stored)) : [])
		} catch {
			return new Set<string>()
		}
	})
	const toggleFavorite = (key: string) =>
		setFavorites((prev) => {
			const next = new Set(prev)
			if (next.has(key)) next.delete(key)
			else next.add(key)
			localStorage.setItem('grid-fill:favorites', JSON.stringify([...next]))
			return next
		})
	return { favorites, toggleFavorite }
}
