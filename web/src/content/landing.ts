// Landing copy. Facts come from the repository README and the real pass list (src/data/passes.json); nothing here
// claims a result the models have not produced yet.
import type { SiteKey } from '@/lib/radar'
// the chapters of the monitor's film sit next to it, so cutting the film again only changes that file
import TOUR_CHAPTERS from '../../public/films/tour.chapters.json'

export const HERO = {
	/** the name, its line, and the small line under them (SITE: Through the Clouds, NASA Space Apps 2026) */
	name: 'Through the Clouds',
	tagline: 'Where the water really went',
	small: 'NASA Space Apps 2026 · Dancing with the SARs',
	lines: ['The alert says rain.', 'Not where the water goes.'],
	/** the damage figure comes from src/data/dana_2024_toll.json, with its sources */
	toll: { damage: 'of damage', caption: 'Valencia flood' },
	primary: { label: 'See what the map missed', href: '/explore' },
	stories: 'More NISAR stories',
	/** the third button: the research paper (its link lives in SITE.paper) */
	paper: 'Research paper',
}

/** The one film of the monitor: the guided tour's streets step as it runs (/explore?film), recorded frame by frame
 *  by scripts/landing_films.py. The numbers in it are the tour's own, read from its data files when it was recorded. */
export const TOUR_FILM = {
	key: 'tour',
	tab: 'The flood map',
	title: 'The official map said safe',
	place: "L'Horta Sud, 29 Oct 2024",
	path: '/explore',
	src: '/films/tour.mp4',
	poster: '/films/tour.jpg',
	still: '/films/tour-still.jpg',
	cta: 'Open the flood map',
	/** what the film shows and when (public/films/tour.chapters.json), for the deck under the monitor */
	chapters: TOUR_CHAPTERS.chapters,
	/** its length in seconds, shown before the film itself has loaded */
	duration: TOUR_CHAPTERS.duration,
}

/** the deck under the monitor: the words of its controls */
export const DECK = { play: 'Play the film', pause: 'Pause the film', timeline: 'Where the film is', jump: 'Jump to' }

/** under the monitor: the 3D story pages, each a film of how the land changed over time */
export const MORE = { title: 'More NISAR stories', line: 'How the land changes over time, seen by NISAR every 12 days.', open: 'Open the 3D story' }

/** how it works: one strip in the order the signal travels, from the orbit to the test. Each stage has one number from
 *  the repository with the file it comes from; the pictures are crops of the app's own layers (public/landing/how).
 *  The methods: docs/STREETS.md, docs/CV_BENCHMARK.md, the repository README. The orbit's number is counted from the
 *  passes themselves (src/data/passes.json) in components/landing.tsx. */
export const HOW = {
	title: 'How it works',
	line: 'From orbit to one street, in the order the signal travels.',
	stages: [
		{
			key: 'orbit',
			title: 'NISAR above the clouds',
			text: 'NASA-ISRO NISAR passes over Valencia day and night, and its L-band radar sees through cloud.',
			value: '',
			unit: 'days between passes',
			source: 'src/data/passes.json, track 066 descending',
			caption: 'NISAR passes · track 066 D · 2026',
		},
		{
			key: 'radar',
			title: 'Its radar image of the water',
			text: 'Our model reads open water from the radar, checked against photos taken the same day.',
			value: '57%',
			unit: 'of the open water a same-day photo shows',
			source: 'public/layers/guided/swipe.json, numbers.nisar_finds_open (0.572)',
			img: '/landing/how/radar.webp',
			alt: 'Open water NISAR found in the Pego-Oliva marsh on 28 Oct 2026, in blue over the map',
			caption: 'NISAR · Pego-Oliva · 28 Oct 2026',
		},
		{
			key: 'streets',
			title: 'Streets in pieces of 25 m',
			text: 'The streets of 10 towns, cut into pieces of 25 m, each checked against the Copernicus EMS flood map and the water heights measured after the flood.',
			value: '64,174',
			unit: 'pieces of street',
			source: 'data/streets/results.json, streets.main.summary.pieces',
			img: '/landing/how/streets.webp',
			alt: 'The streets of Paiporta that flooded in 2024, in blue and green, with the official flood zones in orange',
			caption: 'Paiporta · flooded streets · 2024',
		},
		{
			key: 'sim',
			title: 'The water on a 25 m grid',
			text: 'The rain that fell runs over the terrain on a 25 m grid. Nothing soaks in, so it is an upper bound.',
			value: '76%',
			unit: 'of the flooded streets found',
			source: 'data/streets/results.json, simulated_depth_above_0p3m, A.total.hit_rate_pct',
			img: '/landing/how/simulation.webp',
			alt: 'The simulated water over Paiporta, deepest in the ravine',
			caption: 'Paiporta · simulated depth',
		},
		{
			key: 'test',
			title: 'Written before the answer',
			text: 'Every test is written down before its answer is seen. The code and the data are open.',
			value: '1 h 10 min',
			unit: 'from the rules to the first score',
			source: 'git log, commits 37c33ef and e4593db',
			caption: 'git · 15 Nov 2026',
		},
	],
	/** the test stage's picture: the two commits, as git has them (15 Nov 2026) */
	log: [
		{ time: '08:03 UTC', hash: '37c33ef', what: 'Rules for two more simulations, before any run or score' },
		{ time: '09:13 UTC', hash: 'e4593db', what: 'First score, street by street' },
	],
	credit: 'Pictures: crops of the app. Orthophoto PNOA © Instituto Geográfico Nacional de España (scne.es, CC BY 4.0); flood zones SNCZI (MITECO); flood map Copernicus EMS EMSR773 (© European Union).',
	repo: 'The code on GitHub',
	paper: 'Research paper',
}

