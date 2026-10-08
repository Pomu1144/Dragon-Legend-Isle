// On-screen controls for phones and tablets, drawn with the painted UI sprites.
// A floating joystick on the left half of the screen (push it to the rim to run), Z / X
// buttons on the right, and a menu button in the corner. Everything feeds Controls, so
// the game reads touch exactly like the keyboard.

type Action = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'cancel' | 'menu' | 'run';

const held: Record<Action, boolean> = { up: false, down: false, left: false, right: false, confirm: false, cancel: false, menu: false, run: false };
const presses: Record<Action, number> = { up: 0, down: 0, left: 0, right: 0, confirm: 0, cancel: 0, menu: 0, run: 0 };
const stick = { x: 0, y: 0 };
let active = false;
let stickZone: HTMLElement | null = null;
let rootEl: HTMLElement | null = null;
let layout: 'world' | 'battle' = 'world';

export const Touch = {
  get active() {
    return active;
  },
  down(a: string) {
    return active && !!held[a as Action];
  },
  /** How many times an action has been pressed so far (each Controls keeps its own read position). */
  count(a: string) {
    return presses[a as Action] ?? 0;
  },
  /**
   * Turn the joystick zone (the whole left half) off for screens driven by direct taps, such as
   * battles, so taps there reach the game; the Z / X / menu buttons keep working.
   */
  setStick(on: boolean) {
    if (stickZone) stickZone.style.pointerEvents = on ? '' : 'none';
    if (!on) for (const a of ['left', 'right', 'up', 'down', 'run'] as const) press(a, false);
  },
  /**
   * Where the Z / X buttons sit. In battle they stand in a column at the right edge above the
   * bottom panel, clear of Kael's portrait (a tap target of its own).
   */
  setLayout(to: 'world' | 'battle') {
    layout = to;
    if (rootEl) rootEl.classList.toggle('battle', to === 'battle');
  },
  /** Analog stick, length 0..1. */
  axis() {
    return { x: stick.x, y: stick.y };
  },
};

function press(a: Action, on: boolean) {
  if (on && !held[a]) presses[a]++;
  held[a] = on;
}

const css = `
#touch { position: fixed; inset: 0; pointer-events: none; z-index: 10; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
#touch.on { display: block; } #touch.off { display: none; }
#touch .zone { position: absolute; left: 0; top: 0; bottom: 0; width: 50%; pointer-events: auto; touch-action: none; }
#touch .base { position: absolute; width: var(--b); height: var(--b); margin: calc(var(--b) / -2) 0 0 calc(var(--b) / -2); --b: clamp(96px, 30vh, 150px); background: url(assets/ui/slot_round.png) center/contain no-repeat; opacity: 0; transition: opacity .15s; filter: drop-shadow(0 4px 10px rgba(0,0,0,.6)); }
#touch .base.show { opacity: .6; }
#touch .knob { position: absolute; left: 50%; top: 50%; width: 46%; height: 48%; margin: -24% 0 0 -23%; background: url(assets/ui/soul.png) center/contain no-repeat; filter: drop-shadow(0 0 10px rgba(255,80,90,.55)); }
#touch .btn { position: absolute; pointer-events: auto; touch-action: none; border-radius: 50%; background: url(assets/ui/slot_round.png) center/contain no-repeat; filter: drop-shadow(0 4px 10px rgba(0,0,0,.6)); opacity: .5; transition: transform .06s, opacity .06s; }
#touch .btn::after { content: ''; position: absolute; inset: 24%; background: var(--icon) center/contain no-repeat; }
#touch .btn.hold { transform: scale(.92); opacity: 1; }
#touch .btn span { position: absolute; pointer-events: none; left: 50%; bottom: -1.3em; transform: translateX(-50%); font: 700 clamp(9px, 2.6vh, 13px) Cinzel, serif; letter-spacing: .08em; color: #e8dcc0; text-shadow: 0 1px 3px #000; white-space: nowrap; }
#touch .z { width: clamp(58px, 19vh, 104px); height: clamp(58px, 19vh, 104px); right: calc(2.2vw + env(safe-area-inset-right)); bottom: calc(7vh + env(safe-area-inset-bottom)); --icon: url(assets/ui/btn_play.png); }
#touch .x { width: clamp(46px, 15vh, 84px); height: clamp(46px, 15vh, 84px); right: calc(2.2vw + clamp(64px, 22vh, 124px) + env(safe-area-inset-right)); bottom: calc(3vh + 1.5em + env(safe-area-inset-bottom)); --icon: url(assets/ui/btn_x.png); }
#touch.battle .z { width: clamp(50px, 16vh, 92px); height: clamp(50px, 16vh, 92px); right: calc(1.6vw + env(safe-area-inset-right)); bottom: calc(34vh + env(safe-area-inset-bottom)); }
#touch.battle .x { width: clamp(42px, 13vh, 74px); height: clamp(42px, 13vh, 74px); right: calc(1.6vw + clamp(4px, 1.5vh, 9px) + env(safe-area-inset-right)); bottom: calc(34vh + clamp(50px, 16vh, 92px) + 1.9em + env(safe-area-inset-bottom)); }
#touch .c { width: clamp(38px, 11vh, 64px); height: clamp(38px, 11vh, 64px); right: calc(1.6vw + env(safe-area-inset-right)); top: calc(2vh + env(safe-area-inset-top)); --icon: url(assets/ui/btn_pause.png); }
#rotate { position: fixed; inset: 0; z-index: 20; display: none; align-items: center; justify-content: center; flex-direction: column; gap: 18px; background: #05070d; color: #e8dcc0; font: 700 20px Cinzel, serif; letter-spacing: .06em; text-align: center; }
#rotate img { width: 96px; opacity: .9; animation: tilt 2.4s ease-in-out infinite; }
@keyframes tilt { 0%, 30% { transform: rotate(0); } 60%, 100% { transform: rotate(90deg); } }
@media (orientation: portrait) { body.touching #rotate { display: flex; } }
`;

