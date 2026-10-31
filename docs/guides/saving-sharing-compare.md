---
title: Saving, sharing and comparing
order: 9
summary: How Save, the Saved page, share links, JSON files and Compare work, where your data lives, and what the limits are.
---

# Saving, sharing and comparing

Ring Creator has no accounts and no server that stores your designs. Everything is kept in your own browser, and anything you send to someone else travels either as a link or as a file you hand over yourself.

![Saved designs]({{base}}screenshots/pages/saved.png)

## What is stored, and where

| What                            | Where                                                      | Lasts                                             |
| ------------------------------- | ---------------------------------------------------------- | ------------------------------------------------- |
| The design you are working on   | Your browser's local storage, updated as you edit          | Until you replace it, reset it or clear site data |
| Designs you press **Save** on   | Your browser's local storage, with a small preview picture | Until you delete them or clear site data          |
| The Compare picks (up to three) | Your browser's session storage                             | Until you close the tab                           |

Local storage belongs to one browser profile on one device. A design saved on your phone does not appear on your laptop, and a private or incognito window starts empty and forgets everything when closed. If you need a design on another device, use a share link or an exported file.

## Autosave of the working design

The builder remembers your current design automatically. Close the tab, come back later, open the builder and you will find it where you left it. This is not the same as saving: it holds one working design, and opening an example or a shared link replaces it.

## Save

Press **Save** in the builder's top bar. The app takes a thumbnail of the 3D view, stores the design in your browser and shows a message. Saving the same design again updates that entry rather than making a copy, so give each experiment its own name and export a file if you want to keep several versions of the same idea. The thumbnail is a small JPEG so that many designs fit in the storage your browser allows.

## The Saved page

Open [Saved](#/saved) from the top bar. It lists your saved designs as cards with a thumbnail, name and the date they were last changed. From a card you can open the design in the builder, rename it, duplicate it, delete it and add it to a comparison. If you have nothing saved yet, the page points you to the builder and the gallery.

## Share link

**Share** copies a link such as `.../#/build?d=...` to your clipboard. The long text after `d=` is the whole design, written as JSON and then encoded so it is safe in a link. There is no short code and no lookup on a server: the link itself contains the ring.

- Anyone who opens the link sees the same ring in their own builder, as a new working design. It does not overwrite their saved designs.
- If their browser blocks clipboard access, the app shows the link in a message so you can copy it by hand.
- A link that has been cut off or damaged cannot be read. The builder then says so and leaves your current design as it was.
- A plain default-sized design produces roughly 1.2 kB of encoded design data, plus the address. Designs with many custom options or very long names are longer.
- The link holds a snapshot. If you change the ring afterwards, send a new link.

**Good to know:** because the design is in the link, anyone who sees the link can read it. Do not put anything private in the design name.

## Export and import JSON

**Export JSON** downloads a file named after your design, for example `my-ring.json`. It is plain text that holds the complete design, so you can email it, keep it as a backup or hand it to a jeweller or designer.

**Import JSON** reads such a file and loads it as your working design. The app checks that the file looks like a Ring Creator design. If it does not, you will see "That file is not a Ring Creator design" and nothing changes. After a successful import the design is yours to edit, and you can Save it.

A design file has this broad shape:

```json
{
  "version": 1,
  "name": "My ring",
  "ringSizeUS": 6.5,
  "engagement": { "center": {}, "head": {}, "shank": {}, "placement": {}, "finish": "polished" },
  "band": {}
}
```

The real file has more fields than this sketch. If you plan to edit files by hand, export one first and use it as your template. A band of `null` means the design has no matching band.

## Compare

Compare shows up to three designs side by side so you can choose between finalists.

Ways in:

- In the builder, press **Open in Compare** to send the current design to the Compare page.
- On an example ring's page in the [Gallery](#/gallery), press **Add to compare**.
- Open [Saved](#/saved) and tick designs to compare.

Compare keeps at most three. If you add a fourth from a gallery page, the oldest pick drops out so the three most recent remain. You need at least two designs for a comparison to be useful. The page shows the rings next to each other with a table that highlights what differs: stone, cut, head, shank and metals.

Tips for a fair comparison:

- Compare designs with the same ring size.
- Look at all of them in the same view (Ring or Set) and the same camera angle.
- Change one thing between versions, so you know what made the difference.

## Privacy

- Your designs never leave your browser unless you share a link or a file yourself.
- There is no sign-up, and the app does not send your designs to a server.
- Links to retailers or sources open other websites, and those sites have their own policies.
- Clearing your browser's site data removes your working design, saved designs and Compare picks.

## Limits

- **Browser storage is finite.** Most browsers allow a few megabytes of local storage per site. Thumbnails keep entries small, but hundreds of designs could fill it. If storage is full or blocked, the app keeps working in memory only, and nothing is remembered after you close the tab. Export files for anything you care about.
- **Private windows** and some privacy settings block or wipe storage.
- **Links get long.** A long design makes a long link. Some messaging apps and services cut off very long links. If a link fails, send an exported file instead. See [Troubleshooting](#/docs/troubleshooting).
- **No cloud backup.** If you clear your data or switch devices, the only copies are the ones you exported or shared.
- **Three designs** in Compare at once.

## Handing a design to a jeweller

1. Press **Snapshot** in a few views (Ring, Band, Set, Top, Side).
2. **Export JSON** and attach the file.
3. Include your ring size, metals and the stone's millimetre size from the spec summary.
4. Explain that the 3D model is a preview, and ask for their own drawing before anything is made.

See also [Building a ring](#/docs/building-a-ring) and the [FAQ](#/docs/faq).
