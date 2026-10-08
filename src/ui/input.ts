import Phaser from 'phaser';
import { Touch } from './touch';

/** Undertale-style bindings: Z/Enter confirm, X/Shift cancel, C/Esc menu, arrows or WASD to move. */
export class Controls {
  private keys: Record<string, Phaser.Input.Keyboard.Key[]>;
  private seen: Record<string, number> = {}; // touch presses already read by this scene

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    const k = (...codes: number[]) => codes.map((c) => kb.addKey(c, true, false));
    this.keys = {
      up: k(K.UP, K.W),
      down: k(K.DOWN, K.S),
      left: k(K.LEFT, K.A),
      right: k(K.RIGHT, K.D),
      confirm: k(K.Z, K.ENTER, K.SPACE),
      cancel: k(K.X, K.SHIFT),
      menu: k(K.C, K.ESC),
      run: k(K.SHIFT),
      debug: k(K.F3),
    };
    for (const name of Object.keys(this.keys)) this.seen[name] = Touch.count(name);
  }

  down(name: string): boolean {
    return this.keys[name].some((k) => k.isDown) || Touch.down(name);
  }

  pressed(name: string): boolean {
    const key = this.keys[name].some((k) => Phaser.Input.Keyboard.JustDown(k));
    const n = Touch.count(name);
    const tap = n > (this.seen[name] ?? 0);
    this.seen[name] = n;
    return key || tap;
  }

  reset() {
    for (const list of Object.values(this.keys)) for (const k of list) k.reset();
    for (const name of Object.keys(this.keys)) this.seen[name] = Touch.count(name);
  }

  axis(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.down('left')) x -= 1;
    if (this.down('right')) x += 1;
    if (this.down('up')) y -= 1;
    if (this.down('down')) y += 1;
    if (Touch.active && x === 0 && y === 0) return Touch.axis(); // analog stick: 0..1, slower near the centre
    return { x, y };
  }
}
