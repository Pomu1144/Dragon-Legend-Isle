import Phaser from 'phaser';
import { Sound } from '../audio/Sound';
import { body, cursor, label, panel, COLORS } from './widgets';
import { Controls } from './input';

export interface Line {
  text: string;
  speaker?: string;
  portrait?: string;
  choices?: string[];
  voice?: number; // blip pitch multiplier
}

/**
 * Typewriter dialogue box with an optional framed portrait and choices.
 * Lives in screen space (scrollFactor 0) at the bottom of the viewport.
 */
export class Dialogue {
  scene: Phaser.Scene;
  root: Phaser.GameObjects.Container;
  private box: Phaser.GameObjects.NineSlice;
  private text: Phaser.GameObjects.Text;
  private frame: Phaser.GameObjects.Image;
  private portrait: Phaser.GameObjects.Image;
  private nameText: Phaser.GameObjects.Text;
  private next: Phaser.GameObjects.Image;
  private choiceTexts: Phaser.GameObjects.Text[] = [];
  private cursor: Phaser.GameObjects.Container;
  private lines: Line[] = [];
  private idx = 0;
  private shown = 0;
  private full = '';
  private acc = 0;
  private pause = 0;
  private choice = 0;
  private done: ((choice: number) => void) | null = null;
  active = false;
  private controls: Controls;
  private lastChoice = -1;

  constructor(scene: Phaser.Scene, controls: Controls) {
    this.scene = scene;
    this.controls = controls;
    const W = scene.scale.width;
    const H = scene.scale.height;
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(5000).setVisible(false);
    this.box = panel(scene, 40, H - 210, W - 80, 186, 'blue');
    this.box.setAlpha(0.97);
    this.frame = scene.add.image(64, H - 236, 'ui_frame_portrait').setTint(0x7c848e).setOrigin(0, 0).setDisplaySize(176, 182);
    this.portrait = scene.add.image(64 + 88, H - 236 + 84, 'hero_portrait').setOrigin(0.5);
    this.nameText = label(scene, 64 + 88, H - 236 + 165, '', 20, COLORS.cream, 5).setOrigin(0.5);
    this.text = body(scene, 268, H - 186, '', 28, COLORS.cream, W - 268 - 90);
    this.next = scene.add.image(W - 86, H - 52, 'ui_arrow_down').setScale(0.36).setVisible(false);
    scene.tweens.add({ targets: this.next, y: '+=6', yoyo: true, repeat: -1, duration: 380, ease: 'Sine.easeInOut' });
    this.cursor = cursor(scene, 'ui_cursor_diamond', 0.42, 5, 360).setVisible(false);
    this.root.add([this.box, this.frame, this.portrait, this.nameText, this.text, this.next, this.cursor]);
  }

  show(lines: Line[] | string[], done?: (choice: number) => void) {
    this.lines = lines.map((l) => (typeof l === 'string' ? { text: l } : l));
    this.idx = 0;
    this.done = done ?? null;
    this.active = true;
    this.root.setVisible(true);
    this.root.setAlpha(0);
    this.scene.tweens.add({ targets: this.root, alpha: 1, duration: 140 });
    this.lastChoice = -1;
    this.begin();
  }

  private begin() {
    const l = this.lines[this.idx];
    const hasPortrait = !!l.portrait;
    this.frame.setVisible(hasPortrait);
    this.portrait.setVisible(hasPortrait);
    this.nameText.setVisible(hasPortrait && !!l.speaker);
    const left = hasPortrait ? 268 : 90;
    this.text.setX(left);
    this.text.setWordWrapWidth(this.scene.scale.width - left - 100, true);
    if (hasPortrait) {
      this.portrait.setTexture(l.portrait!);
      const src = this.portrait.texture.getSourceImage() as HTMLImageElement;
      const s = Math.min(150 / src.width, 132 / src.height);
      this.portrait.setScale(s);
      this.nameText.setText(l.speaker ?? '');
      this.portrait.y = this.frame.y + 80 + 6;
      this.scene.tweens.add({ targets: this.portrait, y: this.frame.y + 80, duration: 160, ease: 'Cubic.easeOut' });
    }
    this.full = l.text;
    this.shown = 0;
    this.acc = 0;
    this.pause = 0;
    this.text.setText('');
    this.next.setVisible(false);
    for (const t of this.choiceTexts) t.destroy();
    this.choiceTexts = [];
    this.cursor.setVisible(false);
  }

  private typing() {
    return this.shown < this.full.length;
  }

  private showChoices() {
    const l = this.lines[this.idx];
    if (!l.choices) {
      this.next.setVisible(true);
      return;
    }
    const H = this.scene.scale.height;
    const startX = this.text.x + 40;
    let x = startX;
    for (const c of l.choices) {
      const t = label(this.scene, x, H - 82, c, 26, COLORS.cream, 6).setOrigin(0, 0.5);
      this.choiceTexts.push(t);
      this.root.add(t);
      x += t.width + 90;
    }
    this.choice = 0;
    this.cursor.setVisible(true);
    this.updateChoice();
  }

  private updateChoice() {
    this.choiceTexts.forEach((t, i) => t.setColor(i === this.choice ? COLORS.yellow : COLORS.cream));
    const t = this.choiceTexts[this.choice];
    this.cursor.setPosition(t.x - 26, t.y);
  }

  update(dt: number) {
    if (!this.active) return;
    const c = this.controls;
    if (this.typing()) {
      if (this.pause > 0) {
        this.pause -= dt;
      } else {
        this.acc += dt;
        const rate = 26;
        while (this.acc >= rate && this.typing()) {
          this.acc -= rate;
          const ch = this.full[this.shown];
          this.shown++;
          if (ch !== ' ' && this.shown % 2 === 0) Sound.blip(this.lines[this.idx].voice ?? 1);
          if (',.!?…'.includes(ch) && this.typing()) {
            this.pause = ch === ',' ? 110 : 220;
            break;
          }
        }
        this.text.setText(this.full.slice(0, this.shown));
        if (!this.typing()) this.showChoices();
      }
      if (c.pressed('cancel') || c.pressed('confirm')) {
        this.shown = this.full.length;
        this.text.setText(this.full);
        this.showChoices();
      }
      return;
    }
    const l = this.lines[this.idx];
    if (l.choices) {
      if (c.pressed('left')) {
        this.choice = (this.choice + l.choices.length - 1) % l.choices.length;
        Sound.move();
        this.updateChoice();
      }
      if (c.pressed('right')) {
        this.choice = (this.choice + 1) % l.choices.length;
        Sound.move();
        this.updateChoice();
      }
    }
    if (c.pressed('confirm')) {
      if (l.choices) {
        Sound.confirm();
        this.lastChoice = this.choice;
      }
      this.idx++;
      if (this.idx >= this.lines.length) {
        this.close();
      } else {
        this.begin();
      }
    }
  }

  private close() {
    this.active = false;
    this.scene.tweens.add({ targets: this.root, alpha: 0, duration: 120, onComplete: () => this.root.setVisible(false) });
    const cb = this.done;
    this.done = null;
    cb?.(this.lastChoice);
  }
}
