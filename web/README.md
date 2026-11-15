# Web app

The landing page and the map for the NISAR surface change project. Next.js 16, React 19, Tailwind 4, MapLibre 6.

## Run it

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm build && pnpm start
```

`pnpm build` runs `check:dashes` first: no en or em dash may appear anywhere in the app's own files.

## The flood map (/explore)

`/explore` is a guided map of three steps after the landing (step 1), one main action each: the streets step (it
opens on the official map, "the official map said safe", and one switch shows our simulation's streets, "our
simulation saw it"; any street tapped shows what each record says there), NISAR sees more water (swipe against
Sentinel-1, open water on both sides), where the map said safe (the streets outside every official zone: what our model found there and how often its
warnings there were right). `/explore?step=2` to `4` opens a step,
`/explore?all` the free explorer with every layer, and from there `/explore?screen=exam` and `?screen=rain` the marsh
model's test and rain outline. Code: `src/components/guided/`, copy: `src/content/guided.ts`. Every number is read at
run time from a baked or hand-kept file:

```bash
# from the repo root, pipeline environment, PYTHONPATH set to the repo root
python web/scripts/bake_streets.py --sim-raster <sim_hmax_25m.tif> --upv-raster <upv_depth5.tif> --upv-outlines <outlines> --method "night_before=The night before=<raster>=<results path>" --method "same_morning=The same morning=<raster>=<results path>"   # the streets step and the last one (needs data/interim downloads, see its docstring)
python web/scripts/bake_swipe_open.py              # step 3: open water only on both sides
python web/scripts/bake_exam.py --ref <git ref>    # the marsh model's screens: the colour layer and the rain outlines from the frozen model maps of that ref
python web/scripts/bake_exam.py --result <result.json> --result-source "<how to cite it>"   # the marsh model screen's numbers from a new test
```

The numbers of the last step sit in `public/layers/guided/coming.json` and those of the marsh model's test in
`public/layers/guided/test_score.json`: both can be edited by hand, no code.

## The game

`/game` replays the DANA "Adam" storm at the Pego-Oliva marsh as a guessing game: the player sees the last NISAR
pass before the rain and the rain forecast of that evening, marks ten cells of a 476 m grid where they expect new
water, and is scored against the pass after the storm. Every cell then explains itself from the measurements
(height above the sea, water before, the Copernicus map, what Sentinel-1 saw the same evening). The cells are
measured once by `python scripts/bake_game.py` from the baked frames, the terrain tiles and the EMS outline, into
`public/layers/pego_oliva/game.json`. Code: `src/components/game/`, copy: `src/content/game.ts`.

## The NISAR views

`/views` is a demo of four views that answer "where is NISAR?" with what only NISAR gives: a swipe between the
Sentinel-1 water map and NISAR's of the same evening, coherence switched on and off over dry marsh, NISAR soil
moisture before the DANA, and NISAR water on every pass of track 066 D. It is a demo of reusable assets, not a
final screen. Run from the repo root with the pipeline environment:

```bash
python web/scripts/bake_views.py                                  # every view of every site
python web/scripts/bake_views.py --views swipe --sites pego_oliva
```

It writes `public/layers/<site>/views/*.webp` (small RGBA pictures that all cover the bounds in `views.json`, the
map grid of `meta.json` for Albufera and Pego-Oliva) and `public/layers/<site>/views.json`: dates, files, captions,
and every number with the files it comes from. It reads the stacks, the cached CV probabilities, the coherence,
the optical answer key and the Sentinel-1 maps of `data/`, and the NISAR soil moisture windows from NASA Earthdata.
Code: `src/components/views/`.

## Radar data

`pnpm radar --raw <folder outside the repo>` asks NASA's public catalogue (CMR) for every NISAR GCOV and GUNW
granule over each site, downloads only the small browse preview of each (about 3 MB, never the 1 to 7 GB granule),
cuts it to the site box and writes `public/radar/<site>/*.webp` plus `src/data/passes.json`. No login needed.

## Images made with SI

The hero photographs (`public/img/hero-*`) and the story icons (`public/img/icons/*`) were generated with Gemini.
Space Apps 2026 asks for a visible watermark on every SI-generated image, so `scripts/make_hero.py` and
`scripts/make_icons.py` bake one into each file. Radar images are real NISAR data and carry none.
