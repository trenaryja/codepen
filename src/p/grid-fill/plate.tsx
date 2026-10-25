import { Button, colorMix, Field, interpolateColors, ThemePicker } from 'https://esm.sh/@trenaryja/ui'
import React, { useState } from 'https://esm.sh/react'
import { LuDownload, LuSlidersHorizontal } from 'https://esm.sh/react-icons/lu'
import * as R from 'https://esm.sh/remeda'
import { BIN_INSET, STOPS, SVG_CELL, SVG_PADDING } from './constants'
import { build3mf } from './export-3mf'
import { Stepper } from './migrate-to-ui'
import { type Bin, type Recipe, byFamily, encodeRecipe } from './recipes'

export const ExportButton = ({ recipe, W, H }: { recipe: Recipe | null; W: number; H: number }) => {
	const [busy, setBusy] = useState(false)

	const download = async () => {
		if (!recipe) return
		setBusy(true)
		await Promise.resolve() // yield to event loop so React can flush busy state before build3mf blocks

		try {
			const blob = await build3mf(recipe)
			const url = URL.createObjectURL(blob)
			const a = document.createElement('a')
			a.href = url
			a.download = `gridfinity_${encodeRecipe(recipe.counts, W, H)}.3mf`
			a.click()
			URL.revokeObjectURL(url)
		} catch (error) {
			console.error('3MF export failed:', error)
		}
		setBusy(false)
	}

	return (
		<Button className='btn-square' onClick={() => void download()} disabled={busy || !recipe} title='Download 3MF'>
			<LuDownload />
		</Button>
	)
}

export const PlateBin = ({ bin, base }: { bin: Bin; base: string }) => {
	const x = SVG_PADDING + bin.x * SVG_CELL + BIN_INSET
	const y = SVG_PADDING + bin.y * SVG_CELL + BIN_INSET
	const w = bin.w * SVG_CELL - 2 * BIN_INSET
	const h = bin.h * SVG_CELL - 2 * BIN_INSET
	return (
		<g>
			<rect
				x={x}
				y={y}
				width={w}
				height={h}
				rx={6}
				fill={colorMix({ color1: base, color2: 'var(--color-base-100)', ratio: 10 })}
				stroke={base}
			/>
			<text
				x={x + w / 2}
				y={y + h / 2}
				textAnchor='middle'
				dominantBaseline='central'
				fontSize={SVG_CELL / 3}
				fontWeight={500}
				fill={colorMix({ color1: base, color2: 'var(--color-base-content)', ratio: 50 })}
			>
				{`${bin.w}×${bin.h}`}
			</text>
		</g>
	)
}

export const PlateSvg = ({ layout, W, H }: { layout: Bin[]; W: number; H: number }) => {
	const viewBoxWidth = SVG_CELL * W + 2 * SVG_PADDING
	const viewBoxHeight = SVG_CELL * H + 2 * SVG_PADDING
	const keys = R.unique(layout.map((bin) => bin.key)).toSorted(byFamily)
	const baseOf = (size: string) =>
		interpolateColors(keys.length > 1 ? keys.indexOf(size) / (keys.length - 1) : 0, STOPS)
	return (
		<svg viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`} className='self-center'>
			<title>Plate layout</title>
			{layout.map((bin) => (
				<PlateBin key={`${bin.x}-${bin.y}`} bin={bin} base={baseOf(bin.key)} />
			))}
		</svg>
	)
}

export type ControlBarProps = {
	W: number
	H: number
	onWidthChange: (value: number) => void
	onDepthChange: (value: number) => void
	recipe: Recipe | null
	filtersActive: boolean
}

export const ControlBar = ({ W, H, onWidthChange, onDepthChange, recipe, filtersActive }: ControlBarProps) => (
	<section className='flex flex-wrap items-center justify-center gap-2 p-4'>
		<div className='flex gap-4'>
			<Field labelPlacement='top-center' label='Width'>
				<Stepper value={W} min={2} max={6} classNames={{ button: 'btn-sm' }} onChange={onWidthChange} />
			</Field>
			<Field labelPlacement='top-center' label='Depth'>
				<Stepper value={H} min={2} max={6} classNames={{ button: 'btn-sm' }} onChange={onDepthChange} />
			</Field>
		</div>
		<div className='flex items-center gap-1'>
			<ThemePicker variant='popover' />
			<ExportButton recipe={recipe} W={W} H={H} />
			<label htmlFor='filter-drawer' className='btn btn-square indicator' title='Filters'>
				{filtersActive && <span className='indicator-item bg-primary size-2 rounded-full' />}
				<LuSlidersHorizontal />
			</label>
		</div>
	</section>
)
