// Vereinfachte Grundrisse (schematisch, nicht maßstabsgetreu).
// Koordinaten: x/y in Prozent (0–100) relativ zur SVG-Fläche.

const PIN_TYPES = [
  { id: 'ghost', icon: '👻', label: 'Geisterraum' },
  { id: 'curse', icon: '💀', label: 'Fluchgegenstand' },
  { id: 'here',  icon: '📍', label: 'Ich bin hier' },
  { id: 'fuse',  icon: '⚡', label: 'Sicherung' },
];

const pinTypeById = Object.fromEntries(PIN_TYPES.map((p) => [p.id, p]));

const MAPS = [
  {
    id: 'tanglewood',
    name: '6 Tanglewood Drive',
    size: 'Klein',
    svg: `<rect x="8" y="20" width="84" height="52" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="96" y="20" width="44" height="52" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="144" y="20" width="48" height="52" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="8" y="76" width="56" height="44" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="68" y="76" width="56" height="44" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="128" y="76" width="64" height="44" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<text x="50" y="50" fill="#9aa3b2" font-size="7" text-anchor="middle">Wohnzimmer</text>
<text x="118" y="50" fill="#9aa3b2" font-size="7" text-anchor="middle">Küche</text>
<text x="168" y="50" fill="#9aa3b2" font-size="7" text-anchor="middle">Bad</text>
<text x="36" y="100" fill="#9aa3b2" font-size="7" text-anchor="middle">Garage</text>
<text x="96" y="100" fill="#9aa3b2" font-size="7" text-anchor="middle">Flur</text>
<text x="160" y="100" fill="#9aa3b2" font-size="7" text-anchor="middle">Schlafz.</text>`,
  },
  {
    id: 'edgefield',
    name: '42 Edgefield Road',
    size: 'Klein',
    svg: `<rect x="10" y="18" width="70" height="48" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="84" y="18" width="50" height="48" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="138" y="18" width="52" height="48" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="10" y="70" width="90" height="50" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="104" y="70" width="86" height="50" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="10" y="124" width="180" height="28" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<text x="45" y="46" fill="#9aa3b2" font-size="7" text-anchor="middle">Wohnz.</text>
<text x="109" y="46" fill="#9aa3b2" font-size="7" text-anchor="middle">Küche</text>
<text x="164" y="46" fill="#9aa3b2" font-size="7" text-anchor="middle">Bad</text>
<text x="55" y="98" fill="#9aa3b2" font-size="7" text-anchor="middle">Esszimmer</text>
<text x="147" y="98" fill="#9aa3b2" font-size="7" text-anchor="middle">Schlafz.</text>
<text x="100" y="142" fill="#9aa3b2" font-size="7" text-anchor="middle">Keller / Garage</text>`,
  },
  {
    id: 'ridgeview',
    name: '10 Ridgeview Court',
    size: 'Mittel',
    svg: `<rect x="6" y="14" width="88" height="40" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="98" y="14" width="96" height="40" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="6" y="58" width="60" height="44" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="70" y="58" width="60" height="44" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="134" y="58" width="60" height="44" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="6" y="106" width="188" height="46" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<text x="50" y="36" fill="#9aa3b2" font-size="7" text-anchor="middle">Wohnz.</text>
<text x="146" y="36" fill="#9aa3b2" font-size="7" text-anchor="middle">Küche / Essen</text>
<text x="36" y="82" fill="#9aa3b2" font-size="7" text-anchor="middle">Bad</text>
<text x="100" y="82" fill="#9aa3b2" font-size="7" text-anchor="middle">Flur</text>
<text x="164" y="82" fill="#9aa3b2" font-size="7" text-anchor="middle">Schlafz.</text>
<text x="100" y="132" fill="#9aa3b2" font-size="7" text-anchor="middle">Keller / Garage</text>`,
  },
  {
    id: 'grafton',
    name: 'Grafton Farmhouse',
    size: 'Mittel',
    svg: `<rect x="8" y="16" width="184" height="36" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="8" y="56" width="56" height="48" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="68" y="56" width="56" height="48" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="128" y="56" width="64" height="48" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="8" y="108" width="88" height="44" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="100" y="108" width="92" height="44" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<text x="100" y="36" fill="#9aa3b2" font-size="7" text-anchor="middle">Scheune / Stall</text>
<text x="36" y="82" fill="#9aa3b2" font-size="7" text-anchor="middle">Küche</text>
<text x="96" y="82" fill="#9aa3b2" font-size="7" text-anchor="middle">Wohnz.</text>
<text x="160" y="82" fill="#9aa3b2" font-size="7" text-anchor="middle">Schlafz.</text>
<text x="52" y="132" fill="#9aa3b2" font-size="7" text-anchor="middle">Flur</text>
<text x="146" y="132" fill="#9aa3b2" font-size="7" text-anchor="middle">Keller</text>`,
  },
  {
    id: 'bleasdale',
    name: 'Bleasdale Farmhouse',
    size: 'Mittel',
    svg: `<rect x="10" y="14" width="80" height="42" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="94" y="14" width="96" height="42" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="10" y="60" width="52" height="50" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="66" y="60" width="52" height="50" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="122" y="60" width="68" height="50" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="10" y="114" width="180" height="38" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<text x="50" y="38" fill="#9aa3b2" font-size="7" text-anchor="middle">Wohnz.</text>
<text x="142" y="38" fill="#9aa3b2" font-size="7" text-anchor="middle">Küche</text>
<text x="36" y="88" fill="#9aa3b2" font-size="7" text-anchor="middle">Bad</text>
<text x="92" y="88" fill="#9aa3b2" font-size="7" text-anchor="middle">Flur</text>
<text x="156" y="88" fill="#9aa3b2" font-size="7" text-anchor="middle">Schlafz.</text>
<text x="100" y="136" fill="#9aa3b2" font-size="7" text-anchor="middle">Keller / Außen</text>`,
  },
  {
    id: 'camp',
    name: 'Camp Woodwind',
    size: 'Klein',
    svg: `<rect x="20" y="24" width="70" height="50" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="94" y="24" width="50" height="50" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="148" y="24" width="42" height="50" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="20" y="78" width="170" height="58" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<text x="55" y="52" fill="#9aa3b2" font-size="7" text-anchor="middle">Zelt 1</text>
<text x="119" y="52" fill="#9aa3b2" font-size="7" text-anchor="middle">Zelt 2</text>
<text x="169" y="52" fill="#9aa3b2" font-size="7" text-anchor="middle">Bad</text>
<text x="105" y="110" fill="#9aa3b2" font-size="7" text-anchor="middle">Lagerfeuer / Weg</text>`,
  },
  {
    id: 'maple',
    name: 'Maple Lodge Campsite',
    size: 'Klein',
    svg: `<rect x="12" y="20" width="64" height="44" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="80" y="20" width="64" height="44" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="148" y="20" width="40" height="44" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="12" y="68" width="176" height="70" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<text x="44" y="44" fill="#9aa3b2" font-size="7" text-anchor="middle">Hütte</text>
<text x="112" y="44" fill="#9aa3b2" font-size="7" text-anchor="middle">Lager</text>
<text x="168" y="44" fill="#9aa3b2" font-size="7" text-anchor="middle">WC</text>
<text x="100" y="106" fill="#9aa3b2" font-size="7" text-anchor="middle">Wald / Wege</text>`,
  },
  {
    id: 'brownstone',
    name: 'Brownstone High School',
    size: 'Groß',
    svg: `<rect x="6" y="10" width="188" height="28" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="6" y="42" width="60" height="50" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="70" y="42" width="60" height="50" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="134" y="42" width="60" height="50" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="6" y="96" width="92" height="56" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="102" y="96" width="92" height="56" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<text x="100" y="28" fill="#9aa3b2" font-size="7" text-anchor="middle">Eingang / Flur</text>
<text x="36" y="68" fill="#9aa3b2" font-size="7" text-anchor="middle">Klasse A</text>
<text x="100" y="68" fill="#9aa3b2" font-size="7" text-anchor="middle">Klasse B</text>
<text x="164" y="68" fill="#9aa3b2" font-size="7" text-anchor="middle">Lehrerz.</text>
<text x="52" y="126" fill="#9aa3b2" font-size="7" text-anchor="middle">Turnhalle</text>
<text x="148" y="126" fill="#9aa3b2" font-size="7" text-anchor="middle">Cafeteria</text>`,
  },
  {
    id: 'prison',
    name: 'Prison',
    size: 'Groß',
    svg: `<rect x="8" y="12" width="184" height="24" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="8" y="40" width="44" height="48" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="56" y="40" width="44" height="48" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="104" y="40" width="44" height="48" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="152" y="40" width="40" height="48" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="8" y="92" width="184" height="58" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<text x="100" y="28" fill="#9aa3b2" font-size="7" text-anchor="middle">Eingang / Wachen</text>
<text x="30" y="66" fill="#9aa3b2" font-size="6" text-anchor="middle">Zelle</text>
<text x="78" y="66" fill="#9aa3b2" font-size="6" text-anchor="middle">Zelle</text>
<text x="126" y="66" fill="#9aa3b2" font-size="6" text-anchor="middle">Zelle</text>
<text x="172" y="66" fill="#9aa3b2" font-size="6" text-anchor="middle">Bad</text>
<text x="100" y="124" fill="#9aa3b2" font-size="7" text-anchor="middle">Hof / Kantine</text>`,
  },
  {
    id: 'sunny',
    name: 'Sunny Meadows',
    size: 'Groß',
    svg: `<rect x="4" y="8" width="192" height="20" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="4" y="32" width="48" height="40" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="56" y="32" width="48" height="40" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="108" y="32" width="48" height="40" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="160" y="32" width="36" height="40" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="4" y="76" width="96" height="44" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="104" y="76" width="92" height="44" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<rect x="4" y="124" width="192" height="28" fill="#2a3140" stroke="#5b6472" stroke-width="1.2"/>
<text x="100" y="22" fill="#9aa3b2" font-size="7" text-anchor="middle">Eingang</text>
<text x="28" y="54" fill="#9aa3b2" font-size="6" text-anchor="middle">Wing A</text>
<text x="80" y="54" fill="#9aa3b2" font-size="6" text-anchor="middle">Wing B</text>
<text x="132" y="54" fill="#9aa3b2" font-size="6" text-anchor="middle">Wing C</text>
<text x="178" y="54" fill="#9aa3b2" font-size="6" text-anchor="middle">Bad</text>
<text x="52" y="100" fill="#9aa3b2" font-size="7" text-anchor="middle">Chapel</text>
<text x="150" y="100" fill="#9aa3b2" font-size="7" text-anchor="middle">Cafeteria</text>
<text x="100" y="142" fill="#9aa3b2" font-size="7" text-anchor="middle">Keller / Lager</text>`,
  },
];

const mapById = Object.fromEntries(MAPS.map((m) => [m.id, m]));
