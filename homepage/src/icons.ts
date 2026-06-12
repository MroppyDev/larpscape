// Original inline SVG icons for the Larpscape homepage. All hand-drawn paths,
// stroke/fill via currentColor so CSS controls the tint.

const I = (body: string, vb = '0 0 24 24'): string =>
  `<svg viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;

/** Small pictographic icons for the left-rail link lists & feature blurbs. */
export const ICONS: Record<string, string> = {
  // crossed sword — play / combat
  sword: I(
    `<path d="M4 20 L15 9 M13 7 l4 -4 l4 1 l1 4 l-4 4 Z M3 17 l4 4 M2.5 21.5 l2 -2"
      stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
  ),
  // unrolled scroll — news
  scroll: I(
    `<path d="M7 4 h11 a2 2 0 0 1 2 2 v1 h-4 M7 4 a2 2 0 0 0 -2 2 v12 a2 2 0 0 0 2 2 h10 a2 2 0 0 0 2 -2 V7"
      stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/>
     <path d="M9 9 h6 M9 12.5 h6 M9 16 h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`
  ),
  // laurel + bar chart — hiscores
  trophy: I(
    `<path d="M7 4 h10 v5 a5 5 0 0 1 -10 0 Z M7 5.5 H4.5 a3 3 0 0 0 3 4 M17 5.5 h2.5 a3 3 0 0 1 -3 4 M12 14 v3 M8.5 20.5 h7 M10 17 h4 l1 3.5 h-6 Z"
      stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
  ),
  // speech bubble with chat dots — community / Discord
  discord: I(
    `<path d="M5 4 h14 a2 2 0 0 1 2 2 v8 a2 2 0 0 1 -2 2 H10 l-4 4 v-4 H5 a2 2 0 0 1 -2 -2 V6 a2 2 0 0 1 2 -2 Z"
      stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
     <circle cx="9" cy="10" r="1.15" fill="currentColor"/><circle cx="12.5" cy="10" r="1.15" fill="currentColor"/><circle cx="16" cy="10" r="1.15" fill="currentColor"/>`
  ),
  // open book — wiki / guide
  book: I(
    `<path d="M12 6 c-2 -1.6 -5 -2 -8 -1.6 V 19 c3 -.4 6 0 8 1.6 c2 -1.6 5 -2 8 -1.6 V 4.4 C17 4 14 4.4 12 6 Z M12 6 v14.6"
      stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
  ),
  // angle brackets — github / source
  code: I(
    `<path d="M8.5 7 L3.5 12 L8.5 17 M15.5 7 L20.5 12 L15.5 17 M13 4.5 L11 19.5"
      stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
  ),
  // key — account / login
  key: I(
    `<circle cx="8" cy="8" r="4.2" stroke="currentColor" stroke-width="1.8" fill="none"/>
     <path d="M11 11 L20 20 M17 17 l2.5 -2.5 M14.5 14.5 l2 -2" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>`
  ),
  // quill — register / create
  quill: I(
    `<path d="M20 4 C13 5 8 9 6.5 15.5 L5 20 l4.5 -1.5 C16 17 19 11 20 4 Z M5.5 18.5 C9 12 13 8.5 17 6.5"
      stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
  ),
  // ringing bell — support / status
  bell: I(
    `<path d="M12 4 a5.5 5.5 0 0 1 5.5 5.5 c0 4 1.5 5.5 2 6.5 H4.5 c.5 -1 2 -2.5 2 -6.5 A5.5 5.5 0 0 1 12 4 Z M10 19 a2 2 0 0 0 4 0"
      stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
  ),
  // banner pennant — guilds
  banner: I(
    `<path d="M6 3 v18 M6 4 h12 v8 H6 M18 4 l2.5 2 l-2.5 2"
      stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
  ),
  // stamped coin — the Aldgate Exchange / trade (also in FEATURE_ICONS)
  economy: I(
    `<circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.7" fill="none"/>
     <circle cx="12" cy="12" r="5.2" stroke="currentColor" stroke-width="1.2" fill="none" stroke-dasharray="2.5 2"/>
     <path d="M12 8.8 v6.4 M9.8 10.4 c0 -1 1 -1.6 2.2 -1.6 s2.2 .6 2.2 1.5 c0 2.2 -4.4 1 -4.4 3.2 c0 1 1 1.6 2.2 1.6 s2.2 -.6 2.2 -1.6"
      stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>`
  ),
};

/** Feature-section icons (a bit more ornate). */
export const FEATURE_ICONS: Record<string, string> = {
  // 24 skills incl. Gun: anvil with a spark
  skills: I(
    `<path d="M4 8 h13 c-.5 2.5 -2.5 4 -5 4.5 V 15 c2 .6 3 1.8 3.5 3.5 h-9 C7 16.8 8 15.6 10 15 v-2.5 C6.5 12 4.5 10.5 4 8 Z"
      stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/>
     <path d="M18.5 4.5 l1.2 2.3 l2.3 1.2 l-2.3 1.2 l-1.2 2.3 l-1.2 -2.3 l-2.3 -1.2 l2.3 -1.2 Z" fill="currentColor"/>`
  ),
  // quests & dungeon: gate into the dark
  quest: I(
    `<path d="M4 20 V 9 a8 8 0 0 1 16 0 v11 M8 20 v-7 a4 4 0 0 1 8 0 v7 M2.5 20.5 h19"
      stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
     <circle cx="12" cy="13" r="1.2" fill="currentColor"/>`
  ),
  // economy & guilds: stamped coin
  economy: I(
    `<circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.7" fill="none"/>
     <circle cx="12" cy="12" r="5.2" stroke="currentColor" stroke-width="1.2" fill="none" stroke-dasharray="2.5 2"/>
     <path d="M12 8.8 v6.4 M9.8 10.4 c0 -1 1 -1.6 2.2 -1.6 s2.2 .6 2.2 1.5 c0 2.2 -4.4 1 -4.4 3.2 c0 1 1 1.6 2.2 1.6 s2.2 -.6 2.2 -1.6"
      stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>`
  ),
  // the Offnote: a slashed, wrong note
  offnote: I(
    `<ellipse cx="9" cy="16.5" rx="3.4" ry="2.6" transform="rotate(-18 9 16.5)" fill="currentColor"/>
     <path d="M12 15.5 V 4.5 q 4 1 6 4.5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>
     <path d="M4.5 19.5 L19.5 6.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity=".85"/>`
  ),
};

/** Category motifs for news card art bands. */
export const CATEGORY_MOTIFS: Record<string, string> = {
  'Game Updates': ICONS.sword,
  'Dev Blog': ICONS.quill,
  Community: ICONS.banner,
  Events: ICONS.bell,
};
