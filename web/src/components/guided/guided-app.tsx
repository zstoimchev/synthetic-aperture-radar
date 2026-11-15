'use client'

// The guided flood map (/explore): one flat map, one card, three steps after the landing, one main action each. Back
// and Next are quiet; "All layers" opens the free explorer. Every number on the card is read from a baked or
// hand-kept file at run time, with the field it comes from (see content/guided.ts for the files).
//
//   2  The official map said safe /    the streets that flooded in 2024 over the official zones, then one switch to the
//      Our simulation saw it           streets our simulation flags; any street tapped shows what each record says
//   3  NISAR sees more water           drag the line between Sentinel-1 and NISAR of the same evening, open water
//   4  Where the map said safe         the streets outside every official zone, over the zones: what our model found
//                                      there, how often its warnings there were right, against chance
//
// Out of the flow, opened from "All layers" (?screen=exam, ?screen=rain): the marsh model's test against EMSR935 (drag
// the line between our prediction and what happened) and its rain slider (one outline).
//
// ?film plays the streets step by itself, for the landing's film (scripts/landing_films.py records it frame by frame
// on the page's own clock): the streets appear over the official map, the card holds on its number, then it switches
// to our simulation. FILM below is its timing.

import 'maplibre-gl/dist/maplibre-gl.css'
import { ArrowLeft, ArrowRight, Layers, RotateCcw, X } from 'lucide-react'
import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ICV, PNOA } from '@/content/explore'
import { CHANNEL_M, COLORS, REVEAL_FADE_MS, REVEAL_MS, SCREENS, STEP3_METHODS, STEPS, STREET_TITLES, type StepKey, SWIPE_WATER } from '@/content/guided'
import { RainSlider } from '../explore/rain-slider'
import { SiteNav } from '../site-nav'
import { MapSwipe } from './map-swipe'
import './guided.css'

const maplibre =
	typeof window === 'undefined'
		? null
		: import('maplibre-gl').then((m) => {
				m.setWorkerUrl(`/maplibre/maplibre-gl-worker.mjs?v=${m.getVersion()}`)
				m.setMaxParallelImageRequests(16)
				m.prewarm()
				return m
			})

const ROOT = '/layers/guided'
type Num = { value: number; source: string }
/** one option of step 3's switch: which street property flags a street, and its numbers against key A */
type Method = {
	key: string
	label: string
	prop: string
	note: string | null
	drawn_from: string
	hit_rate_pct: Num
	precision_pct: Num
	flagged_km: Num
	exact: boolean | null
}
type StreetsIndex = {
	baked_utc: string
	files: Record<string, { file: string; bytes: number }>
	towns: string[]
	names: string[]
	zones: Record<string, string>
	reveal: { bins: number; rule: string }
	methods: Method[]
	numbers: Record<string, Num>
	marks: { radius_m: number; points: [number, number, number][]; source: string }
	sources: Record<string, string>
}
type Pic = { file: string; bytes?: number }
type SwipeItem = { date: string; nisar: Pic & { time_utc: string }; s1: Pic & { time_utc: string }; numbers: Record<string, { value: number; what: string; source: unknown[] }> }
type ViewsDoc = { baked_utc: string; bounds: [number, number, number, number]; views: { swipe?: { items: SwipeItem[] } } }
/** the swipe of step 4 with open water only on both sides (scripts/bake_swipe_open.py) */
type SwipeDoc = {
	baked_utc: string
	bounds: [number, number, number, number]
	nisar: Pic & { time_utc: string; product: string }
	s1: Pic & { time_utc: string; product: string }
	numbers: Record<string, { value: number; what: string; source: string[] }>
}
type ExploreDoc = { sites: { pego_oliva?: { nisar: { still?: { date: string; outline?: string; open_water_share: number; source: string } } | null } } }
/** 2026-10-28 as "28 Oct" */
const dayMonth = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
/** the dates of the Copernicus EMS imagery in the outline's description ("EMSR935 flooded_area, imagery 20 to 21 Oct 2026, ...") */
const emsImagery = (outline?: string) => outline?.match(/imagery ([^,]+?)(?: \d{4})?(?:,|$)/)?.[1] ?? null
type ExamDoc = {
	baked_utc: string
	bounds: [number, number, number, number]
	prediction: Pic
	happened: Pic
	hectares: { hit: number; false_alarm: number; missed: number }
	source: Record<string, string>
	rain: { file: string; stops: { rain_mm: number; ha: number; lead_days: number; warning: string | null; source: string }[]; source: Record<string, string> } | null
}
type ScoreDoc = {
	score: string
	help: string
	model_rain_fell: number
	model_forecast: number
	simple_rules: [number, number]
	next_exam: string
	by: string
	source: string
}

/** the last step: the rains of the street simulation, hand-kept in public/layers/guided/coming.json */
type ComingOption = {
	key: string
	label: string
	status: 'in' | 'arriving'
	found_pct: number | null
	really_flooded_pct: number | null
	flagged_km: number | null
	/** the property of streets_2024.json that flags this option's streets */
	streets: string
	/** the end of "of the flooded streets found ..." */
	found_text: string
	line: string
	source: string
}
/** the last step: the streets outside every official zone (coming.json "safe", from data/streets/results.json) */
type SafeDoc = { found_km: number; outside_km: number; precision_pct: number; chance_pct: number; run_minutes: number; line: string; small: string; source: string }
type ComingDoc = { options: ComingOption[]; ceiling: { text: string; pair: number[]; source: string }; closing: string; safe?: SafeDoc }

/** a tapped street: what each record says there (streets_2024.json, the water marks of streets.json) */
type Pick = {
	name: string
	town: string
	zone: string
	zoneCode: number
	/** our simulation: flagged (deeper than 0.3 m) and its median maximum depth (m, SIMULATED) */
	sim: boolean
	simDepth: number | null
	/** measured and mapped: the nearest water mark within 25 m (m), the Copernicus EMS flooded area, the UPV map */
	water: number | null
	ems: boolean
	upv: number | null
	upvIn: boolean
	/** graded buildings of EMSR773 within 25 m, and the worst grade (1 possibly damaged, 2 damaged, 3 destroyed) */
	buildings: number
	worst: number
	lngLat: [number, number]
}
const GRADES = ['', 'possibly damaged', 'damaged', 'destroyed']
type Extra = 'exam' | 'rain'
type At = { step: number; extra: Extra | null }

/** ?film: when each move of the film happens, in ms from the moment the map and the streets are in */
const FILM = { simulation: 7600, done: 13800 }

