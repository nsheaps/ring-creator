---
title: FAQ
order: 13
summary: Twenty-five straight answers about what Ring Creator is, how accurate it is, and how to use it.
---

# Frequently asked questions

## About the app

**1. Is this a store? Can I buy the ring I design?**
No. Ring Creator is a design and learning tool. It does not sell rings, take orders or connect you to a jeweller. Take your design, snapshot or exported file to a jeweller of your choice.

**2. Do I need an account?**
No. There is no sign-up and no login. Your designs live in your own browser. See [Saving, sharing and comparing](#/docs/saving-sharing-compare).

**3. Is it free? Who makes it?**
It is a free, open-source project (the code is under the MIT licence) hosted on GitHub Pages at <https://nsheaps.github.io/ring-creator/>, and the source is at <https://github.com/nsheaps/ring-creator>.

**4. Does it send my designs anywhere?**
No. Nothing is uploaded. A design only leaves your browser if you copy a share link or export a file and send it yourself. The app does not use analytics that identify people.

**5. Can I use it on my phone?**
Yes. It is designed to work on small screens, with controls in tabs under the viewer. Drag to turn the ring, pinch to zoom. Older phones may render more slowly. If the picture does not appear, see [Troubleshooting](#/docs/troubleshooting).

## Accuracy

**6. How accurate are the sizes?**
Ring sizes are accurate to the standard formula the app uses: inner diameter in millimetres = 11.63 + 0.8128 x US size, so US 6.5 is 16.9 mm. Stone sizes are estimated from carat weight using each material's density and typical proportions, so a real stone can differ by a few tenths of a millimetre. Shank and band widths are shown exactly as set. A final drawing from your jeweller is the real authority.

**7. Why does the stone look different from the real thing?**
The viewer uses real-time graphics with simplified lighting. Real stones are lit by many sources and move with your hand. Clarity and colour grades are shown as gentle visual cues (a faint haze for lower clarity, a faint tint for lower colour), not photographs. Treat it as a way to judge proportions and style, never sparkle or exact colour.

**8. Are the shapes exact?**
They are stylised approximations. Real rings have hand finishing, engraving and tolerances that the parametric shapes cannot match. Antique cuts such as old mine and old European are approximated, not reproduced facet by facet.

**9. Can I trust the carat-to-millimetre numbers?**
They are good estimates. They come from a standard weight-estimation formula and each gem's density, so a one-carat sapphire is slightly smaller across than a one-carat diamond. See [Choosing a stone](#/docs/choosing-a-stone).

**10. Does the app say whether a combination is actually buildable?**
Only partly. The builder prevents combinations that do not suit a stone (such as a head not made for a cut) and keeps the head joined to the shank. It does not check manufacturing limits like minimum metal thickness, prong strength or whether a very wide stone fits a small finger. Your jeweller must confirm.

## Prices

**11. How are prices used?**
Prices are rough and informational. Metal values are indicative figures per gram stored with each metal, and gem prices are typical ranges per carat near one carat. Example rings show a price when a public listing gave one. None of these is a quote, and none of it is an offer to sell.

**12. Why do prices in the gallery look low (or high)?**
Many retailer prices are for the setting only, without the centre stone, and some are "from" prices. Antique prices are asking prices, and some pieces have sold. Prices were gathered in October 2026 and will move. See [Gallery and examples](#/docs/gallery-and-examples).

**13. Why is platinum not always more expensive per gram?**
The app's per-gram figures are indicative, and platinum is much denser than gold, so a platinum ring weighs more and usually costs more overall. Per-gram price alone does not tell you the price of a ring.

## Using the builder

**14. Why is a head greyed out?**
Each head is designed for certain stone cuts. When your current cut does not suit it, the card is disabled with a note, such as "Not made for ... stones". Change the cut or the head.

**15. Why is Band or Set disabled in the viewer?**
You have not added a matching band. Open the Band tab and tick **Include matching band**.

**16. Why did my band not curve around the head?**
Only some band styles can curve, and the Fit setting must allow it. Leave Fit on Auto or choose Contour, and pick a contour-capable style such as contour curved. See [Wedding bands and fit](#/docs/wedding-bands-and-fit).

**17. Can I use two stones, or add my own gem?**
You can use a toi et moi head for two main stones and an accent stone of any material in the Accents tab. There is no way to add your own gem in the app itself. Developers can add a gem as data. See [Adding components](#/docs/adding-components).

**18. Can I engrave a name or a date?**
Engraved and milgrain appear in the preview as surface texture only. The app does not carve custom text. Arrange engraving with your jeweller.

**19. Can I get a file for casting or 3D printing?**
Not currently. Exports are the design as JSON and PNG snapshots. The geometry is a preview, not manufacturing-ready.

## Technical and access

**20. What is WebGL, and why do I need it?**
WebGL is the browser feature that draws the 3D view. Nearly all current browsers support it. If it is missing or blocked you will see a message in place of the ring. See [Troubleshooting](#/docs/troubleshooting).

**21. Is it accessible?**
The controls are standard form elements (buttons, selects, sliders, checkboxes) with labels, so they work with a keyboard and assistive technology. The spec summary under the viewer describes the stone, size, metals and ring size in text. Auto-rotate is off by default. The 3D view itself is a visual aid and not fully operable by keyboard. If you hit a barrier, please report it on GitHub.

**22. Does it work offline?**
It is a website, so you need to load it at least once, and it is not built as an offline app. Designs stay in your browser's storage, but you need a connection to open the page again unless your browser has cached it. Do not rely on it offline.

**23. Which browsers work?**
Any current browser with WebGL should work. The project's automated tests focus on Chromium, with lighter checks in Firefox and Safari's engine (WebKit). Very old browsers and some locked-down environments will not run the 3D view.

## Sharing and credit

**24. How do I cite Ring Creator or the example data?**
For the tool: "Ring Creator, https://nsheaps.github.io/ring-creator/, accessed (date)." For an example ring, cite the original source linked from its page rather than the app, because the app's example is only inspired by that listing. For jewellery facts, the guides summarise common trade knowledge, so confirm anything important with a qualified gemmologist or jeweller.

**25. I found a mistake or want a new style. What do I do?**
Open an issue at <https://github.com/nsheaps/ring-creator>. For a missing head, cut, shank or band, developers can add one as data. The [developer guide](#/docs/adding-components) explains how, and the [glossary](#/docs/glossary) defines the terms used in reports.