/** Show the on-screen controls the first time the screen is touched (or right away on touch-only devices). */
export function installTouchControls() {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'touch';
  root.className = 'off';
  root.innerHTML = `<div class="zone"><div class="base"><div class="knob"></div></div></div>
    <div class="btn x"><span>BACK</span></div><div class="btn z"><span>OK</span></div><div class="btn c"></div>`;
  document.body.appendChild(root);
  rootEl = root;
  if (layout === 'battle') root.classList.add('battle');

  const rot = document.createElement('div');
  rot.id = 'rotate';
  rot.innerHTML = `<img src="assets/ui/med_book.png" alt=""><div>Turn your device sideways</div>`;
  document.body.appendChild(rot);

  const enable = () => {
    if (active) return;
    active = true;
    root.classList.remove('off');
    root.classList.add('on');
    document.body.classList.add('touching');
  };
  if (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches) enable();
  window.addEventListener('touchstart', enable, { passive: true, capture: true });
  // A real keyboard hides the overlay again.
  window.addEventListener('keydown', () => {
    if (!active) return;
    active = false;
    root.classList.remove('on');
    root.classList.add('off');
    document.body.classList.remove('touching');
  });

  // Buttons
  const bind = (sel: string, a: Action) => {
    const el = root.querySelector(sel) as HTMLElement;
    const on = (e: PointerEvent) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      el.classList.add('hold');
      press(a, true);
      navigator.vibrate?.(8);
    };
    const off = () => {
      el.classList.remove('hold');
      press(a, false);
    };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('lostpointercapture', off);
  };
  bind('.z', 'confirm');
  bind('.x', 'cancel');
  bind('.c', 'menu');

  // Floating joystick
  const zone = root.querySelector('.zone') as HTMLElement;
  stickZone = zone;
  const base = root.querySelector('.base') as HTMLElement;
  const knob = root.querySelector('.knob') as HTMLElement;
  const R = () => (base.offsetWidth || 150) * 0.4;
  let id = -1;
  let ox = 0;
  let oy = 0;
  const setDir = (x: number, y: number) => {
    const m = Math.hypot(x, y);
    stick.x = m > 0.18 ? x : 0;
    stick.y = m > 0.18 ? y : 0;
    // digital directions for menus, with a little hysteresis
    press('left', x < -0.45);
    press('right', x > 0.45);
    press('up', y < -0.45);
    press('down', y > 0.45);
    press('run', m > 0.92);
  };
  const move = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    let dx = e.clientX - ox;
    let dy = e.clientY - oy;
    const m = Math.hypot(dx, dy);
    const r = R();
    if (m > r) {
      dx *= r / m;
      dy *= r / m;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    setDir(dx / r, dy / r);
  };
  const end = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    id = -1;
    base.classList.remove('show');
    knob.style.transform = '';
    setDir(0, 0);
  };
  zone.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (id !== -1) return;
    id = e.pointerId;
    zone.setPointerCapture(id);
    ox = e.clientX;
    oy = e.clientY;
    base.style.left = ox + 'px';
    base.style.top = oy + 'px';
    base.classList.add('show');
  });
  zone.addEventListener('pointermove', move);
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);

  // Try for full screen on the first touch (Android/desktop); iOS uses the home-screen web-app mode.
  const fs = () => {
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    if (!document.fullscreenElement) (el.requestFullscreen?.({ navigationUI: 'hide' }) ?? el.webkitRequestFullscreen?.())?.catch?.(() => {});
    (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.('landscape').catch(() => {});
  };
  window.addEventListener('touchend', fs, { once: true });
}
