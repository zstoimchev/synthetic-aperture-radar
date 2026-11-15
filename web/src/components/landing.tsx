import { ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import { HERO, HOW, MORE, TOUR_FILM } from '@/content/landing'
import { SITE } from '@/content/site'
import { STORIES } from '@/content/stories'
import TOLL from '@/data/dana_2024_toll.json'
import PASSES from '@/data/passes.json'
import { AnchorLink } from './anchor-link'
import { InView } from './in-view'
import { type Film, MonitorStage } from './monitor'
import { SiteNav } from './site-nav'
import { Smoke } from './smoke'
import { ThemeSwitch } from './theme-switch'
import './landing.css'

/** The one film of the monitor: the guided tour's streets step (official map, then our simulation), recorded from the running app (scripts/landing_films.py). */
const FILMS: Film[] = [TOUR_FILM]

/**
 * The landing in one piece: the hook (the line, the toll of the 2024 flood with its sources, one button to the flood
 * map), centred on a lagoon panel with slow water in it, and under it the app on a monitor, playing the guided tour as
 * it runs: the streets that flooded outside every official zone, then the official map against our simulation. The
 * small navbar floats above it all.
 */
export function Hero() {
	return (
		<section className="hx">
			<div className="hx-bg" aria-hidden>
				<Smoke className="hx-smoke" />
			</div>
			<SiteNav variant="pill" end={<ThemeSwitch />} />
			<div className="hx-head">
				<h1 className="display hx-title hx-name">{HERO.name}</h1>
				<p className="hx-tagline" data-a>
					{HERO.tagline}
				</p>
				<p className="hx-small" data-a>
					{HERO.small}
				</p>
				<p className="hx-hook" data-a>
					{HERO.lines.join(' ')}
				</p>
				<div className="hx-toll" data-a>
					<p>
						<b className="display">€{TOLL.damage_eur_billion} billion</b>
						<span>{HERO.toll.damage}</span>
					</p>
				</div>
				<p className="hx-caption" data-a>
					{HERO.toll.caption}, {TOLL.date}. Sources:{' '}
					{TOLL.sources.map((src, i) => (
						<span key={src.url}>
							{i > 0 ? ', ' : ''}
							<a href={src.url} target="_blank" rel="noopener noreferrer">
								{src.name}
							</a>
						</span>
					))}
				</p>
				<div className="hx-cta" data-a>
					<Link href={HERO.primary.href} className="btn">
						<span className="btn-dot">
							<ArrowUpRight size={18} strokeWidth={2.4} />
						</span>
						{HERO.primary.label}
					</Link>
					<AnchorLink to="more" className="btn-ghost">
						{HERO.stories}
					</AnchorLink>
					<a href={SITE.paper} className="btn-ghost" target="_blank" rel="noopener noreferrer">
						{HERO.paper}
					</a>
				</div>
			</div>
			<MonitorStage films={FILMS} />
		</section>
	)
}

/** Under the monitor: the 3D story pages, nothing lost now that their films left it. */
export function MoreStories() {
	return (
		<section id="more" className="mr">
			<div className="mr-head">
				<h2 className="display mr-title">{MORE.title}</h2>
				<p>{MORE.line}</p>
			</div>
			<ul className="mr-list">
				{STORIES.map((s) => (
					<li key={s.key}>
						<Link href={s.path} className="mr-card" prefetch={false}>
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img src={`/films${s.path}-still.jpg`} alt="" width={1280} height={720} loading="lazy" />
							<span className="mr-text">
								<b>{s.title}</b>
								<small>{s.place}</small>
							</span>
							<span className="mr-go">
								{MORE.open} <ArrowUpRight size={15} strokeWidth={2.4} />
							</span>
						</Link>
					</li>
				))}
			</ul>
		</section>
	)
}

/** the passes of track 066 descending over Valencia (src/data/passes.json): the orbit stage draws them, and its number
 *  is the most common number of days between two of them */
const ORBIT = (() => {
	const dates = [...new Set(PASSES.sites.valencia.passes.filter((p) => p.track === '066' && p.dir === 'D').flatMap((p) => p.dates))].sort()
	const t = dates.map((d) => Date.parse(`${d}T12:00:00Z`))
	const span = t[t.length - 1] - t[0] || 1
	const gaps = t.slice(1).map((v, i) => Math.round((v - t[i]) / 86400000))
	const count = new Map<number, number>()
	for (const g of gaps) count.set(g, (count.get(g) ?? 0) + 1)
	const days = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0
	const label = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
	return { x: t.map((v) => (v - t[0]) / span), days, first: label(dates[0]), last: label(dates[dates.length - 1]) }
})()

/** stage 1: NISAR on its orbit above a band of cloud, its beam through it, and its real passes ticked on the ground */
function OrbitPanel() {
	const x0 = 22
	const w = 196
	return (
		<svg className="hw-orbit" viewBox="0 0 240 300" preserveAspectRatio="xMidYMid meet" aria-hidden>
			<defs>
				<linearGradient id="hw-beam" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stopColor="#7fe0f0" stopOpacity="0.5" />
					<stop offset="1" stopColor="#12b5d6" stopOpacity="0.04" />
				</linearGradient>
				<radialGradient id="hw-cloud" cx="0.5" cy="0.5" r="0.5">
					<stop offset="0" stopColor="#eaf6f9" stopOpacity="0.5" />
					<stop offset="1" stopColor="#eaf6f9" stopOpacity="0" />
				</radialGradient>
			</defs>
			<path d="M -20 96 Q 120 18 260 96" fill="none" stroke="#7fe0f0" strokeOpacity="0.35" strokeWidth="1" strokeDasharray="2 5" />
			<path d="M 150 52 L 104 232 L 196 232 Z" fill="url(#hw-beam)" />
			<g className="hw-sat">
				<circle cx="150" cy="52" r="9" fill="#12b5d6" fillOpacity="0.22" />
				<rect x="146" y="48" width="8" height="8" rx="1.5" fill="#eaf6f9" />
				<rect x="132" y="50.5" width="12" height="3" rx="1" fill="#7fe0f0" />
				<rect x="156" y="50.5" width="12" height="3" rx="1" fill="#7fe0f0" />
			</g>
			<ellipse cx="60" cy="150" rx="70" ry="20" fill="url(#hw-cloud)" />
			<ellipse cx="150" cy="166" rx="84" ry="22" fill="url(#hw-cloud)" />
			<ellipse cx="220" cy="146" rx="60" ry="18" fill="url(#hw-cloud)" />
			<line x1={x0} y1="232" x2={x0 + w} y2="232" stroke="#eaf6f9" strokeOpacity="0.28" />
			{ORBIT.x.map((p, i) => (
				<line key={p} x1={x0 + p * w} y1={i === ORBIT.x.length - 1 ? 220 : 225} x2={x0 + p * w} y2="232" stroke={i === ORBIT.x.length - 1 ? '#7fe0f0' : '#eaf6f9'} strokeOpacity={i === ORBIT.x.length - 1 ? 1 : 0.7} strokeWidth="1.5" />
			))}
			<text x={x0} y="252" className="hw-svg-t">
				{ORBIT.first}
			</text>
			<text x={x0 + w} y="252" textAnchor="end" className="hw-svg-t">
				{ORBIT.last}
			</text>
		</svg>
	)
}

/** stage 5: the two commits, the rules first and the first score after */
function TestLog() {
	return (
		<div className="hw-log">
			{HOW.log.map((c) => (
				<p key={c.hash}>
					<i aria-hidden />
					<span className="mono">{c.time}</span>
					<b className="mono">{c.hash}</b>
					<span>{c.what}</span>
				</p>
			))}
		</div>
	)
}

/** How it works, the target of the navbar's "How it works": one strip read in the order the signal travels, each
 *  stage with its picture from the app, one number and the file it comes from. */
export function HowItWorks() {
	return (
		<section id="how" className="hw">
			<div className="hw-head">
				<div>
					<h2 className="display hw-title">{HOW.title}</h2>
					<p>{HOW.line}</p>
				</div>
				<div className="hw-links">
					<a className="hw-repo" href={SITE.repo} target="_blank" rel="noopener noreferrer">
						{HOW.repo} <ArrowUpRight size={15} strokeWidth={2.4} />
					</a>
					<a className="hw-repo" href={SITE.paper} target="_blank" rel="noopener noreferrer">
						{HOW.paper} <ArrowUpRight size={15} strokeWidth={2.4} />
					</a>
				</div>
			</div>
			<InView className="hw-path">
				<ol className="hw-stages">
					{HOW.stages.map((s, i) => (
						<li key={s.key} className="hw-stage" style={{ '--i': i } as React.CSSProperties}>
							<figure className="hw-frame" data-k={s.key}>
								{s.key === 'orbit' && <OrbitPanel />}
								{s.key === 'test' && <TestLog />}
								{'img' in s && s.img && (
									// eslint-disable-next-line @next/next/no-img-element
									<img src={s.img} alt={s.alt} width={720} height={900} loading="lazy" decoding="async" />
								)}
								<span className="mono hw-n">{String(i + 1).padStart(2, '0')}</span>
								{'caption' in s && s.caption && <figcaption className="mono">{s.caption}</figcaption>}
							</figure>
							<div className="hw-text">
								<i className="hw-run" aria-hidden />
								<p className="hw-num">
									<b className="display">{s.key === 'orbit' ? ORBIT.days : s.value}</b>
									<span>{s.unit}</span>
								</p>
								<h3>{s.title}</h3>
								<p>{s.text}</p>
								<p className="mono hw-src">{s.source}</p>
							</div>
						</li>
					))}
				</ol>
			</InView>
			<p className="hw-credit">{HOW.credit}</p>
		</section>
	)
}
