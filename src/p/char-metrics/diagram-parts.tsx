import React from 'https://esm.sh/react'
import { ACCENT, FG, MONO } from './font-metrics'

export type Color = string

export const lineWidth = { strokeWidth: 1.5 }
export const monoLabel = { fontSize: 10.5, fontFamily: MONO }

export function HLine({
	y,
	width,
	color = ACCENT,
	label,
	dashed,
	side = 'right',
	alpha = 1,
}: {
	y: number
	width: number
	color?: Color
	label?: string | null
	dashed?: boolean
	side?: 'left' | 'right'
	alpha?: number
}) {
	return (
		<g opacity={alpha} stroke={color} fill={color}>
			<line x1={0} y1={y} x2={width} y2={y} {...lineWidth} strokeDasharray={dashed ? '4 5' : undefined} />
			{label && (
				<text
					x={side === 'right' ? width - 8 : 8}
					y={y - 4}
					{...monoLabel}
					textAnchor={side === 'right' ? 'end' : 'start'}
					stroke='none'
				>
					{label}
				</text>
			)}
		</g>
	)
}

export function VLine({
	x,
	height,
	color = ACCENT,
	label,
	dashed,
	alpha = 1,
}: {
	x: number
	height: number
	color?: Color
	label?: string | null
	dashed?: boolean
	alpha?: number
}) {
	return (
		<g opacity={alpha} stroke={color} fill={color}>
			<line x1={x} y1={0} x2={x} y2={height} {...lineWidth} strokeDasharray={dashed ? '4 5' : undefined} />
			{label && (
				<text x={x} y={12} fontSize={10} fontFamily={MONO} textAnchor='middle' stroke='none'>
					{label}
				</text>
			)}
		</g>
	)
}

export function HBracket({
	x1,
	x2,
	y,
	color = ACCENT,
	label,
	above = true,
	tick = 8,
}: {
	x1: number
	x2: number
	y: number
	color?: Color
	label?: string | null
	above?: boolean
	tick?: number
}) {
	const direction = above ? -1 : 1
	const signedTick = direction * tick
	return (
		<g stroke={color} fill={color}>
			<path
				d={`M${x1},${y - signedTick}V${y + signedTick}M${x1},${y}H${x2}M${x2},${y - signedTick}V${y + signedTick}`}
				{...lineWidth}
				fill='none'
			/>
			{label && (
				<text x={(x1 + x2) / 2} y={y + direction * (tick + 14)} {...monoLabel} textAnchor='middle' stroke='none'>
					{label}
				</text>
			)}
		</g>
	)
}

export function VBracket({
	x,
	y1,
	y2,
	color = ACCENT,
	label,
	right = true,
	tick = 7,
}: {
	x: number
	y1: number
	y2: number
	color?: Color
	label?: string | null
	right?: boolean
	tick?: number
}) {
	const direction = right ? 1 : -1
	const signedTick = direction * tick
	return (
		<g stroke={color} fill={color}>
			<path
				d={`M${x - signedTick},${y1}H${x + signedTick}M${x},${y1}V${y2}M${x - signedTick},${y2}H${x + signedTick}`}
				{...lineWidth}
				fill='none'
			/>
			{label && (
				<text
					x={x + direction * (tick + 4)}
					y={(y1 + y2) / 2 + 4}
					{...monoLabel}
					textAnchor={right ? 'start' : 'end'}
					stroke='none'
				>
					{label}
				</text>
			)}
		</g>
	)
}

export function Rect({
	x1,
	y1,
	x2,
	y2,
	color = ACCENT,
	fill = false,
	fillOpacity = 0.1,
	strokeWidth = 1.5,
	dashed,
}: {
	x1: number
	y1: number
	x2: number
	y2: number
	color?: Color
	fill?: boolean
	fillOpacity?: number
	strokeWidth?: number
	dashed?: boolean
}) {
	const box = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
	return (
		<>
			{fill && <rect {...box} fill={color} opacity={fillOpacity} />}
			<rect
				{...box}
				stroke={color}
				strokeWidth={strokeWidth}
				fill='none'
				strokeDasharray={dashed ? '3 4' : undefined}
			/>
		</>
	)
}

export function Char({
	text,
	font,
	x,
	baseline,
	alpha = 1,
	color = FG,
}: {
	text: string
	font: string
	x: number
	baseline: number
	alpha?: number
	color?: Color
}) {
	return (
		<text x={x} y={baseline} style={{ font }} fill={color} opacity={alpha} dominantBaseline='alphabetic'>
			{text}
		</text>
	)
}

export function Label({
	text,
	x,
	y,
	color = ACCENT,
	align = 'end',
	alpha = 1,
}: {
	text: string
	x: number
	y: number
	color?: Color
	align?: string
	alpha?: number
}) {
	const anchor = align === 'left' ? 'start' : align === 'center' ? 'middle' : 'end'
	return (
		<text x={x} y={y} fill={color} opacity={alpha} {...monoLabel} textAnchor={anchor} stroke='none'>
			{text}
		</text>
	)
}
