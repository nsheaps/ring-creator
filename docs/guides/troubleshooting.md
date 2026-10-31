---
title: Troubleshooting
order: 14
summary: Fixes for a missing 3D view, slow rendering, share links that fail, designs that vanished and import errors.
---

# Troubleshooting

Most problems fall into five groups. Find yours, try the steps in order and stop when it works.

## The 3D view is blank or says WebGL is not available

The ring is drawn with WebGL. If your browser cannot start it, the viewer shows a message ("WebGL is not available in this browser" or the specific error) in place of the ring. The controls and the written summary under the viewer still work, so you can keep designing and judge the result in text, but you will not see the ring.

Try, in this order:

1. **Reload the page.** A single failed start is sometimes temporary.
2. **Turn on hardware acceleration.** In Chrome and Edge this is in Settings, System ("Use graphics acceleration when available"). In Firefox it is under Settings, General, Performance. Restart the browser afterwards.
3. **Close other heavy tabs and apps.** Browsers limit how many WebGL views can be live at once. Many tabs with 3D content can use them all up.
4. **Update your browser and graphics drivers.** Old drivers are on some browsers' blocklists.
5. **Try another browser.** If Chrome fails and Firefox works, the problem is the first browser's settings or blocklist.
6. **Check for restrictions.** Some corporate, school or privacy-hardened setups disable WebGL on purpose. Extensions that block canvas or fingerprinting can also interfere. Try a private window with extensions off.
7. **Check your browser's WebGL status.** Visiting a "WebGL test" page tells you whether the browser can draw WebGL content at all. If it cannot, the issue is your device or browser rather than Ring Creator.

If you are using a remote desktop, a virtual machine or a very old computer, software rendering may be unavailable or too slow.

## It is slow or the picture stutters

The 3D model is rebuilt whenever you change a control, and complex designs take longer.

- **Drag sliders gently** and let go. Several rebuilds a second are normal on a weaker device.
- **Switch the view to Ring** instead of Set. Building only the engagement ring is lighter than building it with a band.
- **Turn Auto-rotate off.** It keeps drawing continuously.
- **Reduce detail-heavy choices.** Pave and eternity bands, double halos and clusters have the most small stones. Pick a simpler head or shank while you work and add the detail at the end.
- **Close other tabs** and applications, and make sure hardware acceleration is on (see above).
- **Use a smaller window.** Fewer pixels means less work. On a phone, rotate to portrait.
- **Try a different browser** if one is much slower than another.

## The share link is too long, or it does not open

A share link contains the whole design, so a design with many options or a long name makes a long link. A default-looking design makes a link whose design data is around 1.2 kB, plus the address.

If a link fails:

1. **Send the link in a place that does not cut it.** Some messaging apps, email clients and social sites truncate or rewrap very long links. Paste it into a note or a document and check the end is intact before sending.
2. **Send a file instead.** Use **Export JSON** in the builder, send the file, and have the other person use **Import JSON**. Files have no length limit.
3. **Shorten what you can.** A shorter design name helps a little.
4. **Check the whole link was copied.** If your browser blocked clipboard access, the app shows the link in a message so you can select and copy it yourself.
5. **Open it in a regular browser window** rather than an app's built-in browser, which can cut or alter links.

If you open a damaged link, the builder says "That share link could not be read, so your current design is unchanged." Nothing is lost, but you need a fresh link or a file from the sender.

A shared link is a snapshot. If the sender changes their ring later, they must send a new link.

## My designs disappeared

Designs are kept in your browser's local storage for this site. They can be lost when:

- You **cleared site data, cookies or history** for the site, or ran a cleaner tool.
- You used a **private or incognito window**. Those start empty and forget everything on close.
- You are in a **different browser, profile or device** from the one where you saved.
- Your browser is set to **delete site data when it closes**.
- **Storage was full or blocked**, so saves did not persist. The app keeps working in memory, but a reload then loses everything.
- The address changed. Local storage belongs to one address, so a different site address or a different copy of the app has its own storage.

What to do:

1. Check the browser and profile you normally use, and look at [Saved](#/saved).
2. Check your downloads folder for exported `.json` files and your messages for share links. Both can recreate a design.
3. In future, keep **Export JSON** copies of designs that matter, since the app has no cloud backup.
4. If you see "Saved design not found; showing your current design", the link points to a design that is no longer in this browser. Open Saved and choose from the list.

## Import errors

**"That file is not a Ring Creator design."** The file was not valid JSON or did not look like a design. Check that:

- It is a file exported by Ring Creator (**Export JSON**), not a screenshot, a spreadsheet or another app's file.
- It was not changed on the way. Email programs and cloud drives sometimes alter attachments; download it again from the original.
- It is complete. A truncated or half-saved file cannot be read.
- It has a `"version": 1` field and an `engagement` section with `center`, `head` and `shank`. If you edited it by hand, undo the edit or re-export a fresh file and change one field at a time.
- It is a single design, not several designs combined into one file.

**The design loads but looks different.** If a file refers to a stone, metal, head or other component that this version of the app does not know, the app cannot draw it as intended. Update your browser's copy of the page with a reload, or ask the sender which version they used.

**Nothing happened after choosing a file.** Make sure the file ends in `.json`, and try again. If the same file was picked twice in a row, the browser may not fire, so reload the page and retry.

Importing replaces your current working design. If you want to keep it, press **Save** or **Export JSON** first.

## Smaller things

| Symptom                                          | What is going on                                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Band and Set buttons are disabled                | You have no band. Tick **Include matching band** on the Band tab.                                             |
| A head card is greyed out                        | It is not made for your current stone cut. The card says which.                                               |
| The band does not curve                          | Choose a contour-capable style and leave Fit on Auto or Contour.                                              |
| Colours look different in the snapshot           | The snapshot is a PNG of what you saw. Screens and printers show colour differently.                          |
| The stone seems to change size when I change gem | The same carat in a denser gem is smaller. This is expected. See [Choosing a stone](#/docs/choosing-a-stone). |
| A slider will not go further                     | Each control has a safe range, and values outside it are not allowed.                                         |

## Still stuck?

Open an issue at <https://github.com/nsheaps/ring-creator> and include your browser and version, your device, what you did, what you expected and what happened. If you can, export the design file that triggered the problem and attach it. For general questions check the [FAQ](#/docs/faq), and for a tour of the controls see [Building a ring](#/docs/building-a-ring).
