# HashWitness design brief (for Claude Code)

Apply this AFTER the Verify and Attack Lab screens work. Do not change logic.

## Files
- `theme.css`: the only place for colors, fonts, spacing, radii, motion. Import it once in `apps/web`.
- `logo.svg`: the logo mark. Render the wordmark as live text "HashWitness" in Montserrat 700 next to it.

## Direction
Dark navy background, indigo accent, geometric sans (Montserrat), rounded pill buttons, glass-like cards. Calm and trustworthy, like a modern crypto wallet site. Do NOT copy any logo, coin illustration or asset from HashPack or Hedera; the palette and mood are inspiration only.

## Rules
- Use only CSS variables from `theme.css`. No hard-coded colors in components.
- Verdicts always show icon + word + color: ✓ Valid, ✕ Revoked, ⚠ Inconsistent.
- Digests, hashes and IDs use `.mono`. Truncate long hashes in the middle with a copy button.
- Body text 16px minimum. The demo is screen-shared.
- Responsive down to mobile, visible keyboard focus, reduced motion respected (already in the CSS).

## Motion: three moments only, all triggered by a user action or a new result
1. Attack Lab, on "Verify": the naive card shows "Valid" at once. In the HashWitness card, mirrors appear one by one (120ms stagger). When results land, the lying mirror gets `.is-liar` and the verdict flips with `.is-revealed`. This is the memorable moment of the demo.
2. A new HCS attestation enters the audit log with `.is-new`.
3. Counters (queries used, cost) count up once when the metrics screen opens.
No other animation, no scroll effects, no hover animation on every card.

## Screens
- Verify: input + button, large verdict, mirror table, forensic report card.
- Attack Lab: two columns (`.lab-naive` vs `.lab-witness`), attack mode switch above them.
- Audit log: entries with explorer links.
- Metrics: bandit cost curve and confusion matrix, one accent color, calm background.

Mark any decision that needs my input with `// DESIGN:`.
