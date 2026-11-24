// A handful of short, damped impacts. Generate them locally so a roll also sounds offline.
function makeClatter(context, reducedMotion) {
  const rate = context.sampleRate;
  const hits = reducedMotion ? [[0, .24, 810]] :
    [[.13, .38, 710], [.28, .31, 860], [.405, .23, 760], [.495, .14, 910], [.554, .09, 820]];
  const buffer = context.createBuffer(1, Math.ceil((hits.at(-1)[0] + .09) * rate), rate);
  const data = buffer.getChannelData(0);
  let seed = 31;
  for (const [offset, amplitude, pitch] of hits) {
    const start = Math.round(offset * rate);
    for (let n = 0; n < Math.floor(.082 * rate); n++) {
      const t = n / rate;
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      const click = (seed / 2147483648 - 1) * Math.exp(-t * 470);
      const knock = Math.sin(2 * Math.PI * pitch * t) + .4 * Math.sin(2 * Math.PI * pitch * 1.66 * t);
      data[start + n] += amplitude * (click + .52 * knock * Math.exp(-t * 117));
    }
  }
  return buffer;
}

const toggle = document.querySelector('#dice-audio');
const Audio = window.AudioContext || window.webkitAudioContext;
if (toggle && Audio) {
  let context;
  let playing;
  let enabled = false;
  const buffers = new Map();
  function stopClatter() {
    if (!playing) return;
    playing.stop();
    playing = undefined;
  }
  function setEnabled(value) {
    enabled = value;
    toggle.setAttribute('aria-pressed', String(value));
    toggle.querySelector('span').textContent = value ? '開' : '關';
  }

  toggle.hidden = false;
  toggle.addEventListener('click', async () => {
    if (enabled) {
      setEnabled(false);
      stopClatter();
      return;
    }
    try {
      if (!context) {
        context = new Audio();
        context.addEventListener('statechange', () => {
          if (context.state !== 'running') stopClatter();
        });
      }
      setEnabled(true);
      await context.resume();
    } catch {
      setEnabled(false);
    }
  });
  document.addEventListener('harbor-dice-reveal', ({ detail }) => {
    stopClatter();
    if (!enabled || context?.state !== 'running') return;
    const reduced = Boolean(detail?.reducedMotion);
    if (!buffers.has(reduced)) buffers.set(reduced, makeClatter(context, reduced));
    const sound = context.createBufferSource();
    sound.buffer = buffers.get(reduced);
    sound.connect(context.destination);
    sound.onended = () => {
      sound.disconnect();
      if (playing === sound) playing = undefined;
    };
    playing = sound;
    sound.start();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopClatter();
  });
}