/** the 16 groups of the reveal, each its own layer, so a group fades in with one paint value */
const BINS = 16
const binLayer = (i: number) => `g-flood-${i}`
const BIN_LAYERS = Array.from({ length: BINS }, (_, i) => binLayer(i))
/** which map layers each step shows */
const STEP_LAYERS: Record<StepKey, string[]> = {
	streets: [],
	nisar: [],
	coming: ['g-zones-fill', 'g-s3-missed', 'g-s3-dry', 'g-s3-found'],
	exam: [],
	rain: ['g-rain-fill', 'g-rain-line'],
}
/** the streets step: over the official map (the reveal's groups, the zones as faint areas), or our simulation's */
const OFFICIAL_LAYERS = ['g-zones-fill', 'g-zones-line', ...BIN_LAYERS]
const SIM_LAYERS = ['g-s3-missed', 'g-s3-dry', 'g-s3-found']
const ALL_LAYERS = [...new Set([...Object.values(STEP_LAYERS).flat(), ...OFFICIAL_LAYERS, ...SIM_LAYERS, 'g-pick'])]
/** a street piece of streets_2024.json that flooded (key A), and one a method flags (its property above 0) */
const FLOODED = ['==', ['coalesce', ['get', 'f'], 0], 1]
const flagged = (prop: string) => ['>', ['coalesce', ['get', prop], 0], 0]
/** a filter that keeps nothing (a bare ['==', 1, 0] reads as the old filter syntax and is refused) */
const NOTHING = ['literal', false]
/** a street piece outside every official flood zone */
const OUTSIDE = ['==', ['coalesce', ['get', 'z'], 0], 0]
/** the streets a method flags, green or red, and the flooded streets it missed, blue; with no method (its streets
 *  are still arriving), the flooded streets alone */
const s3Filters = (prop: string | null) =>
	prop
		? {
				'g-s3-found': ['all', FLOODED, flagged(prop)],
				'g-s3-missed': ['all', FLOODED, ['!', flagged(prop)]],
				'g-s3-dry': ['all', ['!', FLOODED], flagged(prop)],
			}
		: { 'g-s3-found': NOTHING, 'g-s3-missed': FLOODED, 'g-s3-dry': NOTHING }
const lineWidth = (k = 1) => ['interpolate', ['exponential', 1.6], ['zoom'], 11, 0.9 * k, 13, 1.8 * k, 15, 3.4 * k, 17, 6.5 * k, 18.6, 10 * k] as never

const pct = (v: number) => `${Math.round(v)}%`
/** a method's label inside a sentence: "Official map" is "the official map", "Our simulation" is "our simulation" */
const sentence = (label: string) => {
	const l = label.charAt(0).toLowerCase() + label.slice(1)
	return /^(our|the|a|an) /.test(l) ? l : `the ${l}`
}
const ha = (v: number) => Math.round(v).toLocaleString('en-US')
const f2 = (v: number) => v.toFixed(2)
const timeOf = (iso: string) => iso.slice(11, 16)
const minutesApart = (a: string, b: string) => Math.round(Math.abs(Date.parse(a) - Date.parse(b)) / 60000)

/** metres between two points, close together (equirectangular) */
function metres(a: [number, number], b: [number, number]) {
	const k = Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180))
	return Math.hypot((a[0] - b[0]) * 111320 * k, (a[1] - b[1]) * 110540)
}
/** the point of a line nearest to p */
function snap(p: [number, number], line: number[][]): [number, number] {
	let best: [number, number] = [line[0][0], line[0][1]]
	let dBest = Infinity
	const k = Math.cos(p[1] * (Math.PI / 180))
	for (let i = 0; i < line.length - 1; i++) {
		const ax = line[i][0] * k
		const ay = line[i][1]
		const bx = line[i + 1][0] * k
		const by = line[i + 1][1]
		const px = p[0] * k
		const py = p[1]
		const dx = bx - ax
		const dy = by - ay
		const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0
		const q: [number, number] = [(ax + t * dx) / k, ay + t * dy]
		const d = metres(p, q)
		if (d < dBest) {
			dBest = d
			best = q
		}
	}
	return best
}

/** where the address asks to start: ?step=2 to 5 (the numbers of the pitch: the landing is step 1), or a screen out
 *  of the flow, ?screen=exam or ?screen=rain */
function firstAt(): At {
	if (typeof window === 'undefined') return { step: 0, extra: null }
	const q = new URLSearchParams(window.location.search)
	if (q.has('film')) return { step: 0, extra: null }
	const screen = q.get('screen')
	if (screen === 'exam' || screen === 'rain') return { step: 0, extra: screen }
	const n = Number(q.get('step'))
	return { step: n >= 2 && n <= STEPS.length + 1 ? n - 2 : 0, extra: null }
}

async function getJson<T>(url: string): Promise<T> {
	const r = await fetch(url)
	if (!r.ok) throw new Error(`${url}: ${r.status}`)
	return (await r.json()) as T
}

