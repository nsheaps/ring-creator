# Photo audit of examples r3-001..r5-034

Method: listing photo (main product image, or the plain-background top view where the page exposes one) compared by eye with our 3/4 render; facts read from the listing page. No photos or prose are stored in the repo.

## What was corrected (JSON in data/research/rings-3..5.json)

Head/shank/cut/colour/metals/orientation/accents changed for: r3-001 r3-002 r3-003 r3-004 r3-005 r3-006 r3-008 r3-009 r3-010 r3-015 r3-017 r3-018 r3-021 r3-022 r3-023 r3-027 r3-030; r4-007 r4-010 r4-015 r4-016 r4-017 r4-018 r4-021 r4-022 r4-028 r4-031 r4-032 r4-036; r5-001 r5-002 r5-003 r5-004 r5-005 r5-007 r5-008 r5-009 r5-012 r5-022 r5-023 r5-026 r5-027 r5-030 r5-032 r5-034. Each carries a "Photo audit:" sentence in its notes.

Checked against a photo and left as is: r3-007 r3-011 r3-012, r4-003 r4-004 r4-005 r4-006 r4-008(shape) , r5-006 r5-013 r5-019 r5-021 r5-031.

## Not verifiable from a photo

- Page blocked (403) or no usable image: r3-013 r3-014 r3-019 r3-020 r3-024 r3-025 r3-026 r3-029 r3-031; r4-001 r4-002 r4-009 r4-011..r4-014 r4-023..r4-027 r4-029 r4-030 r4-033..r4-042 (the latter only on facts; the BE on-hand photos are not usable); r5-014 r5-015 r5-016 r5-018 r5-028 r5-033.
- Image is a site logo / storefront: r3-016 r3-032 r5-016.
- Page photo is not the listed ring (generic hero image): r5-010 r5-011 r5-024 r5-025 r5-029 (Vrai shows one emerald solitaire); r3-028 (photo is a sapphire cluster, not the Van Cleef toi-et-moi).

## Gaps we cannot build

| id | Photo shows | Cannot do | Suggested new head/shank |
|---|---|---|---|
| r3-001 | oval with 3-4 stone marquise/round cluster each side | clustered wings (only one stone per side) | head `cluster-flank` (n stones per side) |
| r3-002 r3-003 | hexagon centre, baguette then triangle each side | two different side cuts per side | `five-stone` with separate inner/outer cut |
| r3-004 r3-009 | 3 small round stones per side / chevron stack | multi-stone flanks | same `cluster-flank` |
| r3-005 r3-006 r3-030 r5-013 | kite centre with a fan of baguettes/rubies under the point | half-halo fan below a point; true kite outline | head `kite-fan` |
| r3-009 | blue-violet colour-change alexandrite | colour not in alexandrite list | gem colour `blue-violet` |
| r3-017 | engraved split shoulders | engraved pattern | shank option engraved split |
| r3-021 | pear side stones inside a double halo, split pave | pears on a halo | `halo-with-sides` |
| r4-008 | sapphire/diamond alternating | alternating stone material | band param `altColor` |
| r4-015 r4-017 r4-018 r4-019 | stones on a V/contour band; nested double crown | stones on contour/chevron; two-ring nest | `contour-stoned`, `nested-crown` |
| r4-020 | round band with segmented bumps | segmented bumps | band `segmented` |
| r4-021 | alternating marquise with milgrain bezel edge | milgrain around each stone | shared-prong + milgrain |
| r4-022 | open infinity weave | loose strands | band `infinity-weave` |
| r4-028 r4-031 | off-centre inlay; engraved scroll inlay | inlay offset, scroll pattern | `mens-inlay` offset + engraved |
| r5-001..005 | swept bypass tension, stone between two blade ends | true tension blades on bypass | head `tension-bypass` |
| r5-009 | beaded shank | beaded rope | shank `beaded` |
| r5-017 | cushion rotated 45 deg in lozenge-shaped open head | 45 deg rotation, lozenge frame | placement rotation |
| r5-020 r5-022 | hexagon frame | hexagonal bezel/frame | head `bezel-hex` |
| r5-023 r5-027 | two-tone parts (prongs vs bezel, ribbons) | per-part metal | per-part metal |
| r5-034 | four thin rings and 3 rough rose-cut stones | cluster on a stack | head `trio-cluster` |

## Resolved by the band, stone and gem work

- Sapphire blue, royal blue and teal are darker and less saturated, and the gem shader no longer over-saturates dark blues; r3-001, r3-017, r3-018 and r4-015/016 read as the inky teal and deep blue in the listing photos.
- Alexandrite has a `blue-violet` colour (r3-009 uses it).
- Band `alternate` makes every other stone another gem (r4-008 alternates sapphire and diamond; stones go in the `band-stone2` slot).
- `contour-curved` and `chevron` can carry stones (r4-015). Still open: marquise clusters in the V, the nested crown and the segmented, infinity-weave and inlay styles.

## Second pass: compared render against photo (r1-013, r3-002, r3-003, r3-009, r3-010, r3-023, r5-004, r5-005, r5-020, r5-022)

Data-only changes: r1-013 gets a large domed plaque and a narrow shank; r3-002 an elongated hexagon with baguette flanks; r3-003 rose gold, salt-and-pepper colour and triangle flanks; r3-009 the chevron stacker as a band; r3-010 a marquise fan cluster; r3-023 a thin full bezel; r5-020 and r5-022 point-up hexagon frames with thinner rims; r5-004 and r5-005 a one-carat round and tuned blades. r4-036 could not be re-checked (Brilliant Earth returned 403).

Remaining gaps that need new builders:

- r3-002 r3-003: triangle outer stones beyond the baguettes (five-stone has one cut for all side stones); side baguette long axis should run along the finger; graded pave on r3-003.
- r3-010: free-standing marquise leaves on a bypass vine instead of a cluster on a regular shank.
- r3-023: peach-pink colour of the photo stone is warmer than the pink in the list.
- r5-004 r5-005: smooth swept blades low on the band; pave on the blades (r5-005).
- r5-020 r5-022: corner beads on the hexagon frame; baguettes each in its own bezel on the shank (r5-022).
- r1-013: fully openwork pierced plaque with a star of ribs and old-cut rim stones in cartouches; engraved shank is approximated by the vine pattern.
