// Self-hosted fonts (no Google Fonts requests). Only the latin subset and
// only the weights each skin uses. The @font-face rules are registered for
// every user, but the browser downloads a font file only when text on the
// page is actually rendered with that family/weight, so Classic users pay
// nothing (and nothing is preloaded).
//
//   Rubik            400 500 700 800  battle body + headings
//   Pixelify Sans    500 700          gameboy/battle display: titles, menu, buttons ONLY
//   Inter            400 500 600      gameboy body
//   Barlow           400 500 600      cards body
//   Barlow Condensed 600 700 800      cards display
//
// Numbers, axes, tables and tooltips always use --font-body, never the
// pixel font (digits such as 5/S and 2/Z get confused in Pixelify Sans).
import './fonts.css';
