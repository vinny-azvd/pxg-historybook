<!--
SKIN CONTRACT (written by the infra phase; theme agents rely on it)

Four skins: classic | gameboy | battle | cards. Default on first visit: battle.
Choice persisted in localStorage 'pxg-hunts:skin' (validated, try/catch).

DOCUMENT ATTRIBUTES (on <html>, written by theme/skins.ts applySkin(); main.tsx
calls initSkin() before React renders, ThemeProvider keeps it in sync)
  data-skin           classic | gameboy | battle | cards
  data-type-surface   light | dark   (absent for classic). gameboy=light,
                      battle=light, cards=dark. themes/types.css keys the
                      --type-<tipo> tokens off it.
  data-theme          light | dark - Classic-only, never set by code today.
  Scope EVERY rule as  :root[data-skin='<skin>'] ...  (specificity 0,2,0 beats
  styles.css :root blocks, including the OS prefers-color-scheme: dark block
  whose selector is :root:where(:not([data-theme='light'])) = 0,1,0). Each
  skin declares its own fixed `color-scheme` (gameboy/battle light, cards
  dark) and re-declares EVERY colour token, so nothing leaks from the OS mode.
  Import order (main.tsx): styles.css, types.css, classic, gameboy, battle,
  cards, fonts. A skin file must only touch its own skin.

TOKENS a skin overrides (all on :root[data-skin='x'])
  Colour:   --page --surface-1 --text-primary --text-secondary --text-muted
            --selection --gridline --baseline --border --success --danger
            --series-1..8 --party-badge-bg/-text --jade --jade-soft
            --jade-badge-bg/-text --rare-drop --rare-drop-badge-bg/-text
            --focus-ring (>= 3:1 against --page AND --surface-1)
  New:      --font-display  titles, menu, buttons. Applied by styles.css to
                            .brand .page-title .section-title .nav a
                            .nav-toggle and every <button>. Pixel font here in
                            gameboy/battle; NEVER for digits/tables/axes/tooltips.
            --font-body     everything else (numbers, tables, charts, tooltips)
            --radius-card   .card .stat-tile .hunt-card .rares-gallery-card
                            .upload-drop, theme popover
            --radius-control buttons, selects, inputs, .nav a
  Fonts are self-hosted (themes/fonts.ts -> fonts.css: latin only, woff2 only,
  loaded lazily by the browser only when a family is used): 'Rubik' 400/500/700/800,
  'Pixelify Sans' 500/700, 'Inter' 400/500/600, 'Barlow' 400/500/600,
  'Barlow Condensed' 600/700/800. Pixel fonts blur at fractional sizes: use
  integer px (14/16/18...) for --font-display text. NEVER digits in the pixel
  font: wrap counts/dates inside titles in <span class="num"> (body face).

SHELL MARKUP (App.tsx) - Tab order: skip link, brand, [nav-toggle], nav,
[filters-toggle], filters, theme picker, <main>
  div.app-shell[data-nav-open="true|false"][data-filters-open="true|false"]
    a.skip-link                       "Pular para o conteúdo" (fixed, off-screen
                                      until focused)
    header.topbar                     position: sticky; top: 0; z-index: 50
      a.brand > span.brand-full ("Hunt History Analyser") + span.brand-short
                ("HHA", shown <= 720px)
      button.nav-toggle               text "START"; display:none by default. The
                                      gameboy skin shows it <= 899px (mobile)
                                      and toggles the nav as a dropdown with
                                      .app-shell[data-nav-open='true']. aria-
                                      expanded/controls="site-nav" already wired.
      nav.nav#site-nav                7 links <a>, active one has class "active"
                                      (+ aria-current="page"). Order: Visão
                                      Geral, Hunts, Terror, MD, Raros,
                                      Tendências, Dados (local mode only). The
                                      gameboy skin may position it fixed on the
                                      RIGHT at >= 900px (a position:fixed child
                                      of the sticky header works as is).
      button.filters-toggle.secondary "Filtros" + span.filters-toggle-count;
                                      display:none on desktop, shown <= 720px
      div.topbar-filters#topbar-filters
        div.filter-bar (2 selects: Treinador, tipo de sessão) + div (period
        select + optional date inputs)
        <= 720px it is a dropdown panel under the bar, visible only when
        .app-shell[data-filters-open='true']; desktop: inline in the bar.
      div.theme-picker                button.theme-picker-button (palette icon,
                                      aria-haspopup=listbox) + div.theme-picker-
                                      popover > p.theme-picker-title + ul.theme-
                                      picker-list[role=listbox] > li.theme-option
                                      [role=option][aria-selected][data-skin-
                                      option] > span.skin-preview[data-preview]
                                      + span.theme-option-text (.theme-option-
                                      label, .theme-option-desc) + .theme-
                                      option-check. Uses tokens, so it restyles
                                      itself; the previews have fixed colours.
    main.main#conteudo                tabIndex -1 (skip-link target)

  Phones (<= 720px, and 721-1023px for gameboy/battle/cards - Classic keeps
  its wrapping header there): .topbar is ONE row of 56px (flex nowrap):
  brand-short + .nav (position:relative, overflow-x:auto, no scrollbar, active
  link scrolled fully into view; its focus ring is drawn INSIDE the link
  because the scroller clips outlines) + .filters-toggle + .theme-picker.
  Touch targets 40px. Skins may restyle colours/fonts of the bar but must keep
  it <= 56px high and one row. Desktop keeps the full sticky header
  (flex-wrap: wrap, padding 14px 24px).
  App.tsx publishes the bar's measured height as --topbar-h on <html> (all
  skins); html scroll-padding-top = --topbar-h + 16px so a focused element is
  never hidden under the sticky bar.

