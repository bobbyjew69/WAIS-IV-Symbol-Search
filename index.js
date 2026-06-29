import { SYMBOLS } from './symbols.js';
import { NORMS } from './norms.js';
import { SCALED_SCORES } from './scaled-scores.js';
import { shuffle } from './array.js';

const TIME_LIMIT_SECONDS = 120;

/** Must be an even number. */
const PRACTICE_COUNT = 2;

/** Must be an even number. */
const MAX_PUZZLE_COUNT = 60;

/** Puzzles shown per page (desktop, two columns). */
const PER_PAGE = 14;

/** Below this width: single column, tap buttons. */
const MOBILE_BREAKPOINT = '(max-width: 600px)';
const isMobile = () => window.matchMedia(MOBILE_BREAKPOINT).matches;

/** Puzzles per page on mobile (single column). */
const MOBILE_PER_PAGE = 7;

const OPTION_COUNT = 5;

globalThis.RAW_SCORE = 0;

const $ = document.querySelector.bind(document);
const $$ = function (selector) {
  return [...document.querySelectorAll(selector)];
};

document.addEventListener('DOMContentLoaded', main);

async function main() {
  updateTextboxes();
  setupPencil();

  $('#years').addEventListener('input', updateTextboxes);

  await practice();

  await waitFor(1_000);

  $('.panel:first-child').classList.add('hidden');
  $('.panel:last-child').classList.remove('hidden');
  $('.panel:last-child').classList.add('fade-in');

  $('#start').addEventListener('click', start);
}

function start() {
  $('.panel:not(.hidden) > h4')?.remove();
  $('.start')?.remove();
  $('.instructions').classList.add('hidden');
  $('.notif').classList.remove('fade-out');
  $('.notif').style.color = 'black';

  /** Used to ensure 50% [NO] answers. */
  const coinFlips = shuffle([
    ...new Array(MAX_PUZZLE_COUNT / 2).fill(true),
    ...new Array(MAX_PUZZLE_COUNT / 2).fill(false),
  ]);

  const puzzles = coinFlips.map(generatePuzzle);

  const test = $('#test');
  const perPage = computePerPage();
  const pageCount = Math.ceil(MAX_PUZZLE_COUNT / perPage);
  let page = 0;

  const state = { isCountingDown: true };

  function onScore(delta) {
    RAW_SCORE += delta;
    updateTextboxes();
  }

  function finish() {
    state.isCountingDown = false;
    test.replaceChildren();
    $('.notif').textContent = 'Test complete!';
  }

  function renderPage() {
    test.replaceChildren();

    const grid = document.createElement('div');
    grid.className = 'grid';
    const from = page * perPage;
    const to = Math.min(from + perPage, MAX_PUZZLE_COUNT);
    for (let i = from; i < to; i++) {
      grid.append(renderQuestion(puzzles[i], i + 1, { onScore }));
    }
    test.append(grid);

    const nav = document.createElement('div');
    nav.className = 'nav';

    const next = document.createElement('button');
    next.id = 'next';
    next.textContent = page < pageCount - 1 ? 'NEXT' : 'FINISH';
    next.addEventListener('click', () => {
      if (page < pageCount - 1) {
        page++;
        renderPage();
        window.scrollTo(0, 0);
      } else {
        finish();
      }
    });

    nav.append(next);
    test.append(nav);
  }

  renderPage();

  countdown(state, () => {
    test.classList.add('disabled');
    $('.notif').textContent = "Time's up!";
  });
}

/** Desktop: 14 over two columns. Mobile: 7 in a single column. */
function computePerPage() {
  return isMobile() ? MOBILE_PER_PAGE : PER_PAGE;
}

