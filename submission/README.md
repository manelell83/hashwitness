# HashWitness · submission (team DigiHacks)

Hedera Cross Campus Challenge 2026, INPT Campus Edition.

| File | What it is |
|---|---|
| `HashWitness-DigiHacks.html` | **The deck.** One self-contained file (font, images, QR codes and the demo video inlined). Works offline. |
| `HashWitness-DigiHacks.pdf` | The same 7 slides as PDF (1920×1080, fonts embedded), for upload or backup. |
| `HashWitness-demo.mp4` | 86-second silent demo of the real app with captions (also playable inside the deck). |
| `pitch-script.md` | 5-minute script with timing per slide, three speakers, likely questions. |
| `4hacks-text.md` | Draft texts for the 4Hacks "Submit Project" form. |
| `screens/` | Real 1920×1080 screenshots of the running app (Verify, the 3 attacks, Audit log, Metrics). |
| `contact-sheet.png` | All slides on one image, for review. |
| `build/` | Scripts that produced all of the above (not needed to present). |

## Present

1. **Open:** double-click `HashWitness-DigiHacks.html` (Chrome or Edge recommended). No internet needed.
2. **Fullscreen:** press **F** (press F or Esc to leave).
3. **Navigate:** **→**, **Space** or **Page Down** for next; **←** or **Page Up** for previous; **Home** / **End**
   for first / last. Clicking the right two-thirds of the screen goes forward, the left third goes back. On a phone or
   tablet, swipe.
4. **Speaker notes:** press **N** to show or hide the notes for the current slide (they are never in the PDF).
5. **Demo video:** on slide 4, click the "Watch the demo" card; **Esc** closes it. The QR code points to the online
   copy of the video (works once GitHub Pages is enabled).
6. The slide counter is in the bottom-right corner; the URL ends with `#n`, so you can open a given slide directly.

If the HTML cannot be opened (locked-down PC), present `HashWitness-DigiHacks.pdf` in any PDF viewer, in full-screen
mode, and play `HashWitness-demo.mp4` separately.

## Rebuild (only if you change the slides)

The deck sources are in `build/deck/` (`palette.css` holds every color and type size). Requires Node 20+, Google
Chrome, ffmpeg, Python 3 with Pillow and PyMuPDF, and the app running (`pnpm demo`) for new screenshots or video.

```bash
cd submission/build
npm install
node capture.mjs        # real screenshots (needs pnpm demo running)
node record.mjs         # demo video (needs pnpm demo running)
node build-deck.mjs     # -> ../HashWitness-DigiHacks.html
node export-pdf.mjs     # -> ../HashWitness-DigiHacks.pdf (offline, network blocked) + slide renders
python compare.py       # PDF vs HTML check + ../contact-sheet.png
```

Font: Hanken Grotesk (SIL Open Font License, `build/assets/HankenGrotesk-OFL.txt`).
