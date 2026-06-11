// Larpscape Forums skin — the game's parchment/stone/gold palette translated to
// flat early-2000s sensibilities. Served inline in a <style> block (period
// boards inlined or linked a single stylesheet; inline keeps this module
// self-contained). Everything Verdana 11px except the banner.

export const FORUM_CSS = `
body {
  background: #1d1b17;
  color: #2a2118;
  font-family: Verdana, Arial, Helvetica, sans-serif;
  font-size: 11px;
  margin: 0;
  padding: 0;
}
a { color: #6b3a1e; text-decoration: underline; }
a:hover { color: #9c5a2a; }
table { border-collapse: separate; }

#pagewrap { width: 760px; margin: 0 auto; padding: 8px 0 20px 0; }

/* --- banner --------------------------------------------------------------- */
.banner {
  background: #2e2920;
  border: 1px solid #8a7448;
  border-bottom: 2px solid #b8860b;
  padding: 8px 14px;
  text-align: left;
}
.banner .bigname {
  font-family: 'Old English Text MT', 'Blackadder ITC', 'UnifrakturMaguntia', Georgia, serif;
  font-size: 30px;
  color: #e8c558;
  text-decoration: none;
}
.banner .bigname:hover { color: #f5d976; }
.banner .tagline { color: #b3a584; font-size: 10px; padding-left: 10px; }

/* --- top nav / breadcrumbs ------------------------------------------------ */
.navbar {
  background: #4a3d2a;
  border: 1px solid #8a7448;
  border-top: 0;
  color: #e8dcbe;
  padding: 4px 8px;
  font-size: 10px;
}
.navbar a { color: #f0e2b6; font-weight: bold; }
.crumbs { padding: 6px 2px 4px 2px; color: #cfc4a4; font-size: 11px; }
.crumbs a { color: #e8c558; font-weight: bold; text-decoration: none; }
.crumbs a:hover { text-decoration: underline; }

/* --- main content tables -------------------------------------------------- */
table.forumline {
  width: 100%;
  background: #5a4a32;       /* shows through cellspacing as the 1px grid */
  border: 2px solid #8a7448; /* raised bevel, the subSilver way */
  border-top-color: #c9b88a;
  border-left-color: #c9b88a;
  border-bottom-color: #3e3322;
  border-right-color: #3e3322;
}
th.cathead {
  background: #b8860b;
  color: #2a1d08;
  font-size: 11px;
  font-weight: bold;
  text-align: left;
  padding: 4px 8px;
  letter-spacing: 1px;
}
th.colhead {
  background: #6e5a3c;
  color: #f0e2b6;
  font-size: 10px;
  font-weight: bold;
  padding: 3px 6px;
  white-space: nowrap;
}
td.row1 { background: #e8dcbe; padding: 4px 6px; }
td.row2 { background: #efe6cf; padding: 4px 6px; }
td.row3 { background: #dccfAD; padding: 4px 6px; }
td.row1, td.row2, td.row3 { font-size: 11px; color: #2a2118; }

.boardlink { font-weight: bold; font-size: 11px; text-decoration: none; color: #5b2f12; }
.boardlink:hover { text-decoration: underline; }
.boarddesc { color: #6e6047; font-size: 10px; }
.smalltext { color: #6e6047; font-size: 10px; }
.topictitle { font-weight: bold; font-size: 11px; color: #5b2f12; text-decoration: none; }
.topictitle:hover { text-decoration: underline; }
.prefix { color: #8a1f1f; font-weight: bold; }

/* folder icons (pure CSS squares — original, no copied art) */
.fldr {
  display: inline-block; width: 15px; height: 12px;
  background: #c9a84c; border: 1px solid #5a4a32;
  vertical-align: middle;
}
.fldr.quiet { background: #a89878; }
.fldr.lockd { background: #7a6a52; }

/* --- viewtopic ------------------------------------------------------------ */
td.authorcell {
  background: #dccfad;
  width: 150px;
  vertical-align: top;
  padding: 6px;
  font-size: 10px;
  color: #4a3d2a;
}
.postername { font-weight: bold; font-size: 11px; color: #3a2c14; }
.postrank { color: #6b3a1e; font-size: 10px; }
.modbadge { color: #8a6508; font-weight: bold; font-size: 10px; }
.avatarbox { margin: 4px 0; }
.avatarbox img { border: 1px solid #5a4a32; background: #efe6cf; }
td.postcell { vertical-align: top; padding: 0; }
.postmeta {
  background: #cdbf9b;
  border-bottom: 1px solid #5a4a32;
  padding: 3px 6px;
  font-size: 10px;
  color: #4a3d2a;
}
.postbody { padding: 8px; font-size: 11px; line-height: 15px; }
.sigdiv { color: #8a7448; margin: 10px 0 2px 0; }
.signature { color: #6e6047; font-size: 10px; }

/* --- bbcode --------------------------------------------------------------- */
.quotewrap { margin: 6px 12px; }
.quotehead { font-size: 10px; font-weight: bold; color: #4a3d2a; padding: 0 0 1px 2px; }
.quotebox {
  background: #f5eed9;
  border: 1px solid #8a7448;
  padding: 4px 6px;
  font-size: 10px;
}
.codehead { font-size: 10px; font-weight: bold; color: #4a3d2a; margin: 6px 12px 0 12px; }
.codebox {
  background: #f5f2e6;
  border: 1px solid #8a7448;
  margin: 1px 12px 6px 12px;
  padding: 4px 6px;
  font-family: Courier, 'Courier New', monospace;
  font-size: 11px;
  overflow: auto;
  white-space: pre;
}
.postbody ul { margin: 4px 0 4px 24px; padding: 0; }

/* --- buttons & forms ------------------------------------------------------ */
.btnlink {
  display: inline-block;
  background: #6e5a3c;
  color: #f0e2b6;
  border: 1px solid #8a7448;
  border-top-color: #c9b88a;
  border-left-color: #c9b88a;   /* the bevel */
  font-weight: bold;
  font-size: 10px;
  padding: 2px 8px;
  text-decoration: none;
}
.btnlink:hover { background: #7e6a48; color: #fff7dd; }
input.txt, textarea.txt, select.txt, input.btn {
  font-family: Verdana, Arial, Helvetica, sans-serif;
  font-size: 11px;
}
input.txt, textarea.txt, select.txt {
  background: #f5eed9;
  border: 1px solid #5a4a32;
  color: #2a2118;
  padding: 2px;
}
input.btn {
  background: #6e5a3c;
  color: #f0e2b6;
  border: 1px solid #8a7448;
  border-top-color: #c9b88a;
  border-left-color: #c9b88a;
  font-weight: bold;
  padding: 2px 10px;
  cursor: pointer;
}
input.btn:hover { background: #7e6a48; }
.bbhint { color: #6e6047; font-size: 10px; }
.errbox {
  background: #e9c8c0;
  border: 1px solid #8a1f1f;
  color: #6a1414;
  padding: 5px 8px;
  margin: 6px 0;
  font-weight: bold;
}
.previewbox { margin-bottom: 8px; }

/* --- pagination / footer -------------------------------------------------- */
.gensmall { font-size: 10px; color: #cfc4a4; }
.pagelinks { font-size: 10px; color: #4a3d2a; }
.pagelinks a { font-weight: bold; }
.whosonline {
  background: #2e2920;
  border: 2px solid #8a7448;
  border-top-color: #c9b88a;
  border-left-color: #c9b88a;
  border-bottom-color: #3e3322;
  border-right-color: #3e3322;
  line-height: 14px;
  color: #cfc4a4;
  font-size: 10px;
  padding: 4px 8px;
  margin-top: 6px;
}
.whosonline b { color: #e8c558; }
.footer {
  text-align: center;
  color: #8a7d63;
  font-size: 10px;
  padding: 10px 0 0 0;
}
`;
