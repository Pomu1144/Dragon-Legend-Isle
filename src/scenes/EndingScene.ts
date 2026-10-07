import Phaser from 'phaser';
import { Sound } from '../audio/Sound';
import { State } from '../state';
import { Dialogue, Line } from '../ui/Dialogue';
import { Controls } from '../ui/input';
import { fireflies, lightPool, sparkleBurst } from '../ui/fx';
import { body, label, title, COLORS } from '../ui/widgets';

export class EndingScene extends Phaser.Scene {
  private controls!: Controls;
  private dialogue!: Dialogue;
  private peaceful = true;
  private canLeave = false;

  constructor() {
    super('Ending');
  }

  init(data: { peaceful?: boolean }) {
    this.peaceful = data?.peaceful ?? true;
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    this.controls = new Controls(this);
    this.canLeave = false;
    State.setFlag(this.peaceful ? 'endingPeace' : 'endingCold');
    State.save();
    const bg = this.add.image(W / 2, H / 2, 'bg_waystone');
    bg.setScale(Math.max(W / bg.width, H / bg.height) * 1.05);
    this.add.rectangle(0, 0, W, H, 0x02040c, 0.35).setOrigin(0);
    this.add.image(W / 2, H / 2, 'vignette').setDisplaySize(W, H);
    this.dialogue = new Dialogue(this, this.controls);
    this.cameras.main.fadeIn(1400, 0, 0, 0);
    Sound.playMusic('ending');

    // The Waystone (painted at ~ (830, 300) in the source) relights.
    const sx = W / 2 + (830 - 1669 / 2) * bg.scale;
    const sy = H / 2 + (300 - 942 / 2) * bg.scale;
    const stoneGlow = lightPool(this, sx, sy, 160, this.peaceful ? 0xffe9a8 : 0x8fb4d8, false, 5);
    stoneGlow.setAlpha(0);
    this.tweens.add({ targets: stoneGlow, alpha: this.peaceful ? 0.85 : 0.35, scale: stoneGlow.scale * 2.4, duration: 3000, delay: 900, ease: 'Sine.easeInOut' });
    this.time.delayedCall(1200, () => Sound.chime());
    fireflies(this, 0, 0, W, H, this.peaceful ? 60 : 12, 6, this.peaceful ? 0xffe08a : 0x9fb4d8);

    if (this.peaceful) {
      const divine = this.add.image(W / 2, 40, 'mon_divine').setBlendMode(Phaser.BlendModes.SCREEN).setAlpha(0).setDepth(20);
      divine.setScale(420 / divine.height);
      const halo = this.add.image(W / 2, 140, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xfff4dc).setScale(3).setAlpha(0).setDepth(19);
      this.time.delayedCall(2800, () => {
        this.tweens.add({ targets: divine, alpha: 0.95, y: 290, duration: 2600, ease: 'Sine.easeOut' });
        this.tweens.add({ targets: halo, alpha: 0.4, y: 210, duration: 2600 });
        this.tweens.add({ targets: divine, y: 300, yoyo: true, repeat: -1, duration: 2400, delay: 2600, ease: 'Sine.easeInOut' });
        sparkleBurst(this, W / 2, 240, 30, 30, 300);
      });
      const D = (text: string): Line => ({ text, speaker: 'Divine', portrait: 'mon_divine', voice: 0.6 });
      const name = State.get().name;
      this.time.delayedCall(5600, () =>
        this.dialogue.show(
          [
            { text: '* A light older than the island descends from the canopy.' },
            D('Little tamer. You walked through fear and answered it with kindness.'),
            D('The Drake is the stone\'s guardian. You did not break it. You helped it remember.'),
            D('The western Waystone burns again. But four still sleep at the edges of the world.'),
            D(`Rest now, ${name}. Dragon Legend Isle will remember your name.`),
          ],
          () => this.card(),
        ),
      );
    } else {
      this.time.delayedCall(2400, () =>
        this.dialogue.show(
          [
            { text: '* With the Drake\'s last breath, the Waystone sputters back to life.' },
            { text: '* It is lit. But its light is cold, and no warmth reaches you.' },
            { text: '* Far above, something that was watching turns away.' },
            { text: '* ...Perhaps there was another way.' },
          ],
          () => this.card(),
        ),
      );
    }
  }

  private card() {
    const W = this.scale.width;
    const H = this.scale.height;
    const s = State.get();
    const shade = this.add.rectangle(0, 0, W, H, 0x02040c, 0).setOrigin(0).setDepth(100);
    this.tweens.add({ targets: shade, fillAlpha: 0.78, duration: 1200 });
    const c = this.add.container(0, 0).setDepth(101).setAlpha(0);
    c.add(this.add.image(W / 2, 150, 'logo').setScale(0.42));
    c.add(title(this, W / 2, 300, this.peaceful ? 'The Western Waystone is Relit' : 'The Western Waystone Burns Cold', 40, this.peaceful ? COLORS.gold : '#9fb4d8').setOrigin(0.5));
    const bound = Object.values(s.bestiary).filter((r) => r.bound).length;
    c.add(body(this, W / 2, 380, `Spared ${s.spares}   ·   Defeated ${s.kills}   ·   Bound ${bound}   ·   LV ${s.lv}`, 26, COLORS.cream).setOrigin(0.5));
    c.add(body(this, W / 2, 430, this.peaceful ? (s.kills === 0 ? 'Not a single life taken.' : 'Mercy, in the end. But not from the beginning.') : 'There may have been another way.', 22, '#cfe3ff').setOrigin(0.5));
    c.add(label(this, W / 2, 530, 'TO BE CONTINUED…', 34, COLORS.cream, 7).setOrigin(0.5));
    const hint = label(this, W / 2, 640, 'Press Z to return to the title', 20, '#9bb0d0', 5).setOrigin(0.5);
    c.add(hint);
    this.tweens.add({ targets: c, alpha: 1, duration: 1400, delay: 600, onComplete: () => (this.canLeave = true) });
    this.tweens.add({ targets: hint, alpha: 0.4, yoyo: true, repeat: -1, duration: 900 });
  }

  update(_t: number, dt: number) {
    if (this.dialogue.active) return this.dialogue.update(dt);
    if (this.canLeave && this.controls.pressed('confirm')) {
      this.canLeave = false;
      Sound.stopMusic(1);
      this.cameras.main.fadeOut(1000, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Title'));
    }
  }
}