CARDS (HuntCard, MdCard, TerrorCard share these classes)
  div.hunt-card                       NOT focusable. A click toggles the details
                                      IN PLACE (mouse convenience); position:
                                      relative. Its keyboard/screen-reader face
                                      is button.card-toggle (visually hidden,
                                      aria-expanded + aria-controls); the focus
                                      ring is drawn on the card with
                                      .hunt-card:has(> .card-toggle:focus-visible).
    div.hunt-card-art[aria-hidden]    ONLY when skin != classic, and ONLY in
      img.pokemon-sprite              HuntCard and MdCard (Terror has no Pokémon
                                      name -> no art). 72x72 CSS px, pixelated,
                                      Pokéball fallback. Default: centered
                                      block above the header; the skin places
                                      it (e.g. as the card "art window").
    div.hunt-card-header (a link + date), div (duração · treinadores · badges),
    div.hunt-card-badges, dl.hunt-card-stats (div > dt + dd), and when open
    div.hunt-card-expanded.
  Pointer tracking: the card element gets --mx and --my (e.g. "42.5%", 0-100%
  of the pointer inside the card) via rAF, no re-render; removed on
  pointerleave; touch pointers ignored. Also --tx / --ty: the same position as
  unitless -1..1 numbers (a percentage cannot become an angle in plain CSS), e.g.
  rotateY(calc(var(--tx, 0) * 7deg)).
  Build tilt/shine in pure CSS, e.g.
    @media (hover: hover) and (prefers-reduced-motion: no-preference) {
      :root[data-skin='cards'] .hunt-card:hover {
        background: radial-gradient(circle at var(--mx, 50%) var(--my, 50%), ...)
      }
    }
  Without --mx/--my set, use fallbacks (var(--mx, 50%)).

REACT API (theme/)
  useSkin() -> { skin: Skin, setSkin(skin), skins: SkinInfo[] }   ThemeContext
  <ThemeProvider> wraps the app in main.tsx. Use useSkin() to render a
  structural piece only in one skin (battle scene, START hint...).
  skins.ts: SKINS, isSkin, DEFAULT_SKIN, SKIN_STORAGE_KEY, applySkin, initSkin
  usePointerGlow<T>() -> { ref, onPointerMove, onPointerLeave }
  useCardProps(toggle) -> usePointerGlow + { tabIndex:0, onClick, onKeyDown }
  components/PokemonSprite  props: name (required), width=64, height=width,
    shiny?, back? (SpriteOptions), className?, alt? (defaults to name; pass ""
    for a decorative sprite next to the written name). Renders
    img.pokemon-sprite with the local sprite or the Pokéball.

OTHER SELECTORS a skin may rely on (all in styles.css)
  Layout:   .main .page-title .page-subtitle .section .section-title .card
            .stat-grid .stat-tile (.label .value .sub .delta) .highlight-grid
            .two-col .hunt-card-grid .legend-row .legend-swatch .chart-toolbar
            .chart-frame-bar .chart-marker-legend .empty-state
  Controls: button (default = primary, series-1), button.secondary, select,
            input[type=date|text], textarea, .bucket-toggle, .period-nav
  Tables:   table.data-table th/td, .chart-table, .rares-table
  Badges:   .badge .badge-jade .badge-jade-severe .badge-rare-drop .rare-badge
  Rares:    .rares-* , .rare-sprite, .rares-gallery-card
  Overlays: .modal-overlay .modal-card
  Utility:  .visually-hidden  .table-scroll (overflow-x:auto box for wide tables)
            .date-range-picker (wrapping date inputs)
  Forced colors: styles.css has a @media (forced-colors: active) block for the
            active nav link / active toggle; skins need nothing unless they
            draw the active state with a fill only.
  Focus:    global :where(a,button,select,input,textarea,summary,[tabindex]):
            focus-visible -> 2px solid var(--focus-ring), offset 2px. A skin
            only sets --focus-ring (or its own outline) - never `outline:none`
            without a replacement.
  Motion:   a global @media (prefers-reduced-motion: reduce) kills animation/
            transition durations; skins must still gate their own transforms
            (hover tilt etc.) behind (prefers-reduced-motion: no-preference).
  Chart tooltips (inline styles in the chart components) are NOT themed by
  this infra phase.
-->

# Skins

See the comment block at the top of this file for the full contract. One CSS
file per skin (`classic.css`, `gameboy.css`, `battle.css`, `cards.css`), each
scoped under `:root[data-skin='<skin>']`; `fonts.ts` registers the
self-hosted @fontsource families; `types.css` holds the Pokémon type colours.
