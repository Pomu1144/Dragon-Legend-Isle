import Phaser from 'phaser';
import { Sound } from '../audio/Sound';
import { State } from '../state';
import { STORY } from '../data/story';
import { ROOMS } from '../data/rooms';
import { nearestWaypoint } from '../data/waypoints';
import { Controls } from '../ui/input';
import { Touch } from '../ui/touch';
import { body, title, COLORS } from '../ui/widgets';

export class GameOverScene extends Phaser.Scene {
  private controls!: Controls;
  private ready = false;
  private text!: Phaser.GameObjects.Text;
  private full = '';
  private shown = 0;
  private acc = 0;
  private wake!: Phaser.GameObjects.Text;

  constructor() {
    super('GameOver');
  }

  create() {
    const W = this.scale.width;
    this.controls = new Controls(this);
    this.ready = false;
    this.cameras.main.setBackgroundColor('#000000');
    const t = title(this, W / 2, 230, 'GAME OVER', 92, COLORS.gold).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, duration: 2200, delay: 600 });
    const soul = this.add.image(W / 2, 380, 'ui_soul').setScale(0.3).setAlpha(0).setTint(0x777777);
    this.tweens.add({ targets: soul, alpha: 0.9, duration: 1200, delay: 1600 });
    this.time.delayedCall(2600, () => {
      soul.clearTint();
      Sound.chime();
      this.tweens.add({ targets: soul, scale: 0.36, yoyo: true, repeat: -1, duration: 600, ease: 'Sine.easeInOut' });
    });
    this.text = body(this, W / 2, 500, '', 28, COLORS.cream, 900).setOrigin(0.5, 0).setAlign('center');
    this.full = (STORY.scenes.gameover_line?.[0]?.text ?? 'Get up.').replace(/\{HERO\}/g, State.get().name);
    this.shown = 0;
    this.acc = -2800;
    // Defeat keeps the journey: the team wakes, healed, at the nearest candle.
    const wp = nearestWaypoint(State.get().room);
    this.wake = body(this, W / 2, 610, `${Touch.active ? 'OK' : 'Z'}  —  rise at the candle in ${ROOMS[wp.room].name}`, 22, '#a8a090', 1000).setOrigin(0.5, 0).setAlign('center').setAlpha(0);
  }

  update(_t: number, dt: number) {
    if (this.shown < this.full.length) {
      this.acc += dt;
      while (this.acc > 40 && this.shown < this.full.length) {
        this.acc -= 40;
        this.shown++;
        if (this.shown % 2 === 0) Sound.blip(1.25);
      }
      this.text.setText(this.full.slice(0, this.shown));
      if (this.shown >= this.full.length) {
        this.ready = true;
        this.tweens.add({ targets: this.wake, alpha: 1, duration: 600 });
      }
      return;
    }
    if (this.ready && this.controls.pressed('confirm')) {
      this.ready = false;
      this.cameras.main.fadeOut(900, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        const s = State.get();
        const wp = nearestWaypoint(s.room);
        s.hp = s.maxHp;
        State.healParty();
        s.room = wp.room;
        s.x = wp.at[0];
        s.y = wp.at[1];
        State.save();
        this.scene.start('World', { room: wp.room, at: wp.at });
      });
    }
  }
}
