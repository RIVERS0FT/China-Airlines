# Cabin perspective props v2

Generated with the built-in image generation tool on 2026-09-15. The runtime
sprites are cropped without resampling by `scripts/extract-cabin-art.ps1`.
`props-source.png` has a genuine RGBA alpha channel.

## Generation

Use case: stylized-concept. Create one transparent landscape production sprite
atlas with three isolated props: a compact blue aircraft-seat rear layer without
its near armrest, the matching near armrest and narrow cushion rim as a separate
front layer, and one low wooden cargo pallet. Use the locally inspected railway
seat only as a generic angle and silhouette reference; do not copy its pixels,
color, texture, proportions or distinctive design. Keep the new airline seat
mostly in strict left-facing side elevation with only 5-8 degrees of top/front
visibility, a narrow backrest, a thin low cushion and short floor brackets. Keep
verticals vertical, use consistent upper-left lighting, and leave generous
gutters. The seat cushion must be about 25-28% of the full chair height above the
floor so the approved near-front seated passengers can touch it while keeping
both feet on the floor. The pallet uses the same flat side elevation with only
5-8 degrees of top surface visible. No people, cargo, cabin, floor, text, logo or
watermark.

## Alpha correction

Use case: background-extraction. Remove only the generated checkerboard and
smoky backdrop. Preserve every prop pixel, position, size, color, outline and
gap. Encode all empty pixels as alpha zero; do not redraw, move, resize, merge
or split the props.