export function GuidedApp({ onAllLayers }: { onAllLayers: () => void }) {
	const mapEl = useRef<HTMLDivElement>(null)
	const cardRef = useRef<HTMLElement>(null)
	const [map, setMap] = useState<MapLibreMap | null>(null)
	const [ready, setReady] = useState(false)
	const [at, setAt] = useState<At>(firstAt)
	/** ?film: the streets step plays by itself (the landing's film) */
	const [film] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('film'))
	const [filmReady, setFilmReady] = useState(false)
	const step = at.step
	const [error, setError] = useState<string | null>(null)
	const [sources, setSources] = useState(false)
	// a phone: the card is a bottom sheet, open or lowered to its title row (peek); the choice holds across steps
	const [peek, setPeek] = useState(false)
	const titleRef = useRef<HTMLHeadingElement>(null)
	const sheetDrag = useRef<{ y0: number; base: number; max: number; moved: boolean; last: number; lastT: number; vy: number } | null>(null)
	const justDragged = useRef(false)

	const [streets, setStreets] = useState<StreetsIndex | null>(null)
	const [views, setViews] = useState<ViewsDoc | null>(null)
	const [swipe, setSwipe] = useState<SwipeDoc | null>(null)
	const [explore, setExplore] = useState<ExploreDoc | null>(null)
	const [exam, setExam] = useState<ExamDoc | null>(null)
	const [score, setScore] = useState<ScoreDoc | null>(null)
	const [coming, setComing] = useState<ComingDoc | null>(null)

	const [pick, setPick] = useState<Pick | null>(null)
	const [methodKey, setMethod] = useState<string | null>(null)
	const [rainIdx, setRainIdx] = useState(2)

	const s = at.extra ? SCREENS.find((x) => x.key === at.extra)! : STEPS[step]
	const key = s.key

	// ---------------------------------------------------------------- the step in the address, so a step can be shared
	useEffect(() => {
		const url = new URL(window.location.href)
		url.searchParams.delete('all')
		if (at.extra) {
			url.searchParams.set('screen', at.extra)
			url.searchParams.delete('step')
		} else {
			url.searchParams.set('step', String(at.step + 2))
			url.searchParams.delete('screen')
		}
		window.history.replaceState(null, '', url)
	}, [at])

	// ---------------------------------------------------------------- the files, each when its step first needs it
	useEffect(() => {
		const fail = (e: Error) => setError(e.message)
		if ((key === 'streets' || key === 'coming') && !streets) getJson<StreetsIndex>(`${ROOT}/streets.json`).then(setStreets).catch(fail)
		if (key === 'coming' && !coming) getJson<ComingDoc>(`${ROOT}/coming.json`).then(setComing).catch(fail)
		if (key === 'nisar' && SWIPE_WATER === 'any' && !views) getJson<ViewsDoc>('/layers/pego_oliva/views.json').then(setViews).catch(fail)
		if (key === 'nisar' && SWIPE_WATER === 'open' && !swipe) getJson<SwipeDoc>(`${ROOT}/swipe.json`).then(setSwipe).catch(fail)
		if (key === 'nisar' && !explore) getJson<ExploreDoc>('/layers/explore/explore.json').then(setExplore).catch(fail)
		if ((key === 'exam' || key === 'rain') && !exam) getJson<ExamDoc>(`${ROOT}/exam.json`).then(setExam).catch(fail)
		if ((key === 'exam' || key === 'rain') && !score) getJson<ScoreDoc>(`${ROOT}/test_score.json`).then(setScore).catch(fail)
	}, [key, streets, views, swipe, explore, exam, score, coming])

	// ---------------------------------------------------------------- the map
	useEffect(() => {
		if (!mapEl.current) return
		let m: MapLibreMap | null = null
		let gone = false
		;(async () => {
			const { Map } = await (maplibre ?? import('maplibre-gl'))
			if (gone || !mapEl.current) return
			m = new Map({
				container: mapEl.current,
				style: {
					version: 8,
					sources: {
						pnoa: { type: 'raster', tiles: [PNOA.tiles], tileSize: 256, maxzoom: PNOA.maxzoom, attribution: PNOA.credit },
						icv: { type: 'raster', tiles: [ICV.tiles], tileSize: 256, maxzoom: ICV.maxzoom, attribution: ICV.credit },
					},
					layers: [
						{ id: 'pnoa', type: 'raster', source: 'pnoa', paint: { 'raster-saturation': -0.35, 'raster-brightness-max': 0.82 } },
						{ id: 'icv', type: 'raster', source: 'icv', layout: { visibility: 'none' }, paint: { 'raster-saturation': -0.35, 'raster-brightness-max': 0.82 } },
					],
				},
				bounds: firstAt().extra ? SCREENS[0].view : STEPS[0].view,
				fitBoundsOptions: { padding: 40 },
				minZoom: 8,
				maxZoom: 18.6,
				pitch: 0,
				maxPitch: 0,
				dragRotate: false,
				pitchWithRotate: false,
				attributionControl: { compact: true },
			})
			m.touchZoomRotate.disableRotation()
			// the official photographs first; should their server fail, the Valencian ones
			let failed = 0
			m.on('error', (e) => {
				if ((e as unknown as { sourceId?: string }).sourceId === 'pnoa' && ++failed === 4 && m) {
					m.setLayoutProperty('pnoa', 'visibility', 'none')
					m.setLayoutProperty('icv', 'visibility', 'visible')
				}
			})
			m.once('style.load', () => {
				if (gone || !m) return
				// on a phone the photo credit folds into its (i) button, so it does not cover the map (MapLibre opens it
				// once its sources have loaded: fold it then too)
				const fold = () => {
					if (window.innerWidth < 900) mapEl.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
				}
				fold()
				m.once('idle', fold)
				setMap(m)
				setReady(true)
			})
		})()
		return () => {
			gone = true
			m?.remove()
			setMap(null)
			setReady(false)
		}
	}, [])

	/** room the card takes on screen: the map frames each step in what is left */
	const padding = useCallback(() => {
		const el = cardRef.current
		const w = window.innerWidth
		const h = window.innerHeight
		if (!el) return 40
		const r = el.getBoundingClientRect()
		if (w >= 900) return { top: 70, bottom: 40, left: Math.min(w * 0.6, r.right + 24), right: 40 }
		return { top: 64, bottom: Math.min(h * 0.62, h - r.top + 16), left: 16, right: 16 }
	}, [])

	// each step frames its own ground
	const view = s.view
	const firstView = useRef(true)
	useEffect(() => {
		if (!map || !ready) return
		map.fitBounds(view, { padding: padding(), duration: firstView.current ? 0 : 1600, essential: true })
		firstView.current = false
	}, [map, ready, view, padding])

	// ---------------------------------------------------------------- the street layers (the streets step and the last one)
	useEffect(() => {
		if (!map || !ready || !streets || map.getSource('g-streets')) return
		const v = `?v=${encodeURIComponent(streets.baked_utc)}`
		map.addSource('g-zones', { type: 'geojson', data: `${ROOT}/${streets.files.zones.file}${v}` })
		map.addSource('g-streets', { type: 'geojson', data: `${ROOT}/${streets.files.streets.file}${v}` })
		map.addSource('g-pick', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
		const hidden = { visibility: 'none' as const }
		map.addLayer({ id: 'g-zones-line', type: 'line', source: 'g-zones', layout: hidden, paint: { 'line-color': COLORS.zone, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 16, 2.4] as never, 'line-opacity': 0.95 } })
		const street = { 'line-color': ['case', ['>', ['coalesce', ['get', 'z'], 0], 0], COLORS.hit, COLORS.flooded], 'line-width': lineWidth(), 'line-opacity': 0 }
		map.addLayer({ id: 'g-zones-fill', type: 'fill', source: 'g-zones', layout: hidden, paint: { 'fill-color': COLORS.zone, 'fill-opacity': 0.13 } }, 'g-zones-line')
		for (let i = 0; i < BINS; i++) {
			map.addLayer({ id: binLayer(i), type: 'line', source: 'g-streets', filter: ['==', ['get', 'r'], i], layout: { ...hidden, 'line-cap': 'round', 'line-join': 'round' }, paint: street as never })
		}
		// step 3: the streets the chosen method flags, green where they flooded, red where no official record shows water (the UPV street map mostly does), and the
		// flooded streets it missed in blue
		const line = { ...hidden, 'line-cap': 'round' as const, 'line-join': 'round' as const }
		const first = s3Filters(streets.methods[0]?.prop ?? 'z')
		map.addLayer({ id: 'g-s3-missed', type: 'line', source: 'g-streets', filter: first['g-s3-missed'] as never, layout: line, paint: { 'line-color': COLORS.flooded, 'line-width': lineWidth(), 'line-opacity': 0.9 } })
		map.addLayer({ id: 'g-s3-dry', type: 'line', source: 'g-streets', filter: first['g-s3-dry'] as never, layout: line, paint: { 'line-color': COLORS.falseAlarm, 'line-width': lineWidth(), 'line-opacity': 0.95 } })
		map.addLayer({ id: 'g-s3-found', type: 'line', source: 'g-streets', filter: first['g-s3-found'] as never, layout: line, paint: { 'line-color': COLORS.hit, 'line-width': lineWidth(1.15), 'line-opacity': 1 } })
		map.addLayer({ id: 'g-pick', type: 'line', source: 'g-pick', layout: { ...hidden, 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': lineWidth(2.2), 'line-opacity': 0.95 } })
		// what a tap reads: every street drawn, wide and unseen
		map.addLayer({ id: 'g-hit', type: 'line', source: 'g-streets', paint: { 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 10, 16, 22] as never, 'line-opacity': 0 } })
	}, [map, ready, streets])

	// the rain outlines (the marsh model's rain screen)
	useEffect(() => {
		if (!map || !ready || !exam?.rain || map.getSource('g-rain')) return
		map.addSource('g-rain', { type: 'geojson', data: `${ROOT}/${exam.rain.file}?v=${encodeURIComponent(exam.baked_utc)}` })
		map.addLayer({ id: 'g-rain-fill', type: 'fill', source: 'g-rain', layout: { visibility: 'none' }, paint: { 'fill-color': COLORS.rain, 'fill-opacity': 0.16 } })
		map.addLayer({ id: 'g-rain-line', type: 'line', source: 'g-rain', layout: { visibility: 'none', 'line-join': 'round' }, paint: { 'line-color': COLORS.rain, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 16, 3] as never } })
	}, [map, ready, exam])

	const methods = useMemo(() => (streets?.methods ?? []).filter((m) => STEP3_METHODS.includes(m.key)), [streets])
	const method = methods.find((m) => m.key === methodKey) ?? methods[0] ?? null

	// which layers show, step by step (a step change moves the camera anyway). In the streets step the official map and
	// our simulation are both laid out, and the switch between them only fades their opacity (below): turning a
	// layer's visibility on or changing its filter makes MapLibre lay its source out again, which dropped frames on
	// every switch
	useEffect(() => {
		if (!map || !ready) return
		const on = new Set(STEP_LAYERS[key])
		if (key === 'streets') for (const id of [...OFFICIAL_LAYERS, ...SIM_LAYERS]) on.add(id)
		if (key === 'streets' && pick) on.add('g-pick')
		for (const id of ALL_LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on.has(id) ? 'visible' : 'none')
		if (map.getLayer('g-hit')) map.setLayoutProperty('g-hit', 'visibility', key === 'streets' ? 'visible' : 'none')
	}, [map, ready, key, pick, streets, exam])

	// the switch of the streets step: the official map (its zones and the flooded streets) or our simulation's streets,
	// by opacity only; MapLibre fades it in 300 ms. The last step shows the simulation's streets of the chosen rain.
	const officialOn = useRef(true)
	const revealDone = useRef(false)
	useEffect(() => {
		if (!map || !ready || !map.getLayer('g-s3-found')) return
		const official = key === 'streets' && method?.key !== 'sim'
		officialOn.current = official
		const opacity: [string, string, number][] = [
			['g-zones-fill', 'fill-opacity', official ? 0.13 : key === 'coming' ? 0.1 : 0],
			['g-zones-line', 'line-opacity', official ? 0.95 : 0],
			['g-s3-missed', 'line-opacity', official ? 0 : 0.9],
			['g-s3-dry', 'line-opacity', official ? 0 : 0.95],
			['g-s3-found', 'line-opacity', official ? 0 : 1],
		]
		for (const [id, prop, v] of opacity) map.setPaintProperty(id, prop as 'line-opacity', v)
		// the flooded streets of the official map: the reveal draws them in when the step opens; after it, the switch
		if (revealDone.current) for (const id of BIN_LAYERS) map.setPaintProperty(id, 'line-opacity', official ? 1 : 0)
	}, [map, ready, key, method, streets])

	// the streets step: the chosen method's streets
	const simProp = methods.find((m) => m.key === 'sim')?.prop ?? null
	// the last step: our simulation's streets, outside every official zone only
	const s3Prop = simProp
	const outsideOnly = key === 'coming'
	useEffect(() => {
		if (!map || !ready || !map.getLayer('g-s3-found')) return
		for (const [id, f] of Object.entries(s3Filters(s3Prop))) map.setFilter(id, (outsideOnly && f !== NOTHING ? ['all', OUTSIDE, f] : f) as never)
	}, [map, ready, s3Prop, streets, outsideOnly])

	// step 2 opens with the flooded streets appearing outward from the ravines, about 4 s, then still
	const playReveal = useCallback(() => {
		let stop = false
		if (!map || !map.getLayer(binLayer(0))) return () => {}
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
		const gap = (REVEAL_MS - REVEAL_FADE_MS) / (BINS - 1)
		const t0 = performance.now()
		revealDone.current = false
		const frame = (now: number) => {
			if (stop) return
			const t = reduce ? Infinity : now - t0
			let done = true
			for (let i = 0; i < BINS; i++) {
				const k = Math.min(1, Math.max(0, (t - i * gap) / REVEAL_FADE_MS))
				if (k < 1) done = false
				// switched to our simulation while it plays: the official streets stay out
				map.setPaintProperty(binLayer(i), 'line-opacity', officialOn.current ? k * k * (3 - 2 * k) : 0)
			}
			if (done) revealDone.current = true
			else requestAnimationFrame(frame)
		}
		requestAnimationFrame(frame)
		return () => {
			stop = true
		}
	}, [map])
	useEffect(() => {
		if (key !== 'streets' || !map || !map.getLayer(binLayer(0))) return
		// wait for the camera and the lines, so the first group is drawn when it starts
		let gone = false
		let cancel = () => {}
		const go = () => {
			if (!gone) cancel = playReveal()
		}
		if (map.isSourceLoaded('g-streets') && !map.isMoving()) go()
		else map.once('idle', go)
		return () => {
			gone = true
			map.off('idle', go)
			cancel()
		}
	}, [key, map, playReveal, streets])

	// ---------------------------------------------------------------- tap a street (step 2)
	const tap = useCallback(
		(e: MapMouseEvent) => {
			if (!map || !streets || key !== 'streets' || !map.getLayer('g-hit')) return
			const p = e.point
			const hits = map.queryRenderedFeatures(
				[
					[p.x - 6, p.y - 6],
					[p.x + 6, p.y + 6],
				],
				{ layers: ['g-hit'] },
			)
			const at: [number, number] = [e.lngLat.lng, e.lngLat.lat]
			let best: { f: (typeof hits)[number]; q: [number, number]; d: number } | null = null
			for (const f of hits) {
				if (f.geometry.type !== 'LineString') continue
				const q = snap(at, f.geometry.coordinates)
				const d = metres(at, q)
				if (!best || d < best.d) best = { f, q, d }
			}
			if (!best) {
				setPick(null)
				return
			}
			// zero values are left out of the file: no z means no flood zone, no s not flagged, and so on
			const props = best.f.properties as { z?: number; t: number; n: number; s?: number; sd?: number; o?: number; u?: number; uo?: number; b?: number; bx?: number }
			const zoneCode = Number(props.z ?? 0)
			let water: number | null = null
			let dw = Infinity
			for (const [lon, lat, depth] of streets.marks.points) {
				if (Math.abs(lat - best.q[1]) > 0.0005) continue
				const d = metres(best.q, [lon, lat])
				if (d <= streets.marks.radius_m && d < dw) {
					dw = d
					water = depth
				}
			}
			setPeek(false)
			setPick({
				name: streets.names[props.n] ?? 'Street',
				town: streets.towns[props.t] ?? '',
				zone: streets.zones[String(zoneCode)] ?? '',
				zoneCode,
				sim: props.s === 1,
				simDepth: typeof props.sd === 'number' ? props.sd : null,
				water,
				ems: props.o === 1,
				upv: typeof props.u === 'number' ? props.u : null,
				upvIn: props.uo === 1,
				buildings: Number(props.b ?? 0),
				worst: Number(props.bx ?? 0),
				lngLat: best.q,
			})
			const src = map.getSource('g-pick') as GeoJSONSource | undefined
			src?.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: best.f.geometry }] })
		},
		[map, streets, key],
	)
	useEffect(() => {
		if (!map || !ready) return
		map.on('click', tap)
		return () => {
			map.off('click', tap)
		}
	}, [map, ready, tap])
	// the pointer says where a tap does something
	useEffect(() => {
		if (!map || !ready) return
		const over = () => (map.getCanvas().style.cursor = 'pointer')
		const out = () => (map.getCanvas().style.cursor = '')
		map.on('mouseenter', 'g-hit', over)
		map.on('mouseleave', 'g-hit', out)
		return () => {
			map.off('mouseenter', 'g-hit', over)
			map.off('mouseleave', 'g-hit', out)
		}
	}, [map, ready])

	// ---------------------------------------------------------------- the rain screen: the rain outline
	const rainStops = exam?.rain?.stops ?? []
	const rain = rainStops[Math.min(rainIdx, Math.max(0, rainStops.length - 1))]
	useEffect(() => {
		if (!map || !map.getLayer('g-rain-line') || !rain) return
		const f = ['==', ['get', 'rain_mm'], rain.rain_mm] as never
		map.setFilter('g-rain-line', f)
		map.setFilter('g-rain-fill', f)
	}, [map, rain, exam])

	// ---------------------------------------------------------------- moving between steps
	const go = useCallback((i: number) => {
		setPick(null)
		setAt({ step: Math.max(0, Math.min(STEPS.length - 1, i)), extra: null })
	}, [])
	/** "Start again": the first step as it opens, on the official map */
	const restart = useCallback(() => {
		setMethod(null)
		go(0)
	}, [go])
	const openScreen = useCallback((k: Extra) => {
		setPick(null)
		setAt((was) => ({ step: was.step, extra: k }))
	}, [])
	const back = useCallback(() => (at.extra === 'rain' ? openScreen('exam') : at.extra ? onAllLayers() : go(step - 1)), [at.extra, openScreen, onAllLayers, go, step])
	const next = useCallback(() => (at.extra === 'exam' ? openScreen('rain') : at.extra ? undefined : go(step + 1)), [at.extra, openScreen, go, step])
	const lastNext = at.extra ? at.extra === 'rain' : step === STEPS.length - 1
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return
			if (e.target instanceof HTMLElement && e.target.getAttribute('role') === 'slider') return
			if (e.key === 'Escape') setPick(null)
			if ((e.key === 'ArrowRight' || e.key === 'PageDown') && !lastNext) next()
			if ((e.key === 'ArrowLeft' || e.key === 'PageUp') && (at.extra || step > 0)) back()
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [step, at.extra, lastNext, next, back])

	// ?film: the page tells the recorder when it is ready, what is still loading, and when the film has ended
	useEffect(() => {
		if (!film || !map || !ready) return
		const host = window as unknown as { __film?: { map: () => MapLibreMap; complete: () => boolean }; __filmDone?: boolean }
		const complete = () => !!map.getSource('g-streets') && map.isSourceLoaded('g-streets') && map.areTilesLoaded() && !map.isMoving()
		host.__film = { map: () => map, complete }
		host.__filmDone = false
		let gone = false
		const check = () => {
			if (gone) return
			if (complete()) setFilmReady(true)
			else window.setTimeout(check, 50)
		}
		check()
		return () => {
			gone = true
			delete host.__film
		}
	}, [film, map, ready, streets])
	useEffect(() => {
		if (!film || !filmReady) return
		const host = window as unknown as { __filmDone?: boolean }
		const timers = [
			window.setTimeout(() => setMethod('sim'), FILM.simulation),
			window.setTimeout(() => (host.__filmDone = true), FILM.done),
		]
		return () => timers.forEach((t) => window.clearTimeout(t))
	}, [film, filmReady])

	// a small handle for scripted checks
	useEffect(() => {
		const api = {
			map: () => map,
			step: (i: number) => go(i - 2),
			screen: openScreen,
			method: setMethod,
			rain: setRainIdx,
			reveal: () => void playReveal(),
			ready: () => ready && !!map?.loaded(),
		}
		const host = window as unknown as { __guided?: typeof api }
		host.__guided = api
		return () => {
			delete host.__guided
		}
	}, [map, ready, go, openScreen, playReveal])

	// ---------------------------------------------------------------- what the card says
	// the swipe of step 4: open water only on both sides (swipe.json), or water of any kind (views.json)
	const swipe28 = useMemo(() => {
		if (SWIPE_WATER === 'open') {
			if (!swipe) return null
			const v = `?v=${encodeURIComponent(swipe.baked_utc)}`
			return {
				bounds: swipe.bounds,
				s1: { src: `${ROOT}/${swipe.s1.file}${v}`, time_utc: swipe.s1.time_utc },
				nisar: { src: `${ROOT}/${swipe.nisar.file}${v}`, time_utc: swipe.nisar.time_utc },
				nisarFinds: swipe.numbers.nisar_finds_open.value,
				s1Finds: swipe.numbers.s1_finds_open.value,
			}
		}
		const it = views?.views.swipe?.items.find((i) => i.date === '2026-10-28')
		if (!views || !it) return null
		const v = `?v=${encodeURIComponent(views.baked_utc)}`
		return {
			bounds: views.bounds,
			s1: { src: `/layers/pego_oliva/${it.s1.file}${v}`, time_utc: it.s1.time_utc },
			nisar: { src: `/layers/pego_oliva/${it.nisar.file}${v}`, time_utc: it.nisar.time_utc },
			nisarFinds: it.numbers.nisar_finds.value,
			s1Finds: it.numbers.s1_finds.value,
		}
	}, [views, swipe])
	const still = explore?.sites.pego_oliva?.nisar?.still ?? null
	const n = streets?.numbers

	// a tapped street: what the official map, our simulation and the records of the flood say there
	// the sheet (phones): how far it lowers is the card's height less its title row (--peek, measured below)
	useEffect(() => {
		const card = cardRef.current
		const title = titleRef.current
		if (!card || !title) return
		const measure = () => card.style.setProperty('--peek', `${title.offsetTop + title.offsetHeight + 12}px`)
		measure()
		const ro = new ResizeObserver(measure)
		ro.observe(card)
		ro.observe(title)
		return () => ro.disconnect()
	}, [key, at.extra])
	useEffect(() => {
		if (peek && cardRef.current) cardRef.current.scrollTop = 0
	}, [peek])
	const grabDown = (e: React.PointerEvent<HTMLButtonElement>) => {
		const card = cardRef.current
		if (!card) return
		const max = Math.max(0, card.offsetHeight - (Number.parseFloat(card.style.getPropertyValue('--peek')) || 0))
		e.currentTarget.setPointerCapture(e.pointerId)
		sheetDrag.current = { y0: e.clientY, base: peek ? max : 0, max, moved: false, last: e.clientY, lastT: performance.now(), vy: 0 }
		card.dataset.dragging = ''
	}
	const grabMove = (e: React.PointerEvent<HTMLButtonElement>) => {
		const d = sheetDrag.current
		const card = cardRef.current
		if (!d || !card) return
		const dy = e.clientY - d.y0
		if (Math.abs(dy) > 5) d.moved = true
		if (!d.moved) return
		card.style.transform = `translateY(${Math.min(d.max, Math.max(0, d.base + dy))}px)`
		const now = performance.now()
		d.vy = (e.clientY - d.last) / Math.max(1, now - d.lastT)
		d.last = e.clientY
		d.lastT = now
	}
	const grabUp = (e: React.PointerEvent<HTMLButtonElement>) => {
		const d = sheetDrag.current
		const card = cardRef.current
		sheetDrag.current = null
		if (!d || !card) return
		delete card.dataset.dragging
		if (!d.moved) return
		// a fast swipe goes its way; a slow drag settles on the nearer end
		const down = Math.abs(d.vy) > 0.45 ? d.vy > 0 : d.base + (e.clientY - d.y0) > d.max / 2
		justDragged.current = true
		if (down) card.dataset.peek = ''
		else delete card.dataset.peek
		card.style.transform = ''
		setPeek(down)
	}
	const grabClick = () => {
		if (justDragged.current) {
			justDragged.current = false
			return
		}
		setPeek((v) => !v)
	}

	const card = pick ? (
		<div className="gd-pick" aria-live="polite">
			<div className="gd-pick-head">
				<b>{pick.name}</b>
				<button type="button" className="gd-x" aria-label="Close" onClick={() => setPick(null)}>
					<X size={15} strokeWidth={2.4} />
				</button>
			</div>
			<small>{pick.town}</small>
			<dl className="gd-rec">
				<dt>Official map</dt>
				<dd data-zone={pick.zoneCode === 0 || undefined}>{pick.zoneCode === 0 ? 'No flood zone' : `In the ${pick.zone}`}</dd>
				<dt>Our simulation</dt>
				<dd>
					{!pick.sim
						? 'Dry'
						: pick.simDepth !== null && pick.simDepth >= CHANNEL_M
							? 'Flooded, over the ravine channel'
							: `Flooded${pick.simDepth !== null ? `, ${pick.simDepth.toFixed(1)} m deep` : ''}`}
				</dd>
			</dl>
			<p className="gd-rec-head">What really happened, measured</p>
			<dl className="gd-rec">
				<dt>Water mark</dt>
				<dd>{pick.water === null ? 'None within 25 m' : pick.water < 0.05 ? 'Under 0.1 m, measured' : `${pick.water.toFixed(1)} m, measured`}</dd>
				<dt>Copernicus EMS map</dt>
				<dd>{pick.ems ? 'Inside the flooded area' : 'Outside the flooded area'}</dd>
				<dt>UPV depth map</dt>
				<dd>{pick.upv !== null ? (pick.upv >= 0.05 ? `${pick.upv.toFixed(1)} m` : 'No water') : pick.upvIn ? 'No value here' : 'Outside its area'}</dd>
				<dt>Damaged buildings</dt>
				<dd>{pick.buildings ? `${pick.buildings} within 25 m, worst ${GRADES[pick.worst]}` : 'None graded within 25 m'}</dd>
			</dl>
			<p className="gd-rec-src">Sources: SNCZI (MITECO); the team&apos;s simulation of the rain that fell; ICV water marks; Copernicus EMS EMSR773; UPV depth map (Roch Talens et al. 2025).</p>
		</div>
	) : (
		<p className="gd-hint">
			<i /> {s.hint}
		</p>
	)

	let body: React.ReactNode = null
	if (key === 'streets') {
		const sim = method?.key === 'sim'
		const zones = methods.find((m) => m.key === 'zones')
		body = (
			<>
				<div className="gd-seg" role="radiogroup" aria-label="Which map" style={{ ['--n' as string]: Math.max(1, methods.length) }}>
					{methods.map((m) => (
						<button key={m.key} type="button" role="radio" aria-checked={m.key === method?.key} onClick={() => setMethod(m.key)}>
							{m.label}
						</button>
					))}
				</div>
				{!sim && n && (
					<div className="gd-num">
						<b className="display">{pct(n.outside_pct.value)}</b>
						<span>of the streets that flooded were outside every official flood zone</span>
					</div>
				)}
				{!sim && n && (
					<p className="gd-small">
						{ha(n.outside_km.value)} of {ha(n.flooded_km.value)} km of flooded street.
					</p>
				)}
				{sim && method && (
					<div className="gd-num">
						<b className="display">{pct(method.hit_rate_pct.value)}</b>
						<span>of the flooded streets found by our simulation</span>
					</div>
				)}
				{sim && method && (
					<p className="gd-small">
						{pct(method.precision_pct.value)} of the streets it flagged really flooded.
						{zones && ` The official map: ${pct(zones.hit_rate_pct.value)} found, ${pct(zones.precision_pct.value)} really flooded.`}
					</p>
				)}
				{!pick && (
				<ul className="gd-key">
					{sim ? (
						<>
							<li>
								<i className="gd-sw" data-k="hit" /> Flagged, and it flooded
							</li>
							<li>
								<i className="gd-sw" data-k="flooded" /> Flooded, not flagged
							</li>
							<li>
								<i className="gd-sw" data-k="false" /> Flagged, not in the official records
							</li>
						</>
					) : (
						<>
							<li>
								<i className="gd-sw" data-k="hit" /> Flooded, inside an official zone
							</li>
							<li>
								<i className="gd-sw" data-k="flooded" /> Flooded, outside every official zone
							</li>
							<li>
								<i className="gd-sw" data-k="zone" data-fill /> Official flood zone (SNCZI)
							</li>
						</>
					)}
				</ul>
				)}
				{card}
				{!pick && <p className="gd-note">{sim ? method?.note : 'Flooded: the Copernicus EMS map or a measured water mark. Shown outward from the ravines, not in time order.'}</p>}
			</>
		)
	} else if (key === 'nisar') {
		body = (
			<>
				{swipe28 && (
					<div className="gd-pair">
						<p data-on>
							<b className="display">{pct(swipe28.nisarFinds * 100)}</b>
							<span>of the open water a same-day photo shows, found by NISAR</span>
						</p>
						<p>
							<b className="display">{pct(swipe28.s1Finds * 100)}</b>
							<span>by Sentinel-1</span>
						</p>
					</div>
				)}
				{still && (
					<p className="gd-small">
						On {dayMonth(still.date)}, NISAR still saw open water on {pct(still.open_water_share * 100)} of the area Copernicus EMS mapped as flooded
						{emsImagery(still.outline) ? ` on ${emsImagery(still.outline)}` : ''}.
					</p>
				)}
				<ul className="gd-key">
					<li>
						<i className="gd-sw" data-k="water" data-fill /> {SWIPE_WATER === 'open' ? 'Open water' : 'Water'} on each radar map
					</li>
					<li>
						<i className="gd-sw" data-k="nodata" data-fill /> Ground the map does not cover
					</li>
				</ul>
				{swipe28 && (
					<p className="gd-hint">
						<i /> {s.hint}: the same evening, {minutesApart(swipe28.nisar.time_utc, swipe28.s1.time_utc)} minutes apart
					</p>
				)}
				{SWIPE_WATER === 'open' && <p className="gd-note">Both sides: open water only.</p>}
			</>
		)
	} else if (key === 'coming') {
		const safe = coming?.safe
		body = (
			<>
				{safe && (
					<>
						<div className="gd-num">
							<b className="display">{Math.round(safe.found_km)} km</b>
							<span>{safe.line}</span>
						</div>
						<p className="gd-small">
							<b>{pct(safe.precision_pct)}</b> of its warnings there were right, where chance gives {pct(safe.chance_pct)}.
						</p>
					</>
				)}
				<ul className="gd-key">
					<li>
						<i className="gd-sw" data-k="hit" /> Flagged, and it flooded
					</li>
					<li>
						<i className="gd-sw" data-k="flooded" /> Flooded, not flagged
					</li>
					<li>
						<i className="gd-sw" data-k="false" /> Flagged, not in the official records
					</li>
					<li>
						<i className="gd-sw" data-k="zone" data-fill /> Official flood zone (SNCZI)
					</li>
				</ul>
				{safe && <p className="gd-note">{safe.small}</p>}
				{coming && <p className="gd-close">{coming.closing}</p>}
				<div className="gd-end">
					<button type="button" className="gd-btn" onClick={restart}>
						<RotateCcw size={15} strokeWidth={2.4} /> Start again
					</button>
					<button type="button" className="gd-btn" data-quiet onClick={onAllLayers}>
						<Layers size={15} strokeWidth={2.4} /> All layers
					</button>
				</div>
			</>
		)
	} else if (key === 'exam') {
		body = (
			<>
				{score && (
					<div className="gd-pair">
						<p data-on>
							<b className="display">{f2(score.model_rain_fell)}</b>
							<span>our model, with the rain that fell</span>
						</p>
						<p>
							<b className="display">{f2(score.model_forecast)}</b>
							<span>with the forecast</span>
						</p>
					</div>
				)}
				{score && (
					<p className="gd-small">
						Three simple rules: {f2(score.simple_rules[0])} to {f2(score.simple_rules[1])}. {score.score}: {score.help}.
					</p>
				)}
				<ul className="gd-key">
					<li>
						<i className="gd-sw" data-k="hit" data-fill /> Predicted, and it flooded{exam ? ` (${ha(exam.hectares.hit)} ha)` : ''}
					</li>
					<li>
						<i className="gd-sw" data-k="false" data-fill /> Predicted, not in the Copernicus map{exam ? ` (${ha(exam.hectares.false_alarm)} ha)` : ''}
					</li>
					<li>
						<i className="gd-sw" data-k="missed" data-fill /> Flooded, we missed it{exam ? ` (${ha(exam.hectares.missed)} ha)` : ''}
					</li>
				</ul>
				{score && <p className="gd-note">{score.next_exam}</p>}
			</>
		)
	} else if (key === 'rain') {
		body = (
			<>
				{rain && (
					<div className="gd-num">
						<b className="display">{ha(rain.ha)}</b>
						<span>hectares likely flooded with {rain.rain_mm} mm of rain in {Math.round(rain.lead_days)} days</span>
					</div>
				)}
				{rainStops.length > 0 && (
					<div className="gd-rain">
						<RainSlider stops={rainStops.map((r) => ({ label: `${r.rain_mm} mm`, warn: !!r.warning }))} index={rainIdx} onInput={() => {}} onStop={setRainIdx} label="Rain" />
					</div>
				)}
				<ul className="gd-key">
					<li>
						<i className="gd-sw" data-k="rain" data-fill /> Likely flooded, our model: a relative likelihood, not depth
					</li>
				</ul>
				{rain?.warning && <p className="gd-small">{rain.warning}.</p>}
				{rain?.rain_mm === 0 && <p className="gd-small">With no rain the model still marks this much: water the marsh holds in this season.</p>}
				<p className="gd-note">Version 1. Its tested score is on the step before.</p>
				<div className="gd-end">
					<button type="button" className="gd-btn" onClick={restart}>
						<RotateCcw size={15} strokeWidth={2.4} /> Start again
					</button>
					<button type="button" className="gd-btn" data-quiet onClick={onAllLayers}>
						<Layers size={15} strokeWidth={2.4} /> All layers
					</button>
				</div>
			</>
		)
	}

	const src: string[] = []
	if (key === 'streets' || key === 'coming') {
		if (streets) src.push(`Streets: ${streets.sources.streets}.`, `Flood: ${streets.sources.flood}.`, `Water marks: ${streets.sources.marks}.`, `Zones: ${streets.sources.zones}.`)
		if (streets) src.push(`Simulation: ${streets.sources.simulated}, with no infiltration, so an upper bound.`)
		if (key === 'streets' && streets?.sources.upv) src.push(`UPV: ${streets.sources.upv}.`, `Buildings: ${streets.sources.buildings}.`)
		if (key === 'streets' && method && method.exact === false) src.push(`The streets drawn for ${sentence(method.label)} come from ${method.drawn_from}; the numbers are those of the scores.`)
		if (streets) src.push(`Numbers: ${streets.sources.scores}.`)
	}
	if (key === 'coming' && coming?.safe) src.push(`Where the map said safe: ${coming.safe.source}.`)
	if (key === 'nisar') {
		if (SWIPE_WATER === 'open') {
			src.push('NISAR: NASA-ISRO L2 GCOV, track 066 D, open water by the team CV model (v1 at 0.3 on p(open water)).', 'Sentinel-1: OPERA DSWx-S1, open water (class 1).')
			src.push('Same-day photo: OPERA DSWx-HLS (Landsat 9, Sentinel-2) within a day, its open water outside permanent water, where clear.', 'Numbers: public/layers/guided/swipe.json (bake_swipe_open.py); still flooded: data/metrics/nisar_labels_summary.json against Copernicus EMS EMSR935.')
		} else {
			src.push('NISAR: NASA-ISRO L2 GCOV, track 066 D, water by the team CV model (v1 at 0.3).', 'Sentinel-1: OPERA DSWx-S1 (open water and flooded vegetation).', 'Same-day photo: OPERA DSWx-HLS (Landsat 9, Sentinel-2) within a day.')
			src.push('Numbers: public/layers/pego_oliva/views.json (bake_views.py); still flooded: data/metrics/nisar_labels_summary.json against Copernicus EMS EMSR935.')
		}
	}
	if (key === 'exam') {
		if (score) src.push(`Test: ${score.by}. ${score.source}.`)
		if (exam) src.push(`Map: ${exam.source.model}; flood: ${exam.source.flood}.`)
	}
	if (key === 'rain' && exam?.rain) src.push(`Model: ${exam.rain.source.model}.`, `Rain scenarios: ${exam.rain.source.rain}.`)

	const swipeOn = map && (key === 'nisar' || key === 'exam')

	return (
		<div className="gd" data-step={key} data-ready={ready || undefined} data-film={film || undefined} data-film-ready={filmReady || undefined}>
			<div ref={mapEl} className="gd-map" />

			{swipeOn && key === 'nisar' && swipe28 && (
				<MapSwipe
					key="nisar"
					map={map}
					bounds={swipe28.bounds}
					beside=".gd-card"
					left={{ src: swipe28.s1.src, label: 'Sentinel-1', sub: `${timeOf(swipe28.s1.time_utc)} UTC` }}
					right={{ src: swipe28.nisar.src, label: 'NISAR', sub: `${timeOf(swipe28.nisar.time_utc)} UTC` }}
				/>
			)}
			{swipeOn && key === 'exam' && exam && (
				<MapSwipe
					key="exam"
					map={map}
					bounds={exam.bounds}
					beside=".gd-card"
					left={{ src: `${ROOT}/${exam.prediction.file}?v=${encodeURIComponent(exam.baked_utc)}`, label: 'Our prediction' }}
					right={{ src: `${ROOT}/${exam.happened.file}?v=${encodeURIComponent(exam.baked_utc)}`, label: 'What happened' }}
				/>
			)}

			<header className="gd-top">
				<SiteNav
					active="map"
					onGo={(k) => {
						if (k === 'explore') onAllLayers()
						else go(0)
						return true
					}}
				/>
			</header>

			<section ref={cardRef} className="gd-card" aria-live="polite" data-peek={peek || undefined}>
				<button
					type="button"
					className="gd-grab"
					aria-label={peek ? 'Show the card' : 'Lower the card'}
					aria-expanded={!peek}
					onPointerDown={grabDown}
					onPointerMove={grabMove}
					onPointerUp={grabUp}
					onPointerCancel={grabUp}
					onClick={grabClick}
				/>
				{at.extra ? (
					<p className="gd-aside">Marsh model, out of the guided tour</p>
				) : (
					<ol className="gd-dots" aria-label="Steps">
						{STEPS.map((x, i) => (
							<li key={x.key}>
								<button type="button" aria-current={i === step ? 'step' : undefined} aria-label={x.title} onClick={() => go(i)} />
							</li>
						))}
					</ol>
				)}
				<p className="gd-when">
					{s.when} · {s.where}
				</p>
				<h1 ref={titleRef} className="display gd-title">{key === 'streets' ? (STREET_TITLES[method?.key ?? 'zones'] ?? s.title) : s.title}</h1>
				<div className="gd-body" key={key}>
					{body}
				</div>
				<nav className="gd-nav">
					<button type="button" onClick={back} disabled={!at.extra && step === 0}>
						<ArrowLeft size={15} strokeWidth={2.4} /> {at.extra === 'exam' ? 'All layers' : 'Back'}
					</button>
					<button type="button" className="gd-src" aria-expanded={sources} onClick={() => setSources((v) => !v)}>
						Sources
					</button>
					<button type="button" onClick={next} disabled={lastNext}>
						Next <ArrowRight size={15} strokeWidth={2.4} />
					</button>
				</nav>
				{sources && (
					<ul className="gd-sources">
						{src.map((x) => (
							<li key={x}>{x}</li>
						))}
					</ul>
				)}
				{error && <p className="gd-error">Some layers did not load: {error}</p>}
			</section>
			{/* a phone: Back, Sources and Next on a bar under the sheet, seen whether it is open or lowered */}
			<nav className="gd-bar" aria-label="Steps">
				<button type="button" onClick={back} disabled={!at.extra && step === 0}>
					<ArrowLeft size={15} strokeWidth={2.4} /> {at.extra === 'exam' ? 'All layers' : 'Back'}
				</button>
				<button
					type="button"
					className="gd-src"
					aria-expanded={sources}
					onClick={() => {
						setPeek(false)
						setSources((v) => !v)
					}}
				>
					Sources
				</button>
				<button type="button" onClick={next} disabled={lastNext}>
					Next <ArrowRight size={15} strokeWidth={2.4} />
				</button>
			</nav>
		</div>
	)
}