function practice() {
  return new Promise((resolve) => {
    $('h4').textContent = `Practice #${1} of ${PRACTICE_COUNT}`;
    let currentPracticeNumber = 1;

    const coinFlips = shuffle([
      ...new Array(PRACTICE_COUNT / 2).fill(true),
      ...new Array(PRACTICE_COUNT / 2).fill(false),
    ]);

    const test = $('#test');

    async function onAnswer(correct) {
      const notifElement = $('.notif');

      if (correct) {
        notifElement.textContent = 'Good job!';
        notifElement.style.color = 'green';
      } else {
        notifElement.textContent = "Oops, that wasn't right!";
        notifElement.style.color = 'red';
      }

      notifElement.classList.remove('fade-out');
      await waitFor(0);
      notifElement.classList.add('fade-out');

      currentPracticeNumber++;

      if (currentPracticeNumber > PRACTICE_COUNT) {
        test.replaceChildren();
        resolve();
        return;
      }

      $('h4').textContent =
        `Practice #${currentPracticeNumber} of ${PRACTICE_COUNT}`;
      await waitFor(700);
      show();
    }

    function show() {
      test.replaceChildren();
      const puzzle = generatePuzzle(coinFlips[currentPracticeNumber - 1]);
      const grid = document.createElement('div');
      grid.className = 'grid';
      grid.append(
        renderQuestion(puzzle, currentPracticeNumber, {
          onAnswer,
          allowChange: false,
        })
      );
      test.append(grid);
    }

    show();
  });
}

/**
 * @param {Boolean} hasMatch - Whether an objective matches one of the options.
 * @returns {{ objectives: SSSymbol[], options: SSSymbol[], hasMatch: Boolean }}
 */
function generatePuzzle(hasMatch = true) {
  const pool = shuffle(SYMBOLS);
  const options = pool.slice(0, OPTION_COUNT);

  const sliceIndex = hasMatch ? OPTION_COUNT - 1 : OPTION_COUNT;
  const objectives = pool.slice(sliceIndex, sliceIndex + 2);

  return { objectives: shuffle(objectives), options: shuffle(options), hasMatch };
}

function symbolCell(className, symbol) {
  const el = document.createElement('div');
  el.className = className;
  el.dataset.symbol = symbol.symbol;
  el.dataset.degrees = symbol.degrees;
  el.style.setProperty('--deg', `${symbol.degrees}deg`);
  return el;
}

/**
 * @param {{ objectives, options, hasMatch }} puzzle
 * @param {Number} number - 1-based puzzle number.
 * @param {Object} handlers
 * @param {(delta: Number) => void} [handlers.onScore] - Called with the score change. Used when the answer can change.
 * @param {(correct: Boolean) => void} [handlers.onAnswer] - Called once on first answer. Used for the locked practice flow.
 * @param {Boolean} [handlers.allowChange=true] - Whether the answer can be changed after the first click.
 * @returns {HTMLElement}
 */
