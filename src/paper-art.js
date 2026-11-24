const drawings = {
  property: `
    <path d="M8 76h216M14 80h206M31 83h150M82 86h111" class="engraving-fine"/>
    <path d="M35 72v-30l24-11 24 11v30zM83 72V29l33-14 33 14v43zM149 72V44l22-10 22 10v28z" fill="#e7d0a4"/>
    <path d="M83 29l22-13 32-10 26 14-14 9-33-14zM35 42l16-13 23-7 20 13-11 7-24-11zM149 44l14-11 21-6 22 11-13 6-22-10z" fill="#a76a4b"/>
    <path d="M149 29l14-9v45l-14 7zm44 15l13-6v27l-13 7zM83 42l-11-5v35h11" fill="#b69c72"/>
    <path d="M42 49h5v8h-5zm12 0h5v8h-5zm12 0h5v8h-5zm28-12h6v11h-6zm10 0h6v11h-6zm11 0h6v11h-6zm11 0h6v11h-6zm10 0h6v11h-6zm18 13h5v7h-5zm11 0h5v7h-5zm11 0h5v7h-5zM111 72V57h12v15" fill="#5d5e48" stroke="none"/>
    <path d="M88 51h57M38 60h32m83 0h34m-91-32l20-9m2 3l-13 6m52 5v29m3-24v23m39-13v17M41 75l-5 5m21-5-5 5m20-5-5 5m20-5-5 5m20-5-5 5m20-5-5 5m20-5-5 5m20-5-5 5m20-5-5 5m20-5-5 5" class="engraving-fine"/>
    <path d="M12 71l7-8h-5l6-8h-3l4-11 5 11h-3l6 8h-5l7 8zM206 72l5-6h-4l4-6h-2l4-9 4 9h-2l4 6h-4l5 6z" fill="#727957"/>`,
  receipt: `
    <path d="M69 17h93v58l-5-3-6 3-6-3-6 3-6-3-6 3-6-3-6 3-6-3-6 3-6-3-6 3-6-3-6 3-6-3-6 3z" fill="#f1dfb9"/>
    <path d="M74 23h82m-73 8h34m-34 9h34m-34 9h34m-34 9h34m10-27h20m-20 9h20m-20 9h20m-20 9h20" class="engraving-fine"/>
    <ellipse cx="157" cy="67" rx="20" ry="13" fill="#bb8e56"/><ellipse cx="157" cy="63" rx="20" ry="13" fill="#d5ac6c"/>
    <ellipse cx="157" cy="63" rx="14" ry="9" class="engraving-fine"/>
    <path d="M153 63h8m-4-4v8M36 34h24m-29 5h14m134-6h17m-10 5h18M44 79h51m83 1h13" class="engraving-fine"/>`,
  event: `
    <path d="M52 41l70-20 67 24-2 28-74 10-61-18z" fill="#ead3a2"/>
    <path d="M52 41l60 24 77-20m-77 20v18m-60-18l34-8m101 16-35-16" class="engraving-fine"/>
    <path d="M81 55l-8-30 80-13 9 39-50 15z" fill="#f2e1b9"/>
    <path d="M92 48l22-4m-20 10l16-3m30-27 10-2 3 9-11 2zm-57 0 70-11 7 27" class="engraving-fine"/>
    <path d="M199 22q-10-6-20 0t-16 1m39 4q-10-6-20 0t-16 1m39 4q-10-6-20 0t-16 1M22 66q8-5 17-1m-13 7q9-4 17 0m151-5q8-5 18-1" stroke="#537262" fill="none"/>`,
  arrival: `
    <circle cx="115" cy="46" r="28" fill="#efdeb5"/>
    <circle cx="115" cy="46" r="23" class="engraving-fine"/>
    <path d="M115 7l6 33 32 6-32 6-6 33-6-33-32-6 32-6z" fill="#bb875b"/>
    <path d="M115 7v39l38 0-32 6-6 33V46H77l32-6z" fill="#6a8270"/>
    <path d="M37 50q10-7 20 0t20 0m78 0q10-7 20 0t20 0m-152 7q9-6 18-1m108 1q9-6 18-1" class="engraving-fine"/>`,
};

export function paperIllustration(subject) {
  return `<svg class="paper-illustration" viewBox="0 0 230 88" aria-hidden="true"
    fill="none" stroke="#625843" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">
    ${drawings[subject]}
  </svg>`;
}