export type StoryKey = 'water' | 'fire' | 'sink' | 'quake'
export type Story = {
	key: StoryKey
	tab: string
	title: string
	what: string
	where: string
	kind: string
	site: SiteKey
	/** two passes to compare (before, after) by last date and track; one pass when there is nothing to compare */
	compare: { site: SiteKey; date: string; track: string }[]
	note: string
	/** the animated change layer: what it shows, read from the radar previews */
	change: { kind: 'water' | 'fire' | 'sink' | 'quake'; legend: string; event?: string; epicentre?: [number, number] }
}

// Not shown since 14 Nov 2026. The landing, the navbar and the footer now take their stories from content/stories.ts:
// the three that have a 3D map page (flood, fire, rice). The four below belonged to the 2D explorer, which is
// retired. They are kept for their copy: Lorca and Panama have no 3D page yet.
export const STORIES_HEAD = { title: 'Four stories', line: 'Scroll, and each season plays out on the real NISAR passes, over the ground around them.' }

export const STORIES: Story[] = [
	{
		key: 'water',
		tab: 'Farm water',
		title: 'Farm water vs storm water',
		what: 'Rice fields flooded on purpose, next to the DANA "Adam" flood of Oct 2026.',
		where: 'Albufera · Pego-Oliva marsh',
		kind: 'Radar brightness',
		site: 'albufera',
		compare: [
			{ site: 'coast', date: '2026-07-12', track: '066' },
			{ site: 'coast', date: '2026-10-28', track: '066' },
		],
		note: 'Flooded paddies read dark: open water sends the pulse away.',
		change: { kind: 'water', legend: 'Aqua: ground that reads dark (wet) on each pass. Deep blue: water on almost every pass.' },
	},
	{
		key: 'fire',
		tab: 'Fire scar',
		title: 'Fire scar',
		what: 'Forest burned in summer 2026.',
		where: "Serra d'Espadà",
		kind: 'Radar brightness',
		site: 'espada',
		compare: [
			{ site: 'espada', date: '2026-07-24', track: '058' },
			{ site: 'espada', date: '2026-08-17', track: '058' },
		],
		note: 'Burned forest loses its canopy, and its brightness drops.',
		change: { kind: 'fire', legend: 'Ember: canopy brightness lost against the passes before the fire began on 25 Jul.', event: '2026-07-25' },
	},
	{
		key: 'sink',
		tab: 'Sinking ground',
		title: 'Sinking ground',
		what: 'Land dropping a few cm a year from groundwater pumping.',
		where: 'Lorca',
		kind: 'Ground motion pairs',
		site: 'lorca',
		compare: [
			{ site: 'lorca', date: '2026-08-12', track: '159' },
			{ site: 'lorca', date: '2026-08-24', track: '159' },
		],
		note: 'Colours show motion toward or away from the satellite between two passes.',
		change: { kind: 'sink', legend: 'Blue and red: motion toward or away from the satellite in each 12-day pair. White lines trace its shape.' },
	},
	{
		key: 'quake',
		tab: 'Earthquake',
		title: 'Earthquake (global)',
		what: 'Ground moved by the M7.7 quake of 9 Oct 2026.',
		where: 'Panama',
		kind: 'Ground motion pairs',
		site: 'panama',
		compare: [
			{ site: 'panama', date: '2026-09-27', track: '141' },
			{ site: 'panama', date: '2026-10-09', track: '141' },
		],
		note: 'The pair that spans the quake fills with fringes; the pair before it does not.',
		change: { kind: 'quake', legend: 'Fringes from each pair, set flowing. The pair that spans the quake reveals from the USGS epicentre; the others stay dim.', event: '2026-10-09', epicentre: [-80.7566, 7.6069] },
	},
]
