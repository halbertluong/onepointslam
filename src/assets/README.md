# Fonts used by the link-preview cards

`Outfit-500.ttf` and `Outfit-800.ttf` are static instances of **Outfit**, the
same display face the site loads through `next/font/google`. They are read at
render time by `src/lib/ogCard.tsx`, because `next/og` ships only a single
regular weight and a preview card is almost entirely headline.

- Family: Outfit, by Smartsheet Inc. / Rodrigo Fuenzalida
- License: SIL Open Font License 1.1 — https://openfontlicense.org
- Source: Google Fonts (https://fonts.google.com/specimen/Outfit)

The OFL permits redistribution of the font files with software. To ship the
complete license text alongside them, drop the upstream `OFL.txt` from
https://github.com/google/fonts/tree/main/ofl/outfit into this directory.
