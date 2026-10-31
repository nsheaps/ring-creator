---
title: Building a ring
order: 8
summary: A tour of the builder: every tab, the placement controls, the 3D viewer, and three worked examples with exact choices.
---

# Building a ring

The [builder](#/build) has two halves: a 3D viewer and a set of tabs to edit the design. Everything you change rebuilds the ring straight away, and your work is remembered in your browser as you go.

![The builder]({{base}}screenshots/pages/builder.png)

## The top bar

Above the viewer you will find:

| Control             | What it does                                                                    |
| ------------------- | ------------------------------------------------------------------------------- |
| **Design name**     | Names the design (up to 80 characters). Shown in Saved and used for file names. |
| **Save**            | Stores the design in this browser, with a small thumbnail.                      |
| **Share**           | Copies a link that contains the whole design.                                   |
| **Export JSON**     | Downloads the design as a file.                                                 |
| **Import JSON**     | Loads a design from a file.                                                     |
| **Open in Compare** | Sends the design to the Compare page.                                           |
| **Reset**           | Returns to the default ring.                                                    |

A short message appears at the bottom after each action. See [Saving, sharing and comparing](#/docs/saving-sharing-compare) for details.

## The 3D viewer

**Orbit and zoom.** Drag to turn the ring around, scroll or pinch to zoom, and use a two-finger drag or right-button drag to pan. The camera glides rather than snapping.

**View buttons:**

| View | Shows                                 |
| ---- | ------------------------------------- |
| Ring | The engagement ring alone             |
| Band | The wedding band alone                |
| Set  | The engagement ring and band together |

Band and Set are disabled until you switch on a matching band. The viewer opens on Set when there is a band.

**Camera presets:** 3/4 (a flattering angled view), Front, Top (looking down on the stone, good for checking east-west fit) and Side (profile, good for checking setting height and band gap).

**Auto-rotate** slowly spins the ring, which is great for showing someone else.

**Snapshot** downloads a PNG of the current view named after your design. It is handy for sending to a jeweller or for a quick message.

**Spec summary** under the viewer shows the stone (carat, material, cut), its size in millimetres (length x width x depth), the metals in use and the ring size.

If the picture is blank or a message appears, see [Troubleshooting](#/docs/troubleshooting).

## The tabs

### Stone

![Stone tab]({{base}}screenshots/components/gem/diamond.png)

- **Gem material:** Natural gems and a "Lab-grown and synthetic" group (lab-grown diamond and moissanite). See [Choosing a stone](#/docs/choosing-a-stone).
- **Color:** swatches for the shades that material comes in.
- **Cut:** a card for each shape. See [Stone cuts](#/docs/stone-cuts).
- **Carat:** a slider from 0.25 to 5 ct. It moves in 0.05 ct steps below one carat and 0.1 ct steps above. The millimetre dimensions appear next to the number.
- **Aspect ratio:** appears for cuts that can be longer or wider. Drag to stretch an oval, or to fatten a marquise.
- **Clarity:** FL to I2.
- **Colour grade:** appears for colourless stones such as diamond (D-F down to S-Z).

### Head

![Head tab]({{base}}screenshots/components/head/halo-round.png)

Pick a head card (see [Settings and mounts](#/docs/settings-and-mounts)). Cards that do not suit the current cut are disabled with the reason "Not made for ... stones". Below the cards sit the head's own options, then the **Placement** group:

| Control                    | Range                    | Meaning                                                                                                                                                                                   |
| -------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Orientation**            | North-south or east-west | Whether the stone's long axis runs along the finger or across it                                                                                                                          |
| **Raise (setting height)** | 0 to 5 mm                | Clearance between the shank top and the stone's base. More raise sits the stone higher and shows more of the head. The builder clamps very low values so the head always joins the shank. |
| **Tilt**                   | minus 25 to 25 degrees   | Tips the stone toward the fingertip (positive) or the knuckle (negative)                                                                                                                  |
| **Rotate**                 | minus 45 to 45 degrees   | Spins the stone about its own vertical axis (set a princess as a diamond)                                                                                                                 |
| **Offset along band**      | minus 4 to 4 mm          | Slides the stone along the band, for bypass or asymmetric looks                                                                                                                           |

Tips: a low raise is snug and snag-resistant but leaves less room for a contoured band. A tilt of a few degrees gives a modern look. East-west with a low raise is the signature modern bezel.

### Shank

![Shank tab]({{base}}screenshots/components/shank/tapered.png)

Pick the shank card (see [Shanks and styles](#/docs/shanks-and-styles)), then fine-tune its options. Picking a new shank resets that shank's options to their defaults but keeps your head, metals and stone.

### Metals

![Metals tab]({{base}}screenshots/components/metal/platinum.png)

Metal selectors for head, shank, band and band accent metal, a "Match all to" row of swatches and finish selectors (engagement ring and band). When metals differ, a **Mixed metals** chip appears. See [Metals and mixed metals](#/docs/metals-and-mixed-metals).

### Accents

![Accents tab]({{base}}screenshots/components/head/halo-oval.png)

Accent stones are the small ones: halo stones, side stones, pave on the shank. The Accents tab has one group for the engagement ring and, if a band is on, one for the band. Each has a material, colour, cut and **stone size** (0.8 to 4 mm). A plain head with no extra stones will not show any change here.

### Band

![Band tab]({{base}}screenshots/components/band/contour-curved.png)

Tick **Include matching band** to add one. Choose a style, then set **Width** (1.2 to 8 mm) and **Thickness** (1.0 to 3.2 mm). Styles that use two metals (the mixed-metal band and men's inlay) show a **Second metal** selector. See [Wedding bands and fit](#/docs/wedding-bands-and-fit).

### Fit

![Fit tab]({{base}}screenshots/components/band/chevron.png)

Choose the **Ring size (US)** and the **Band fit**: Auto, Flush or Contour. The ring size list shows the inner diameter in millimetres.

## Three worked examples

Each lists every choice. Start from **Reset** (a fresh default ring) so you begin from the same place. Anything not listed stays at its default: 6.5 ring size, polished finish, auto fit.

### 1. Classic solitaire

A timeless, durable round diamond in platinum.

![Classic solitaire]({{base}}screenshots/components/head/solitaire-6-prong.png)

| Tab    | Choice                                                                                  |
| ------ | --------------------------------------------------------------------------------------- |
| Stone  | Diamond, colorless, **round brilliant**, 1.00 ct, clarity **VS2**, colour grade **G-J** |
| Head   | **Solitaire 6-prong**; orientation north-south; raise 1.2 mm (default)                  |
| Shank  | **Plain round**                                                                         |
| Metals | **Platinum** for head, shank and band (tap the platinum swatch under "Match all to")    |
| Band   | Include band; style **Plain comfort**; width 2.0 mm; thickness 1.8 mm                   |
| Fit    | US 6.5; fit Auto                                                                        |

Why it works: round brilliant and six prongs maximise sparkle with strong security, platinum keeps the stone white and is hypoallergenic, and a plain comfort band sits flush against a low head. Check Set view and the Side camera to see the band touching the shank.

### 2. Vintage halo with a contoured band

A soft, glittery look with a curved band that hugs the halo.

![Vintage halo]({{base}}screenshots/components/head/halo-cushion.png)

| Tab     | Choice                                                                               |
| ------- | ------------------------------------------------------------------------------------ |
| Stone   | Diamond, near-colorless, **cushion**, 1.50 ct, clarity **VS2**, colour grade **G-J** |
| Head    | **Halo cushion**; north-south; raise 1.6 mm                                          |
| Shank   | **Milgrain** (or Vintage filigree if you want more lace)                             |
| Metals  | Platinum for head and shank; the band 14k rose gold or platinum                      |
| Finish  | Engagement ring **Polished**; band **Milgrain**                                      |
| Accents | Engagement: diamond, colorless, **round brilliant**, stone size 1.4 mm               |
| Band    | **Contour curved**; width 1.8 mm; thickness 1.6 mm                                   |
| Fit     | US 6.5; band fit **Contour**                                                         |

Why it works: a cushion with a cushion halo repeats the outline. The milgrain details sit in the vintage family, and a contour band curves around the taller halo. Use the Top camera to see the curve and the Side camera to see the gap close.

### 3. Modern east-west bezel in mixed metals

A low, sleek, wide stone with a two-tone look.

![Modern bezel]({{base}}screenshots/components/head/bezel-full.png)

| Tab    | Choice                                                                                                                 |
| ------ | ---------------------------------------------------------------------------------------------------------------------- |
| Stone  | Lab-grown diamond, colorless, **emerald cut**, 1.50 ct, clarity **VS1**; aspect ratio about 1.4                        |
| Head   | **Full bezel**; **east-west**; raise 0.6 mm; tilt 0                                                                    |
| Shank  | **Plain flat**                                                                                                         |
| Metals | Head **14k yellow gold**; shank **platinum**                                                                           |
| Finish | Engagement ring **Satin**                                                                                              |
| Band   | **Mixed-metal band**; first metal 14k yellow gold, second metal platinum; width 3.0 mm; thickness 2.0 mm; finish Satin |
| Fit    | US 7; band fit **Flush**                                                                                               |

Why it works: a low full bezel is very secure and snag-resistant, the east-west emerald cut feels contemporary, the warm head sits on a cool shank, and the band repeats both metals so the two rings look related.

## Habits that help

- Change one thing at a time and look from three angles.
- Use Side view when checking raise and band gap; Top view for orientation and width.
- Before a big experiment, use Export JSON to keep a copy. Saving again overwrites the earlier save of the same design.
- Use Snapshot for the version you show someone.
- Remember the 3D view is a preview. Always get the final dimensions from your jeweller.

Next: [Saving, sharing and comparing](#/docs/saving-sharing-compare).
