import Phaser from 'phaser';
import { DIB_KITS } from './data/dibCreatures';
import { EXPANSION_NPC_SHEETS, EXPANSION_ROOMS } from './data/expansion';
import { MISSION_ROOMS } from './data/missions';
import { REGION_NPC_SHEETS, REGION_ROOMS } from './data/regions';

export const UI_SPRITES = [
  'arrow_down', 'arrow_up', 'banner_header', 'bar_empty', 'bar_orange', 'bar_red', 'btn_ff', 'btn_fff', 'btn_hex',
  'btn_info', 'btn_pause', 'btn_play', 'btn_x', 'candle_double', 'candle_small', 'candle_tall', 'card_flame',
  'card_outrage', 'card_tail', 'card_unknown', 'chain', 'chip_blue', 'crown', 'cursor_arrow', 'cursor_diamond',
  'frame_corner', 'frame_portrait', 'fx_silverring', 'fx_sparkle', 'fx_tornado', 'fx_waterring', 'med_bag',
  'med_book', 'med_gear', 'med_mercy', 'med_monster', 'med_scroll', 'minicard', 'monster_card', 'nameplate_bat',
  'orb_blood', 'orb_moss', 'orb_web', 'panel_blue', 'panel_green', 'panel_page', 'panel_parchment',
  'plaque_monsters', 'slot_round', 'soul', 'star', 'tab_bestiary', 'tab_crest', 'tab_party', 'tab_quests',
  'tab_trophy', 'tab_world', 'tag_blue', 'capture_normal', 'capture_silver', 'capture_gold',
];

export const ROOM_BGS = ['plaza', 'gate', 'outskirts', 'forest', 'mosswood', 'waystone', 'gate_talk', ...EXPANSION_ROOMS.map((r) => r.id), ...MISSION_ROOMS.map((r) => r.id), ...REGION_ROOMS.map((r) => r.id)];
export const NPC_SHEETS = [...new Set([...EXPANSION_NPC_SHEETS, ...REGION_NPC_SHEETS])];
// Original Dragon Island Blue sprites, unaltered (tools/fetch_dib_sprites.py).
export const MONSTER_ART = DIB_KITS.map((k) => k.id).filter((id) => id !== 'divine');
// Painted high-resolution art (the user's): drawn smooth, not as scaled-up pixels.
export const PAINTED_ART = new Set(['bloodgale', 'yamata', 'aethrion', 'inferno', 'flame']);

export function queueAll(load: Phaser.Loader.LoaderPlugin) {
  for (const k of UI_SPRITES) load.image('ui_' + k, `assets/ui/${k}.png`);
  load.image('logo', 'assets/ui/logo.webp');
  load.image('ui_monster_card_blank', 'assets/ui/monster_card_blank.png');
  // Room paintings are big (about 6 MB of GPU memory each): only the title's is loaded up front;
  // the rest load when their room is entered (see loadRoomArt) so phones are not overwhelmed.
  load.image('bg_plaza', 'assets/bg/plaza.jpg');
  for (const k of MONSTER_ART) load.image('mon_' + k, `assets/monsters/${k}.png`);
  load.image('mon_divine', 'assets/monsters/divine.webp');
  for (const id of ['fire_hatchling', 'gold_hatchling', 'spark_hatchling', 'water_hatchling']) {
    load.image('starter_' + id, `assets/starters/${id}.png`);
    load.image('starter_' + id + '_evo', `assets/starters/${id}_evo.png`);
  }
  load.image('world_map', 'assets/ui/world_map.png');
  load.spritesheet('hero_walk', 'assets/chars/hero_walk.png', { frameWidth: 128, frameHeight: 176 });
  load.spritesheet('wren_idle', 'assets/chars/wren_idle.png', { frameWidth: 128, frameHeight: 176 });
  load.spritesheet('guildmaster_idle', 'assets/chars/guildmaster_idle.png', { frameWidth: 128, frameHeight: 176 });
  load.image('guildmaster_portrait', 'assets/chars/guildmaster_portrait.webp');
  for (const k of NPC_SHEETS) {
    load.spritesheet(k + '_idle', `assets/chars/${k}_idle.png`, { frameWidth: 128, frameHeight: 176 });
    load.image(k + '_portrait', `assets/chars/${k}_portrait.webp`);
  }
  load.image('hero_portrait', 'assets/chars/hero_portrait.webp');
  load.image('wren_portrait', 'assets/chars/wren_portrait.webp');
}

/** Queue the paintings a scene needs and free the ones no longer in use. Call from a scene's preload(). */
export function loadRoomArt(scene: Phaser.Scene, keys: string[]) {
  const want = new Set(keys);
  for (const k of keys) if (!scene.textures.exists(k) && k.startsWith('bg_')) scene.load.image(k, `assets/bg/${k.slice(3)}.jpg`);
  scene.load.once('complete', () => {
    for (const k of scene.textures.getTextureKeys())
      if (k.startsWith('bg_') && k !== 'bg_plaza' && !want.has(k)) scene.textures.remove(k);
  });
}

/** Procedural helper textures: soft light, particles, vignette, bar fills. */
export function makeRuntimeTextures(scene: Phaser.Scene) {
  const tex = scene.textures;
  if (!tex.exists('glow')) {
    const c = tex.createCanvas('glow', 256, 256)!;
    const ctx = c.getContext();
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.14)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    c.refresh();
  }
  if (!tex.exists('dot')) {
    const c = tex.createCanvas('dot', 32, 32)!;
    const ctx = c.getContext();
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    c.refresh();
  }
  if (!tex.exists('vignette')) {
    const c = tex.createCanvas('vignette', 640, 360)!;
    const ctx = c.getContext();
    const g = ctx.createRadialGradient(320, 180, 120, 320, 180, 380);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.7, 'rgba(2,4,14,0.35)');
    g.addColorStop(1, 'rgba(2,4,14,0.85)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 640, 360);
    c.refresh();
  }
  if (!tex.exists('shadow')) {
    const c = tex.createCanvas('shadow', 128, 48)!;
    const ctx = c.getContext();
    const g = ctx.createRadialGradient(64, 24, 0, 64, 24, 64);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.save();
    ctx.scale(1, 0.375);
    ctx.fillRect(0, 0, 128, 128);
    ctx.restore();
    c.refresh();
  }
  if (!tex.exists('shard')) {
    const c = tex.createCanvas('shard', 24, 24)!;
    const ctx = c.getContext();
    ctx.fillStyle = '#ff5a6a';
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(22, 10);
    ctx.lineTo(9, 24);
    ctx.lineTo(2, 9);
    ctx.closePath();
    ctx.fill();
    c.refresh();
  }
  // Fill strips sampled from the interiors of the painted bars.
  for (const [key, inset] of [['ui_bar_red', [24, 13]], ['ui_bar_orange', [24, 14]]] as const) {
    const t = tex.get(key);
    if (!t.has('fill')) {
      const src = t.getSourceImage() as HTMLImageElement;
      const w = key === 'ui_bar_orange' ? 60 : src.width - inset[0] * 2;
      t.add('fill', 0, inset[0], inset[1], w, src.height - inset[1] * 2);
    }
  }
}