function renderQuestion(puzzle, number, { onScore, onAnswer, allowChange = true } = {}) {
  const row = document.createElement('div');
  row.className = 'qrow';

  const num = document.createElement('span');
  num.className = 'qnum';
  num.textContent = number;
  row.append(num);

  puzzle.objectives.forEach((o) => row.append(symbolCell('objective', o)));

  const divider = document.createElement('div');
  divider.className = 'divider';
  row.append(divider);

  puzzle.options.forEach((o) => row.append(symbolCell('option', o)));

  const pad = document.createElement('div');

  /** Current selection: null, true (YES) or false (NO). */
  let current = null;
  /** Once locked (practice flow), the answer can't change. */
  let locked = false;

  function markResult(choice) {
    pad.classList.remove('chose-yes', 'chose-no');
    pad.classList.add(choice ? 'chose-yes' : 'chose-no');
  }

  // Shared by the drawing pad (desktop) and the tap buttons (mobile).
  function applyChoice(choice) {
    markResult(choice);

    if (!allowChange) {
      if (locked) return;
      locked = true;
      current = choice;
      onAnswer?.(choice === puzzle.hasMatch);
      return;
    }

    if (choice === current) return;

    if (current !== null) {
      const previousCorrect = current === puzzle.hasMatch;
      onScore?.(previousCorrect ? -1 : 1);
    }
    current = choice;
    onScore?.(choice === puzzle.hasMatch ? 1 : -1);
  }

  if (isMobile()) {
    pad.className = 'answerbtns';

    const yesBtn = document.createElement('button');
    yesBtn.type = 'button';
    yesBtn.className = 'ansbtn yes';
    yesBtn.textContent = 'YES';
    yesBtn.addEventListener('click', () => applyChoice(true));

    const noBtn = document.createElement('button');
    noBtn.type = 'button';
    noBtn.className = 'ansbtn no';
    noBtn.textContent = 'NO';
    noBtn.addEventListener('click', () => applyChoice(false));

    pad.append(yesBtn, noBtn);
  } else {
    pad.className = 'answerpad';

    const yesLabel = document.createElement('div');
    yesLabel.className = 'lbl yes';
    yesLabel.textContent = 'YES';

    const noLabel = document.createElement('div');
    noLabel.className = 'lbl no';
    noLabel.textContent = 'NO';

    const canvas = document.createElement('canvas');
    canvas.width = 460;
    canvas.height = 80;
    const mid = canvas.width / 2;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#222';

    pad.append(yesLabel, noLabel, canvas);

    /** Pixel count above which a side counts as inked. */
    const INK_THRESHOLD = 8;

    function toCanvas(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      return [
        ((clientX - rect.left) * canvas.width) / rect.width,
        ((clientY - rect.top) * canvas.height) / rect.height,
      ];
    }

    function inkOnSide(fromX, toX) {
      const data = ctx.getImageData(fromX, 0, toX - fromX, canvas.height).data;
      let count = 0;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 0) count++;
      }
      return count;
    }

    // Drawing controller, driven by the global pen so a stroke can begin
    // before the pointer reaches this pad (press early, drag in).
    pad._draw = {
      lastX: 0,
      lastY: 0,

      start(clientX, clientY) {
        if (locked) return;
        const [x, y] = toCanvas(clientX, clientY);
        this.lastX = x;
        this.lastY = y;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 0.01, y);
        ctx.stroke();
      },

      move(clientX, clientY) {
        if (locked) return;
        const [x, y] = toCanvas(clientX, clientY);
        ctx.beginPath();
        ctx.moveTo(this.lastX, this.lastY);
        ctx.lineTo(x, y);
        ctx.stroke();
        this.lastX = x;
        this.lastY = y;
      },

      evaluate() {
        const yesInk = inkOnSide(0, mid);
        const noInk = inkOnSide(mid, canvas.width);
        const yesOn = yesInk > INK_THRESHOLD;
        const noOn = noInk > INK_THRESHOLD;

        let choice = null;
        if (yesOn && noOn) {
          // Both inked: the side with fewer pixels (the clean line) wins.
          choice = yesInk <= noInk;
        } else if (yesOn) {
          choice = true;
        } else if (noOn) {
          choice = false;
        } else {
          return;
        }

        applyChoice(choice);
      },
    };
  }

  row.append(pad);
  return row;
}

const PENCIL_SVG = `
<svg width="30" height="30" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg">
  <g transform="rotate(45 15 15)">
    <rect x="13" y="3" width="4" height="3" fill="#e8a0b0" stroke="#333" stroke-width="0.7"/>
    <rect x="13" y="6" width="4" height="15" fill="#f4c430" stroke="#333" stroke-width="0.7"/>
    <polygon points="13,21 17,21 15,27" fill="#f0d9a8" stroke="#333" stroke-width="0.7"/>
    <polygon points="14.2,24 15.8,24 15,27" fill="#333"/>
  </g>
</svg>`;

