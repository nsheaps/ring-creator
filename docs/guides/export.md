---
title: Exporting for your jeweler
order: 9.5
summary: Export a design as a spec sheet, technical drawing, bill of materials, casting STL, 3D model or a complete jeweler pack.
---

# Exporting for your jeweler

Ring Creator can hand a design to a bench jeweler, a CAD designer or a caster. Everything is made in your browser from the same 3D model you see on screen; nothing is uploaded. The same design always gives the same files.

## Where to find it

- **Builder**: the **Export** button in the top bar.
- **Saved**: the **Export** button on each saved design.
- **Gallery**: the **Export** button on an example's detail page.

Pick what to export first:

| Choice          | Contents                                                        |
| --------------- | --------------------------------------------------------------- |
| Engagement ring | The engagement ring only.                                       |
| Band            | The wedding band only (needs a band on the design).             |
| Set             | Both pieces. 3D files show them side by side, as they are worn. |

Then pick a format.

## Formats

| Format                  | What it is for                                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Jeweler pack (ZIP)      | Everything below in one archive, plus `spec.json` (every measured number) and a `README.txt`.                                             |
| Spec sheet (PDF)        | Page 1: summary, a render of the current view and the bill of materials. Page 2: the technical drawing. Page 3: jeweler notes.            |
| Technical drawing (SVG) | Front, side and top views at a stated scale, with dimension lines, callouts, a 10 mm scale bar and a title block.                         |
| Bill of materials (CSV) | One row per metal part (grams and pennyweights) and per group of stones (count, size, carats). Opens in any spreadsheet.                  |
| Casting model (STL)     | Binary STL of the metal only, in millimetres, ready to print a casting pattern. Stones are left out so their seats stay open.             |
| 3D model (GLB)          | glTF binary for viewers and CAD tools. Materials are named after the metal or gem (for example `metal: 14k Yellow Gold`, `gem: Diamond`). |
| 3D model (OBJ + MTL)    | Wavefront OBJ with its material library, zipped together.                                                                                 |
| Design file (JSON)      | The design itself, to open again in Ring Creator.                                                                                         |

In the jeweler pack each piece gets its own STL (`stl/engagement.stl`, `stl/band.stl`) in its own position, so it can be printed and cast alone. A piece made of two metals also gets one STL per metal.

## What the numbers mean

- **Ring size**: US size to inner diameter with the standard formula, diameter = 11.63 + 0.8128 x size (mm); circumference is pi x diameter.
- **Shank and band**: palm thickness, palm width and top width are measured from the 3D model.
- **Head height**: how far the highest point of the setting sits above the finger.
- **Metal weight**: the volume of the 3D metal parts times the alloy's density (from the metal's model data), in grams and pennyweights (1 dwt = 1.555 g). Prongs that sink into the shank are counted twice, so treat the figure as an estimate within about 10 %.
- **Stones**: the center stone uses the carat and proportions you chose. Accent stones are counted from the model and their carats come from their volume times the gem's specific gravity.
- **Setting**: head style, prong count, prong wire diameter, tips and gallery rails, taken from the head's settings.

The jeweler notes add sizing and tolerances, the seat depth the center stone needs, notch depth for the prongs, a suggested casting alloy for each metal, the finish, and the space available for engraving.

## Limits

- Weights and carats are estimates from the model, not appraisals. A jeweler should measure the real stones before cutting seats.
- The model is a design reference. A CAD designer will usually rework it (sprues, wall thickness, shrinkage allowance) before casting.
- Titanium, tungsten, tantalum and black zirconium are machined rather than cast; the notes say so.
