import Phaser from 'phaser';

/** Undertale-style bindings: Z/Enter confirm, X/Shift cancel, C/Esc menu, arrows or WASD to move. */
export class Controls {
  private keys: Record<string, Phaser.Input.Keyboard.Key[]>;

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
  }

  down(name: string): boolean {
    return this.keys[name].some((k) => k.isDown);
  }

  pressed(name: string): boolean {
    return this.keys[name].some((k) => Phaser.Input.Keyboard.JustDown(k));
  }

  reset() {
    for (const list of Object.values(this.keys)) for (const k of list) k.reset();
  }

  axis(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.down('left')) x -= 1;
    if (this.down('right')) x += 1;
    if (this.down('up')) y -= 1;
    if (this.down('down')) y += 1;
    return { x, y };
  }
}
