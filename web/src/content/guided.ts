// The guided flood map (/explore): four steps after the landing, one main action each, and two model screens kept
// out of the flow (reachable from "All layers"). The words are here; every number comes from a baked or hand-kept file
// (public/layers/guided/*.json, public/layers/explore/explore.json), read at run time with the field it comes from.

export type StepKey = 'streets' | 'nisar' | 'coming' | 'exam' | 'rain'

export type Step = {
	key: StepKey
	/** date and place, the small line over the title */
	when: string
	where: string
	title: string
	/** what to do, said once, short */
	hint: string
	/** where the map flies when the step opens: [west, south, east, north] */
	view: [number, number, number, number]
}

/** the core of L'Horta Sud: Torrent's east, Picanya, Paiporta, Sedaví, Alfafar, Massanassa, Catarroja, Benetússer */
const HORTA: [number, number, number, number] = [-0.4655, 39.3895, -0.3545, 39.4535]
/** the Pego-Oliva marsh: the box of the Copernicus EMSR935 flooded area of AOI01 (data/labels), a little wider */
const PEGO: [number, number, number, number] = [-0.099, 38.846, -0.005, 38.893]

/** the guided flow: steps 2 to 4 of the pitch (the landing hero is step 1); ?step=2 to 4 opens one */
export const STEPS: Step[] = [
	{ key: 'streets', when: '29 Oct 2024', where: "L'Horta Sud", title: 'The official map said safe', hint: 'Tap any street', view: HORTA },
	{ key: 'nisar', when: '28 Oct 2026', where: 'Pego-Oliva', title: 'NISAR sees more water', hint: 'Drag the line', view: PEGO },
	{ key: 'coming', when: '29 Oct 2024', where: "L'Horta Sud", title: 'Where the map said safe', hint: 'The streets outside every official zone', view: HORTA },
]

/** the marsh model screens, out of the flow: "All layers" opens them (?screen=exam, ?screen=rain) */
export const SCREENS: Step[] = [
	{ key: 'exam', when: 'Oct 2026', where: 'Pego-Oliva', title: 'Did we get it right?', hint: 'Drag the line', view: PEGO },
	{ key: 'rain', when: 'Today', where: 'Pego-Oliva', title: 'What if it rains', hint: 'Slide the rain', view: PEGO },
]

/** the methods of the streets step's switch (keys of streets.json methods); the last step has its own, from coming.json */
export const STEP3_METHODS = ['zones', 'sim']
/** the streets step's title follows its switch */
export const STREET_TITLES: Record<string, string> = { zones: 'The official map said safe', sim: 'Our simulation saw it' }

/** the colours of the steps; the blue of the flooded streets is the one of the measured water marks */
export const COLORS = {
	flooded: '#2f8cff',
	floodedGlow: '#9fd0ff',
	zone: '#ff9500',
	sim: '#c76bff',
	hit: '#2fd27a',
	falseAlarm: '#ff4d4f',
	missed: '#ffd23f',
	rain: '#7fe0f0',
}

/** what the swipe of step 4 compares: 'open' (open water only on both sides, public/layers/guided/swipe.json) or
 *  'any' (open water and flooded vegetation on both sides, the /views pictures and numbers of views.json) */
export const SWIPE_WATER: 'open' | 'any' = 'open'

/** how long the flooded streets take to appear when step 2 opens, and how long each of its 16 groups fades in */
/** a street piece the simulation puts this deep (m) or deeper lies over a ravine channel (a bridge, a path in the
 *  riverbed): its 25 m cell is the channel's, so the tap card says so instead of giving a street depth. Measured water
 *  marks on streets reach 4.2 m (one mark of 7.0 m in Chiva, data/streets/water_marks_2024.geojson); the full check of
 *  15 Nov 2026 found 5 to 13.8 m only on ravine pieces. */
export const CHANNEL_M = 5

export const REVEAL_MS = 4000
export const REVEAL_FADE_MS = 700

/** the title of /explore?all, every layer (the guide's own is META's) */
export const TITLE_ALL = 'Explore · Through the Clouds'

export const META = {
	title: 'The flood map · Through the Clouds',
	description: 'What the official flood map missed in the Valencia flood of 2024, what our street simulation and NISAR radar saw, and what our model found where the official map said safe.',
}
