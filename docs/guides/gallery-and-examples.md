---
title: Gallery and examples
order: 10
summary: How to browse, filter and borrow from the 100+ example rings, what a design family is, and an honest note about where the examples and prices come from.
---

# Gallery and examples

The [Gallery](#/gallery) is a collection of more than 100 example rings, each one a complete design you can look at in 3D, read about and open in the builder. It is the quickest way to find a style you like when you do not yet know the words for it.

![The gallery]({{base}}screenshots/pages/gallery.png)

## Browsing

Each card shows a picture and the ring's name. Cards are grouped into a grid, and a line above the grid says how many rings match, for example "24 of 108 rings". Click a card to open its page.

### Filters

Use the filter bar to narrow the grid. You can combine as many as you like:

| Filter             | What it does                                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Search**         | Matches words in the name, description, category, style family, cut, head, shank, stone, metals and tags. Several words must all match. |
| **Metal**          | Yellow, white, rose and so on, based on the metals used.                                                                                |
| **Stone**          | The centre stone's material, such as diamond or sapphire.                                                                               |
| **Cut**            | The centre stone's shape.                                                                                                               |
| **Head**           | The setting style.                                                                                                                      |
| **Category chips** | Broad groups such as solitaire or band. Click one to show only that group, click it again or press All to go back.                      |
| **Sort by**        | Featured, Name, Price low to high, or Price high to low. Rings with no known price always sort last.                                    |

If nothing matches you will see "No rings match. Try fewer filters." Use the **Clear filters** button next to the count to reset.

## An example's page

Opening a card shows:

- **A live 3D view** with Ring, Band and Set buttons. Band and Set are disabled when the example has no band.
- **A spec table:** centre stone and carat, cut, clarity and colour, head, shank, metals, band, ring size and approximate price.
- **Chips** for its category and design family.
- **Inspired by** with a link to the page that inspired it, when there is one.
- **Open in builder**, which copies the example into your working design and takes you to [Build](#/build). Your changes never alter the gallery entry.
- **Add to compare**, which puts it on the Compare page (up to three designs at a time).

Opening an example replaces your current working design, so Save or export your own first if you want to keep it. See [Saving, sharing and comparing](#/docs/saving-sharing-compare).

## What "design family" means

Every example belongs to a **design family**: a label that groups rings sharing one design idea, such as a particular head and shank combination or a historical style. Families are different from categories. A category is a broad kind (solitaire, band, famous ring). A family is a more specific recipe, so two rings in one family look like cousins even if their stones differ. The catalogue is required to contain at least 15 different families, so there is variety in every part of the gallery. Use the family chip as a clue when you want "more like this": search for its name in the search box.

## Using examples well

1. **Start with what you recognise.** Filter by the stone and cut you like, then scroll for a head and shank you find beautiful.
2. **Open in builder and change one thing.** Swap the metal, raise the stone, change the shank. See [Building a ring](#/docs/building-a-ring).
3. **Compare finalists.** Add two or three to Compare to see differences in a table.
4. **Learn the words.** Each example uses ids and terms explained in the other guides and in the [Glossary](#/docs/glossary).

## An honest note about the examples

Please read this part before you rely on an example for a decision.

**The examples are inspired by publicly listed rings.** During research we looked at product pages and listings from retailers, designers, auction and estate-jewellery sellers, and well-documented famous rings, then recorded facts such as the stone, head, shank, metal and listed price. Each example in the gallery is a design in this app's own vocabulary that resembles one of those rings. It is not a copy, not a certified replica and not endorsed by any seller. When a source page exists, the example's page links to it so you can see the real piece.

**The geometry is a stylised approximation.** The app builds each ring from simplified, parametric shapes. Real rings have engraving, hand-finishing and proportions that these shapes cannot reproduce exactly. Where the vocabulary lacked an exact match, the nearest id was used. For example, a shank profile that the listing did not state became the closest plain shank. Antique cuts like old mine and old European are approximated.

**Prices are listed prices at the time of research.** Research was gathered on 31 October 2026, so prices are a snapshot, and they move. Things to know when you see a price:

- Many modern retailer prices are for the **setting only**, without the centre stone. A platinum solitaire setting can cost a fraction of the finished ring.
- Designer houses often show a **"from" price**.
- Estate and antique listings show **asking prices**, and some of those pieces have since sold.
- A few prices came from search-result summaries rather than the opened page, and these are flagged as doubtful in the research notes.
- Many examples have no price at all, because the seller did not publish one.
- The price in the gallery is **informational only**. It is not a quote and is not an offer to sell.

**Carat is sometimes unknown.** For setting-only listings, the stone is chosen by the buyer, so those examples use a typical stone as a stand-in.

**Famous rings** (for example royal and celebrity rings) are described from public reporting, and sources sometimes disagree about carat or details. The gallery picks one figure.

## Where the research lives

The research notes are in the project's `docs/research` folder in the repository, and the structured data is in `data/research`. Each note is a table of rings with the source links, plus takeaways such as typical band widths and how contoured bands sit against heads, and lists of known gaps in the app's vocabulary. If you find an error, such as a wrong link or a mislabelled metal, open an issue on the project's GitHub repository.

## Adding your own examples

Developers can add example rings from research records. See the "Adding an example ring" section of [Adding components](#/docs/adding-components).