function setupPencil() {
  const pencil = document.createElement('div');
  pencil.id = 'pencil';
  pencil.innerHTML = PENCIL_SVG;
  document.body.append(pencil);

  /** Pad locked for the current press, or null. */
  let active = null;
  let pressed = false;
  /** Whether the pen is currently down on the locked pad. */
  let penDown = false;

  function padAt(x, y) {
    const el = document.elementFromPoint(x, y);
    return el ? el.closest('.answerpad') : null;
  }

  function handle(x, y) {
    if (!pressed) return;
    const pad = padAt(x, y);

    // First pad touched during this press captures the whole stroke.
    if (active === null) {
      if (pad) {
        active = pad;
        active._draw.start(x, y);
        penDown = true;
      }
      return;
    }

    // Locked: only the captured pad reacts. Other boxes are ignored, so a
    // single swing can never bleed into a neighbour.
    if (pad === active) {
      if (penDown) {
        active._draw.move(x, y);
      } else {
        active._draw.start(x, y);
        penDown = true;
      }
    } else {
      // Pen wandered off the locked pad: lift it, but keep the lock.
      penDown = false;
    }
  }

  document.addEventListener('pointerdown', (event) => {
    pressed = true;
    penDown = false;
    active = null;
    handle(event.clientX, event.clientY);
  });

  document.addEventListener('pointermove', (event) => {
    pencil.style.left = `${event.clientX}px`;
    pencil.style.top = `${event.clientY}px`;
    pencil.style.display = 'block';
    handle(event.clientX, event.clientY);
  });

  function release() {
    pressed = false;
    penDown = false;
    if (active) {
      active._draw.evaluate();
      active = null;
    }
  }

  document.addEventListener('pointerup', release);
  document.addEventListener('pointercancel', release);
}

async function waitFor(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function countdown(state, onTimeUp) {
  const startTime = new Date();
  while (state.isCountingDown) {
    const millisecondsRemaining =
      TIME_LIMIT_SECONDS * 1_000 + 999 - (new Date() - startTime);
    const timestamp = formatMS(millisecondsRemaining);
    $('.notif').textContent = timestamp;

    if (millisecondsRemaining <= 0) {
      state.isCountingDown = false;
      onTimeUp?.();
      return;
    }

    await waitFor(0);
  }
}

/**
 * Formats milliseconds as a timestamp.
 *
 * @example formatMS(119_000) === '1:59'
 * @param {Number} milliseconds
 */
function formatMS(milliseconds) {
  const string = new Date(milliseconds)
    .toLocaleTimeString(navigator.location, {
      timeZone: 'Etc/UTC',
      hour12: false,
      minute: '2-digit',
      second: '2-digit',
    })
    .slice(milliseconds < 60_000 ? 0 : 1);

  if (string.startsWith('00:0')) {
    $('.notif').classList.add('flashing');
    return (milliseconds / 1_000).toFixed(1);
  }

  if (string.startsWith('00:')) {
    return string.replace('00:', '');
  }

  return string;
}

function updateTextboxes() {
  $('#raw-score').value = RAW_SCORE;
  $('#scaled-score').value = rawToScaled(Number($('#years').value), RAW_SCORE);
  $('#iq').value = calculateIQ();
}

function calculateIQ() {
  const years = Number($('#years').value);
  const ageRange = NORMS['age-ranges'].find(([from, to]) => {
    return years >= from && years <= to;
  });
  const i = NORMS['age-ranges'].indexOf(ageRange);
  const mean = NORMS.means[i];
  const sd = NORMS.sds[i];
  const iq = 100 + ((RAW_SCORE - mean) / sd) * 15;
  return iq;
}

function rawToScaled(years, raw) {
  const key = Object.keys(SCALED_SCORES).find((key) => {
    const [from, to] = key.split('-').map(Number);
    return years >= from && years <= to;
  });

  const scaledScores = SCALED_SCORES[key];

  const scaledScore =
    scaledScores.findIndex((value) => {
      const range = Array.isArray(value) ? value : [value, value];
      const [min, max] = range;
      return raw >= min && raw <= max;
    }) + 1;

  return scaledScore;
}
