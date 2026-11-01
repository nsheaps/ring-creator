# Audit of examples r1-001..r1-032 and r2-001..r2-033 against listing photos

Method: each listing's photo was compared by eye with our 3/4 render, then the research JSON (head, shank, tune, cut, carat, metals, band params) was corrected. Photos are not committed. Rings with no usable photo (listing gone, only page text, auction pages) were tuned from the page's factual description only and are marked "text only".

Verified against a photo and corrected: r1-001..011, r1-013..016, r1-018..024, r1-027, r1-029..032, r2-001..015, r2-017, r2-018, r2-020..024, r2-029..033. Text only: r1-012, r1-017, r1-025, r1-026, r1-028, r2-016, r2-019, r2-025..028.

## Gaps we cannot fix with existing builders

| id | What the photo shows | What we can't do | Suggested new head/shank |
| --- | --- | --- | --- |
| r1-013, r1-014, r1-017 | Domed Art Deco plaque: octagonal or hexagonal collar, pierced openwork, ten or more small diamonds and milgrain on a bombe top | No domed plaque head; `vintage-filigree` renders as a plain prong head with an engraved shank | head `deco-plaque` (dome, polygon collar, pierced scrolls, accent diamonds) |
| r1-015 | Huge elongated bombe cocktail dome, 98 pave diamonds in radiating ribs, centre in 4 claws | Same as above, plus ribbed pave dome | shank `bombe-dome` / head `deco-plaque` |
| r1-016, r1-023 | Double or triple-split claws on a wire basket; cathedral shoulders with tiny stones | Split claws exist but shoulder diamonds on cathedral shanks do not | shank option `shoulderStones` on `cathedral` |
| r1-018 | Hexagonal bezel-like collar with stepped layers, pierced gallery | Only round bezel; no hexagon outline | head `bezel-polygon` (sides 4/6/8) |
| r1-019 | Row of three large old-mine stones with more along the shoulders, low claws | Three-stone head with small shoulder stones | shank `graduated-shoulders` |
| r1-020 | Large cushion-shaped old-mine in a low silver bezel, three diamonds each shoulder | Bezel has no cushion outline; shoulder stones only as an even pave run | head `bezel-cushion`; shank `shoulder-stones` |
| r1-021 | Elongated hexagon halo of rose-cut stones, floating over a hair-thin band | No hexagon halo | `halo-oval` option `haloShape: hexagon` |
| r1-005, r1-006, r1-007, r2-001, r2-003 | Oval centre with hidden halo visible as a thin rim; r1-007 band crosses under the head | Hidden halo is round only; crossover shank is X shaped, not a tapering overlap | `hidden-halo` following the centre outline; shank `tapered-bypass` |
| r2-003 | Bamboo-textured band with single stones set in the nodes | No bamboo shank; `twig` is bark textured with no stones | shank `bamboo` with `stationStones` |
| r2-008 | Two pave strands twisting under a halo | `twisted` is a bare rope with no stones | shank `twisted` option `pave: true` |
| r2-010, r2-011, r2-020, r2-021 | Trapezoid or tapered baguette sides; r2-021 bezels all three stones | Sides are approximated with emerald-cut or baguette accents; no trapezoid cut, no bezel trilogy | cut `trapezoid`; head `three-stone` option `setting: bezel` |
| r2-012, r2-017, r2-018, r2-022, r2-023 | Split, X or bypass shanks lined with pave (and r2-022 marquise accents) | Split, crossover and bypass shanks carry no stones | pave option on `split`, `crossover`, `bypass` |
| r2-013 | Six tiny accents in two groups of three under a 6-prong head | `cluster` makes a full halo of shared-prong stones; we use a plain 6-prong head and lose the accents | head `six-prong-accent-clusters` |
| r2-014, r2-029..031, r2-033 | Prong-set stones larger than the band is wide, graduating in size; r2-029..031 are a curved contour that arches up at the centre | Stones are capped by band width, uniform in size; the contour curve only appears when paired with the engagement ring | band option `stoneSizeProfile: graduated`; allow stones wider than the band |

| r2-024 | Oval centre, graduated straight baguettes (0.25 and 0.10 ct) on each side | `five-stone` uses one outer ratio and an even sideRatio; baguette orientation follows the shank | head `five-stone` baguette orientation parameter |
| r1-025, r1-026, r1-028, r2-026 | Famous rings with no photo fetched | Not verifiable | |
| r1-029..r1-032 | Band profile is domed with milgrain in a recessed step; r1-030 has two bead rows each edge | Single bead row per edge | milgrain `rows: 2` already offered (used for r1-030) |

## Other notes

- Blue Nile pages show settings with a 1 ct round, Brilliant Earth pages with a 2 ct oval; the examples now use the shown stone shape and carat.
- The listing photos show stones sitting low, so `placement.raise` was lowered across the solitaires and halos.
- Page-text-only claims that the photos contradicted: r1-005, r1-006, r1-007 (centre is oval, not round), r1-020 (three accents each shoulder), r2-002 (oval centre with pear sides).

## Resolved by the band, stone and gem work

- Cuts `trapezoid` and `tapered-baguette` exist; r2-010, r2-011 and r2-020 use them as side stones (the narrow end faces the centre stone).
- Band stones can graduate in size, be wider than the band with a raised setting, and be limited to a stone count (`sizeProfile`, `endScale`, `raise`, `stoneCount`): r2-014 and r2-033 use them.
- `contour-curved` and `chevron` bands carry stones that follow the bend (`stones`): r2-029, r2-030, r2-031 and r4-015 use them. A centre pear (r2-029) is still a round stone.
- Still open: r2-003 needs a bamboo engagement shank (the new `bamboo-band` is a wedding band); r2-021 needs a bezel trilogy and r2-024 baguette orientation (heads).
