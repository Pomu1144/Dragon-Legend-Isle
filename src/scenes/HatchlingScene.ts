import Phaser from 'phaser';
import { Sound } from '../audio/Sound';
import { STARTERS } from '../data/starters';
import { Controls } from '../ui/input';
import { fireflies, lightPool, sparkleBurst } from '../ui/fx';
import { body, cardName, cursor, label, panel, starRow, title, COLORS } from '../ui/widgets';

const ELEMENT_COLOR: Record<string, number> = { Earth: 0xc9a96a, Air: 0xd8e6f0, Water: 0x7fb4d8, Fire: 0xd8844a };
const CHOICE_LABEL: Record<string, string> = { earth: 'Earth', wind: 'Wind', water: 'Water', fire: 'Fire' };

/** The Tamers' Guild hatchery: pick one of the four DIB starter hatchlings. */
export class HatchlingScene extends Phaser.Scene {
  private controls!: Controls;
  private sel = 0;
  private cards: Phaser.GameObjects.Container[] = [];
  private blurb!: Phaser.GameObjects.Text;
  private nameText!: Phaser.GameObjects.Text;
  private confirming = false;
  private confirmBox?: Phaser.GameObjects.Container;
  private confirmSel = 0;
  private done = false;
  private order = ['earth', 'wind', 'water', 'fire'];

  constructor() {
    super('Hatchling');
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    this.controls = new Controls(this);
    this.sel = 0;
    this.confirming = false;
    this.done = false;
    this.cards = [];
    this.add.rectangle(0, 0, W, H, 0x02040c, 0.86).setOrigin(0);
    lightPool(this, W / 2, 300, 520, 0xffc070, false, 0).setAlpha(0.18);
    fireflies(this, 0, 0, W, H, 18, 1);
    title(this, W / 2, 56, 'The Hatchery', 40, COLORS.gold).setOrigin(0.5);
    body(this, W / 2, 102, 'Four eggs hatched this spring. Only one will follow you west.', 22, '#cfc6b2').setOrigin(0.5);

    const starters = this.order.map((c) => STARTERS.find((s) => s.choice === c)!).filter(Boolean);
    starters.forEach((s, i) => {
      const x = 205 + i * 290;
      const c = this.add.container(x, 330);
      const glow = this.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(ELEMENT_COLOR[s.element] ?? 0xffffff).setScale(1.6).setAlpha(0).setName('glow');
      const card = this.add.image(0, 0, 'ui_monster_card_blank').setScale(0.62).setTint(0xb4b8bc);
      const key = 'starter_' + s.id;
      const art = this.add.image(0, -30, key);
      art.setScale(Math.min(170 / art.width, 128 / art.height));
      const nm = cardName(this, 0.62, s.name, 16);
      const el = label(this, 0, 150, CHOICE_LABEL[s.choice], 26, COLORS.cream, 4).setOrigin(0.5);
      const no = label(this, 0, 182, `No. ${s.number}  ·  ${s.element}`, 15, '#a8a090', 3).setOrigin(0.5);
      c.add([glow, card, art, nm, el, no, starRow(this, -1, 54, s.stars, 80, 18)]);
      c.setData('starter', s);
      c.setAlpha(0).setY(350);
      this.tweens.add({ targets: c, alpha: 1, y: 330, duration: 400, delay: i * 90, ease: 'Cubic.easeOut' });
      this.tweens.add({ targets: art, y: -35, duration: 1400 + i * 120, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.cards.push(c);
    });

    panel(this, 120, 560, W - 240, 120, 'blue');
    this.nameText = label(this, 150, 578, '', 22, COLORS.gold, 3);
    this.blurb = body(this, 150, 612, '', 22, COLORS.cream, W - 300);
    label(this, W - 130, H - 22, '←  →  choose     Z  select', 15, '#8f97a3', 3).setOrigin(1, 0.5);
    this.refresh();
    this.cameras.main.fadeIn(500);
  }

  private refresh() {
    this.cards.forEach((c, i) => {
      const on = i === this.sel;
      this.tweens.add({ targets: c, scale: on ? 1.06 : 0.94, duration: 160, ease: 'Sine.easeOut' });
      (c.getByName('glow') as Phaser.GameObjects.Image).setAlpha(on ? 0.35 : 0);
      c.setDepth(on ? 2 : 1);
    });
    const s = this.cards[this.sel].getData('starter');
    this.nameText.setText(`${s.name} — ${s.element}`);
    this.blurb.setText(s.guild_blurb);
  }

  private openConfirm() {
    const W = this.scale.width;
    const s = this.cards[this.sel].getData('starter');
    this.confirming = true;
    this.confirmSel = 0;
    const box = this.add.container(W / 2, 470).setDepth(10);
    const p = panel(this, -260, -46, 520, 92, 'parchment');
    const q = body(this, 0, -24, `Take the ${s.name}?`, 24, COLORS.ink).setOrigin(0.5).setStroke('#fff', 0).setShadow(0, 0, '#000', 0);
    const yes = label(this, -70, 16, 'Yes', 22, COLORS.ink, 0).setOrigin(0.5).setStroke('#fff4dc', 2);
    const no = label(this, 70, 16, 'No', 22, COLORS.ink, 0).setOrigin(0.5).setStroke('#fff4dc', 2);
    const cur = cursor(this, 'ui_cursor_diamond', 0.32, 4, 340);
    box.add([p, q, yes, no, cur]);
    box.setData('opts', [yes, no]).setData('cur', cur);
    this.confirmBox = box;
    this.refreshConfirm();
  }

  private refreshConfirm() {
    const opts = this.confirmBox!.getData('opts') as Phaser.GameObjects.Text[];
    opts.forEach((o, i) => o.setColor(i === this.confirmSel ? '#8a3a0a' : COLORS.ink));
    (this.confirmBox!.getData('cur') as Phaser.GameObjects.Container).setPosition(opts[this.confirmSel].x - 46, opts[this.confirmSel].y);
  }

  update() {
    if (this.done) return;
    const c = this.controls;
    const l = c.pressed('left');
    const r = c.pressed('right');
    const z = c.pressed('confirm');
    const x = c.pressed('cancel');
    if (this.confirming) {
      if (l || r) {
        this.confirmSel = 1 - this.confirmSel;
        Sound.move();
        this.refreshConfirm();
      }
      if (x || (z && this.confirmSel === 1)) {
        Sound.cancel();
        this.confirmBox?.destroy();
        this.confirming = false;
      } else if (z) {
        this.choose();
      }
      return;
    }
    if (l || r) {
      this.sel = (this.sel + (l ? this.cards.length - 1 : 1)) % this.cards.length;
      Sound.move();
      this.refresh();
    }
    if (z) {
      Sound.confirm();
      this.openConfirm();
    }
  }

  private choose() {
    this.done = true;
    const s = this.cards[this.sel].getData('starter');
    this.confirmBox?.destroy();
    Sound.save();
    const card = this.cards[this.sel];
    sparkleBurst(this, card.x, card.y - 40, 26, 20, 180);
    this.cards.forEach((c, i) => i !== this.sel && this.tweens.add({ targets: c, alpha: 0.15, duration: 500 }));
    this.tweens.add({ targets: card, scale: 1.18, duration: 700, ease: 'Sine.easeInOut' });
    this.time.delayedCall(1300, () => {
      this.cameras.main.fadeOut(500);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.stop();
        this.scene.resume('World', { starter: s.id });
        this.scene.get('World').events.emit('starterChosen', s.id);
      });
    });
  }
}
