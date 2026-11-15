// Site copy. Wording comes from the repository README (the team's own words), shaped into lines, never extended
// with new claims. The product is "Through the Clouds"; "Dancing with the SARs" is the challenge of NASA Space Apps 2026.
export const SITE = {
	name: 'Through the Clouds',
	tagline: 'Where the water really went',
	challengeName: 'Dancing with the SARs',
	event: 'NASA Space Apps 2026',
	title: 'Through the Clouds · Where the water really went',
	description: "Where the water really went in Valencia's 2024 flood, street by street, against the official flood map, with NASA-ISRO NISAR radar.",
	repo: 'https://github.com/ilijachrchev/synthetic-aperture-radar',
	/** the research paper as a PDF (Luka's LaTeX, docs/paper/latex/main.tex, compiled with Tectonic), used by the hero,
	 *  How it works and the footer */
	paper: '/paper.pdf',
	challenge: 'https://www.spaceappschallenge.org/2026/challenges/dancing-with-the-sars/',
} as const

export const NAV = [
	{ label: 'Stories', href: '/#stories' },
	{ label: 'The map', href: '/#app' },
	{ label: 'How it works', href: '/#how' },
	{ label: 'Data', href: '/#data' },
] as const

export const HERO = {
	kicker: 'Watching the land around',
	place: 'Valencia',
	sub: 'flood, grow, burn and sink, seen by NASA-ISRO NISAR radar.',
	lead: 'One web app that shows how the land around Valencia changes, and',
	leadAccent: 'what is likely to come next.',
	seenBy: ['Seen by NASA-ISRO NISAR,', 'one pass every 12 days'],
	primary: { label: 'Open the map', href: '/flood' },
	secondary: { label: 'How it works', href: '/#how' },
} as const
