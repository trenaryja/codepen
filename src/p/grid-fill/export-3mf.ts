import { strToU8, zipSync } from 'https://esm.sh/fflate'
import { GF_PITCH, PRINT_BED_H, PRINT_BED_MARGIN } from './constants'
import type { Recipe } from './recipes'

export const parseSTL = (buf: ArrayBuffer) => {
	const view = new DataView(buf)
	const count = view.getUint32(80, true)
	const vertMap = new Map<string, number>()
	const verts: [number, number, number][] = []
	const tris: [number, number, number][] = []

	const vertexIndex = (start: number) => {
		const vertex: [number, number, number] = [
			view.getFloat32(start, true),
			view.getFloat32(start + 4, true),
			view.getFloat32(start + 8, true),
		]
		const key = vertex.join(',')
		let index = vertMap.get(key)

		if (index === undefined) {
			index = verts.length
			vertMap.set(key, index)
			verts.push(vertex)
		}

		return index
	}

	for (let i = 0; i < count; i++) {
		const base = 84 + i * 50 + 12
		tris.push([vertexIndex(base), vertexIndex(base + 12), vertexIndex(base + 24)])
	}

	return { verts, tris }
}

export const build3mf = async (recipe: Recipe): Promise<Blob> => {
	const uniqueSizes = [...new Set(recipe.layout.map((b) => b.key))]
	const geoms = new Map<string, ReturnType<typeof parseSTL>>()
	await Promise.all(
		uniqueSizes.map(async (key) => {
			const buf = await fetch(`/gridfinity/bin_${key.replace('×', 'x')}.stl`).then((r) => r.arrayBuffer())
			geoms.set(key, parseSTL(buf))
		}),
	)

	let xml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
 <resources>\n`

	const sizeId = new Map(uniqueSizes.map((k, i) => [k, i + 1]))

	for (const [key, { verts, tris }] of geoms) {
		xml += `  <object id="${sizeId.get(key)}" type="model">\n   <mesh>\n    <vertices>\n`
		for (const [vertexX, vertexY, vertexZ] of verts)
			xml += `     <vertex x="${vertexX.toFixed(4)}" y="${vertexY.toFixed(4)}" z="${vertexZ.toFixed(4)}"/>\n`
		xml += `    </vertices>\n    <triangles>\n`
		for (const [v1, v2, v3] of tris) xml += `     <triangle v1="${v1}" v2="${v2}" v3="${v3}"/>\n`
		xml += `    </triangles>\n   </mesh>\n  </object>\n`
	}

	const N = uniqueSizes.length

	for (const [i, bin] of recipe.layout.entries()) {
		// STL stores the larger dimension along X; portrait bins (w<h) need 90° CW so STL-X→bed-Y.
		const rotation = bin.w < bin.h ? '0 1 0 -1 0 0 0 0 1 0 0 0' : '1 0 0 0 1 0 0 0 1 0 0 0'
		xml += `  <object id="${N + i + 1}" type="model">\n   <components>\n    <component objectid="${sizeId.get(bin.key)}" transform="${rotation}"/>\n   </components>\n  </object>\n`
	}

	xml += ` </resources>\n <build>\n`

	for (const [i, bin] of recipe.layout.entries()) {
		const tx = PRINT_BED_MARGIN + bin.x * GF_PITCH + (bin.w * GF_PITCH) / 2
		const ty = PRINT_BED_H - PRINT_BED_MARGIN - bin.y * GF_PITCH - (bin.h * GF_PITCH) / 2
		xml += `  <item objectid="${N + i + 1}" transform="1 0 0 0 1 0 0 0 1 ${tx.toFixed(4)} ${ty.toFixed(4)} 0" printable="1"/>\n`
	}

	xml += ` </build>\n</model>`

	const zip = zipSync({
		'[Content_Types].xml': strToU8(
			`<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n</Types>`,
		),
		'_rels/.rels': strToU8(
			`<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="https://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n</Relationships>`,
		),
		'3D/3dmodel.model': strToU8(xml),
	})
	return new Blob([zip], { type: 'model/3mf' })
}
