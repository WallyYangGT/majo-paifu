// majojson 最小 reader —— 本仓的验收工具（Apache-2.0）
//
// 照 [规范](../../spec/majojson-replay-format.md) 从零实现，**不依赖任何原始实现**：
// 解析 majojson 文档 → 规范 §5.1 错误码判定 → §4 校验清单逐条落地 → 打印对局摘要。
// 这是「陌生人只凭文档即可实现」的自验口径：本文件能通过 examples/ 全量样例，
// 规范就是够用的；走不通的地方，先修规范。
//
// 运行（零 npm 依赖，Node ≥ 22.6 或 Deno）：
//   node --experimental-strip-types tools/minimal-reader/majo_reader.ts <examples 目录或文件...>
//
// 行为：
//   - 普通 .json/.jsonl：按 majojson 校验，全部通过则打印摘要；
//   - negative/ 目录：读 manifest.json，逐例断言命中期望错误码；
//   - 任一失败 → 进程退出码 1。

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// ---------- 错误码（规范 §5.1） ----------

type ErrorCode =
  | "too_large"
  | "bad_file"
  | "not_majo"
  | "bad_version"
  | "bad_shape"
  | "not_supported";

class MajoError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(`[${code}] ${message}`);
    this.code = code;
  }
}

const MAX_BYTES = 4 * 1024 * 1024; // 4MB，先于解析（§5.1 第 1 步）
const RULESETS = ["riichi", "mcr", "sichuan", "guangdong"] as const;
const PHASES = ["DINGQUE", "AWAIT_DISCARD", "CLAIM_WINDOW", "ROBBED_KAN_WINDOW", "ENDED"] as const;
const MELD_TYPES = ["CHI", "PON", "OPEN_KAN", "CONCEALED_KAN", "ADDED_KAN"] as const;
const WIN_SOURCES = [
  "SELF_DRAW", "DISCARD", "ROBBED_KAN", "KAN_REPLACEMENT", "LAST_TILE_WALL", "LAST_TILE_DISCARD",
] as const;

// ---------- 基础校验原语 ----------

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isBool = (v: unknown): v is boolean => typeof v === "boolean";
const isArr = (v: unknown): v is unknown[] => Array.isArray(v);

/** 牌码文法（§4）：普通 [1-9][mspz]、红五 0[msp]、花牌 [1-8]f */
const TILE = /^(?:[1-9][mspz]|0[msp]|[1-8]f)$/;
const roundWindOk = (v: unknown): boolean => isStr(v) && /^([1-4])z$/.test(v);

function tile(v: unknown, where: string): string {
  if (!isStr(v) || !TILE.test(v)) throw new MajoError("bad_shape", `${where}: 非法牌码 ${JSON.stringify(v)}`);
  return v;
}
function tileList(v: unknown, where: string): void {
  if (!isArr(v)) throw new MajoError("bad_shape", `${where}: 应为数组`);
  v.forEach((t, i) => tile(t, `${where}[${i}]`));
}

// ---------- 载荷校验（规范 §3/§4 + 附录 A） ----------

function checkMelds(melds: unknown, where: string): void {
  if (!isArr(melds)) throw new MajoError("bad_shape", `${where}.melds 应为数组`);
  melds.forEach((m, i) => {
    const w = `${where}.melds[${i}]`;
    if (!isObj(m)) throw new MajoError("bad_shape", `${w} 应为对象`);
    if (!isStr(m.type) || !(MELD_TYPES as readonly string[]).includes(m.type))
      throw new MajoError("bad_shape", `${w}.type 白名单外`);
    tileList(m.tiles, `${w}.tiles`);
    if (m.tiles.length < 3) throw new MajoError("bad_shape", `${w}.tiles 至少 3 张`);
    if (m.fromSeat !== undefined && m.fromSeat !== null && (!isInt(m.fromSeat) || m.fromSeat < 0 || m.fromSeat > 3))
      throw new MajoError("bad_shape", `${w}.fromSeat 值域`);
    if (m.claimedTile !== undefined && m.claimedTile !== null) tile(m.claimedTile, `${w}.claimedTile`);
  });
}

function checkFans(fans: unknown, where: string): void {
  if (!isArr(fans)) throw new MajoError("bad_shape", `${where}.fans 应为数组`);
  fans.forEach((f, i) => {
    const w = `${where}.fans[${i}]`;
    if (!isObj(f)) throw new MajoError("bad_shape", `${w} 应为对象`);
    if (!isStr(f.id)) throw new MajoError("bad_shape", `${w}.id 应为字符串`);
    if (!isInt(f.value) || f.value < 0) throw new MajoError("bad_shape", `${w}.value 值域`);
    if (!isInt(f.times)) throw new MajoError("bad_shape", `${w}.times 应为 int`);
  });
}

function checkWin(w: unknown, where: string): void {
  if (!isObj(w)) throw new MajoError("bad_shape", `${where} 应为对象`);
  if (!isInt(w.seat) || w.seat < 0 || w.seat > 3) throw new MajoError("bad_shape", `${where}.seat 值域`);
  if (!isInt(w.totalFan) || w.totalFan < 0) throw new MajoError("bad_shape", `${where}.totalFan 值域`);
  checkFans(w.fans, where);
  tileList(w.handTiles, `${where}.handTiles`);
  tile(w.winTile, `${where}.winTile`);
  if (w.fu !== undefined && w.fu !== null && (!isInt(w.fu) || w.fu < 0))
    throw new MajoError("bad_shape", `${where}.fu 值域`);
  if (w.maimaHorses !== undefined && w.maimaHorses !== null) tileList(w.maimaHorses, `${where}.maimaHorses`);
  if (w.maimaWinning !== undefined && w.maimaWinning !== null && !isInt(w.maimaWinning))
    throw new MajoError("bad_shape", `${where}.maimaWinning 应为 int`);
}

function checkSettlement(s: unknown, where: string): void {
  if (!isObj(s)) throw new MajoError("bad_shape", `${where} 应为对象`);
  if (!isStr(s.source) || !(WIN_SOURCES as readonly string[]).includes(s.source))
    throw new MajoError("bad_shape", `${where}.source 白名单外`);
  if (!isArr(s.winners) || s.winners.length === 0) throw new MajoError("bad_shape", `${where}.winners 非空数组`);
  s.winners.forEach((x, i) => checkWin(x, `${where}.winners[${i}]`));
  // deltas 是稀疏的：只含有分差变动的座位（分差守恒由玩法保证；日麻放铳/自摸恒两家、
  // 川麻血战出局者不产生收支——真实导出物证实，非定长四家）
  if (!isArr(s.deltas) || s.deltas.length === 0) throw new MajoError("bad_shape", `${where}.deltas 非空数组`);
  s.deltas.forEach((d, i) => {
    const w = `${where}.deltas[${i}]`;
    if (!isObj(d) || !isInt(d.seat) || d.seat < 0 || d.seat > 3 || !isInt(d.delta) || !isInt(d.score))
      throw new MajoError("bad_shape", `${w} 应为 {seat 0..3, delta, score}`);
  });
  if (s.discardBy !== undefined && s.discardBy !== null && (!isInt(s.discardBy) || s.discardBy < 0 || s.discardBy > 3))
    throw new MajoError("bad_shape", `${where}.discardBy 值域`);
  if (s.uraDoraIndicators !== undefined && s.uraDoraIndicators !== null)
    tileList(s.uraDoraIndicators, `${where}.uraDoraIndicators`);
}

function checkRyukyoku(r: unknown, where: string): void {
  if (!isObj(r)) throw new MajoError("bad_shape", `${where} 应为对象`);
  if (!isStr(r.reason) || r.reason.length === 0) throw new MajoError("bad_shape", `${where}.reason 应为非空字符串`);
  if (r.tenpaiSeats !== undefined && r.tenpaiSeats !== null) {
    if (!isArr(r.tenpaiSeats) || r.tenpaiSeats.some((s) => !isInt(s) || s < 0 || s > 3))
      throw new MajoError("bad_shape", `${where}.tenpaiSeats 值域`);
  }
  if (r.deltas !== undefined && r.deltas !== null) {
    if (!isArr(r.deltas) || r.deltas.length === 0) throw new MajoError("bad_shape", `${where}.deltas 非空数组（稀疏）`);
  }
  if (r.tenpai !== undefined && r.tenpai !== null) {
    if (!isArr(r.tenpai)) throw new MajoError("bad_shape", `${where}.tenpai 应为数组`);
    r.tenpai.forEach((t, i) => {
      const w = `${where}.tenpai[${i}]`;
      if (!isObj(t) || !isInt(t.seat) || t.seat < 0 || t.seat > 3) throw new MajoError("bad_shape", `${w} 值域`);
      checkFans(t, w);
    });
  }
}

function checkFrame(f: unknown, index: number, ruleset: string, wallSize: number | null): FrameSummary {
  const where = `frames[${index}]`;
  if (!isObj(f)) throw new MajoError("bad_shape", `${where} 应为对象`);
  if (!isInt(f.dealer) || f.dealer < 0 || f.dealer > 3) throw new MajoError("bad_shape", `${where}.dealer 值域`);
  if (!roundWindOk(f.roundWind)) throw new MajoError("bad_shape", `${where}.roundWind 应为 1z..4z`);
  if (!isStr(f.phase) || !(PHASES as readonly string[]).includes(f.phase))
    throw new MajoError("bad_shape", `${where}.phase 白名单外`);
  if (!isInt(f.turn) || f.turn < 0 || f.turn > 3) throw new MajoError("bad_shape", `${where}.turn 值域`);
  if (!isInt(f.wallRemaining) || f.wallRemaining < 0) throw new MajoError("bad_shape", `${where}.wallRemaining 值域`);
  if (f.handNumber !== undefined && f.handNumber !== null) {
    if (ruleset === "sichuan") throw new MajoError("bad_shape", `${where}.handNumber 川麻应为 null`);
    if (!isInt(f.handNumber) || f.handNumber < 1) throw new MajoError("bad_shape", `${where}.handNumber 值域`);
  }
  if (f.honba !== undefined && f.honba !== null && (!isInt(f.honba) || f.honba < 0))
    throw new MajoError("bad_shape", `${where}.honba 值域`);
  if (f.riichiSticks !== undefined && f.riichiSticks !== null && (!isInt(f.riichiSticks) || f.riichiSticks < 0))
    throw new MajoError("bad_shape", `${where}.riichiSticks 值域`);
  if (f.doraIndicators !== undefined && f.doraIndicators !== null)
    tileList(f.doraIndicators, `${where}.doraIndicators`);
  if (f.uraDoraIndicators !== undefined && f.uraDoraIndicators !== null)
    tileList(f.uraDoraIndicators, `${where}.uraDoraIndicators`);
  if (f.pendingDiscard !== undefined && f.pendingDiscard !== null) tile(f.pendingDiscard, `${where}.pendingDiscard`);
  if (f.pendingDiscardBy !== undefined && f.pendingDiscardBy !== null &&
      (!isInt(f.pendingDiscardBy) || f.pendingDiscardBy < 0 || f.pendingDiscardBy > 3))
    throw new MajoError("bad_shape", `${where}.pendingDiscardBy 值域`);
  if (f.lastAction !== undefined && f.lastAction !== null && !isStr(f.lastAction))
    throw new MajoError("bad_shape", `${where}.lastAction 应为字符串`);
  if (f.laiziIndicator !== undefined && f.laiziIndicator !== null) tile(f.laiziIndicator, `${where}.laiziIndicator`);
  if (f.laiziKind !== undefined && f.laiziKind !== null && !isStr(f.laiziKind))
    throw new MajoError("bad_shape", `${where}.laiziKind 应为字符串`);

  // seats：长度 4 且 seats[i].seat == i（§4 建议消费方强制）
  if (!isArr(f.seats) || f.seats.length !== 4) throw new MajoError("bad_shape", `${where}.seats 应为长度 4`);
  f.seats.forEach((s, i) => {
    const w = `${where}.seats[${i}]`;
    if (!isObj(s)) throw new MajoError("bad_shape", `${w} 应为对象`);
    if (!isInt(s.seat) || s.seat !== i) throw new MajoError("bad_shape", `${w}.seat 必须 == 下标 ${i}`);
    if (!isStr(s.nickname)) throw new MajoError("bad_shape", `${w}.nickname 应为字符串`);
    if (!("concealed" in s) || !isArr(s.concealed)) throw new MajoError("bad_shape", `${w}.concealed 必须存在且为数组`);
    tileList(s.concealed, `${w}.concealed`);
    checkMelds(s.melds, w);
    if (!isArr(s.flowers)) throw new MajoError("bad_shape", `${w}.flowers 应为数组`);
    tileList(s.flowers, `${w}.flowers`);
    if (!isArr(s.river)) throw new MajoError("bad_shape", `${w}.river 应为数组`);
    tileList(s.river, `${w}.river`);
    if (!isInt(s.score)) throw new MajoError("bad_shape", `${w}.score 应为 int`);
    if (!isBool(s.active)) throw new MajoError("bad_shape", `${w}.active 必须存在且为 boolean`);
    if (s.riichi !== undefined && s.riichi !== null && !isBool(s.riichi))
      throw new MajoError("bad_shape", `${w}.riichi 应为 boolean`);
    if (s.dingque !== undefined && s.dingque !== null &&
        (!isStr(s.dingque) || !["m", "p", "s"].includes(s.dingque)))
      throw new MajoError("bad_shape", `${w}.dingque 应为 m/p/s`);
  });

  // 牌墙三者一致性（§4 载荷级上界；wall 尺寸由首帧取用方传入）
  if (wallSize !== null && f.wallRemaining > wallSize)
    throw new MajoError("bad_shape", `${where}.wallRemaining 超出墙尺寸`);
  return { dealer: f.dealer, phase: f.phase, wallRemaining: f.wallRemaining };
}

interface FrameSummary { dealer: number; phase: string; wallRemaining: number; }

interface HandSummary {
  ruleset: string;
  format: 1 | 2;
  seed: number | null;
  handSeq: number;
  dealerRotation: number;
  frames: number;
  wins: number;
  ryukyoku: string | null;
  hasTenhou: boolean;
}

function checkMeta(meta: unknown, where: string): { handSeq: number; dealerRotation: number; seed: number | null } {
  if (!isObj(meta)) throw new MajoError("bad_shape", `${where} 应为对象`);
  if (!isInt(meta.handSeq) || meta.handSeq < 1) throw new MajoError("bad_shape", `${where}.handSeq 值域`);
  if (!isInt(meta.dealerRotation) || meta.dealerRotation < 0)
    throw new MajoError("bad_shape", `${where}.dealerRotation 值域`);
  if (!isInt(meta.endedAt)) throw new MajoError("bad_shape", `${where}.endedAt 应为 epoch ms`);
  if (!isStr(meta.room)) throw new MajoError("bad_shape", `${where}.room 应为字符串`);
  if (meta.seed !== undefined && meta.seed !== null && !isInt(meta.seed))
    throw new MajoError("bad_shape", `${where}.seed 应为 long 或 null`);
  return { handSeq: meta.handSeq, dealerRotation: meta.dealerRotation, seed: (meta.seed as number | null) ?? null };
}

function checkOptions(options: unknown, where: string): void {
  if (options === undefined || options === null) return;
  if (!isObj(options)) throw new MajoError("bad_shape", `${where} 应为对象或缺省`);
  const ints: Array<[string, number | null]> = [["mcrFanCap", null], ["sichuanFanCap", null]];
  for (const [k] of ints) {
    if (options[k] !== undefined && options[k] !== null && (!isInt(options[k]) || options[k] < 0))
      throw new MajoError("bad_shape", `${where}.${k} 值域`);
  }
  for (const k of ["riichiNagashiMangan", "guangdongMaima"]) {
    if (options[k] !== undefined && options[k] !== null && !isBool(options[k]))
      throw new MajoError("bad_shape", `${where}.${k} 应为 boolean`);
  }
  if (options.guangdongLaiziSource !== undefined && options.guangdongLaiziSource !== null &&
      (!isStr(options.guangdongLaiziSource) || !["flip", "hongzhong"].includes(options.guangdongLaiziSource)))
    throw new MajoError("bad_shape", `${where}.guangdongLaiziSource 应为 flip/hongzhong`);
  if (options.matchLength !== undefined && options.matchLength !== null &&
      (!isStr(options.matchLength) || !["tonpu", "half", "full", "infinite"].includes(options.matchLength)))
    throw new MajoError("bad_shape", `${where}.matchLength 应为 tonpu/half/full/infinite`);
}

/** 校验一手载荷（meta + replay），返回摘要（§3.2/§3.3/§4）。 */
function checkHand(hand: unknown, ruleset: string, where: string): HandSummary {
  if (!isObj(hand)) throw new MajoError("bad_shape", `${where} 应为对象`);
  const meta = checkMeta(hand.meta, `${where}.meta`);
  const replay = hand.replay;
  if (!isObj(replay)) throw new MajoError("bad_shape", `${where}.replay 应为对象`);
  if (!isInt(replay.handNumber)) throw new MajoError("bad_shape", `${where}.replay.handNumber 应为 int`);
  if (replay.ruleSet !== ruleset)
    throw new MajoError("bad_shape", `${where}.replay.ruleSet 应与玩法声明一致`);
  if (!isArr(replay.frames) || replay.frames.length === 0)
    throw new MajoError("bad_shape", `${where}.replay.frames 非空数组`);
  if (replay.frames.length > 1000) throw new MajoError("bad_shape", `${where}.replay.frames 超上界 1000`);
  if (!isArr(replay.wins)) throw new MajoError("bad_shape", `${where}.replay.wins 应为数组（可为空不可缺）`);

  // 载荷级上界 + wall 三者一致性（§4）：wall/deadSize/drawPositions
  let wallSize: number | null = null;
  if (replay.wall !== undefined && replay.wall !== null) {
    if (!isArr(replay.wall) || replay.wall.length === 0) throw new MajoError("bad_shape", `${where}.wall 非空数组`);
    replay.wall.forEach((t, i) => tile(t, `${where}.wall[${i}]`));
    wallSize = replay.wall.length;
    const deadSize = replay.deadSize;
    if (!isInt(deadSize) || deadSize < 0 || deadSize > wallSize)
      throw new MajoError("bad_shape", `${where}.deadSize 值域`);
    if (replay.drawPositions !== undefined && replay.drawPositions !== null) {
      if (!isArr(replay.drawPositions)) throw new MajoError("bad_shape", `${where}.drawPositions 应为数组`);
      // drawPositions 是已消耗位置日志：值域 [0, wallSize) 且不超长（长度随对局增长，与墙定长恒不相等）
      replay.drawPositions.forEach((p, i) => {
        if (!isInt(p) || p < 0 || p >= wallSize!)
          throw new MajoError("bad_shape", `${where}.drawPositions[${i}] 值域越界`);
      });
      if (replay.drawPositions.length > wallSize)
        throw new MajoError("bad_shape", `${where}.drawPositions 超长`);
    }
  } else if (replay.deadSize !== undefined && replay.deadSize !== null) {
    throw new MajoError("bad_shape", `${where}.deadSize 与 wall 同生存`);
  }

  const frames = replay.frames.map((f, i) => checkFrame(f, i, ruleset, wallSize));
  replay.wins.forEach((s: unknown, i: number) => checkSettlement(s, `${where}.replay.wins[${i}]`));
  const ryukyoku = replay.ryukyoku;
  if (ryukyoku !== undefined && ryukyoku !== null) checkRyukyoku(ryukyoku, `${where}.replay.ryukyoku`);

  return {
    ruleset,
    format: 1,
    seed: meta.seed,
    handSeq: meta.handSeq,
    dealerRotation: meta.dealerRotation,
    frames: frames.length,
    wins: (replay.wins as unknown[]).length,
    ryukyoku: ryukyoku && isObj(ryukyoku) && isStr(ryukyoku.reason) ? ryukyoku.reason : null,
    hasTenhou: false,
  };
}

// ---------- 文档级解析（§5.1 步骤与错误码） ----------

function parseMajojson(text: string): HandSummary {
  // 步骤 1：大小检查（先于解析）
  if (text.length > MAX_BYTES) throw new MajoError("too_large", `原始文本超过 4MB`);
  // 步骤 2：JSON 解析
  let root: unknown;
  try {
    root = JSON.parse(text.replace(/^\uFEFF/, "")); // BOM 剥离
  } catch {
    throw new MajoError("bad_file", "JSON 解析失败");
  }
  if (!isObj(root)) throw new MajoError("bad_file", "顶层应为 JSON 对象");
  // 步骤 3：majo 键判定
  if (!("majo" in root)) {
    if ("log" in root && "rule" in root) throw new MajoError("not_majo", "这是天凤牌谱，不是 majojson");
    throw new MajoError("bad_file", "无 majo 键");
  }
  const majo = root.majo;
  if (!isObj(majo)) throw new MajoError("bad_shape", "majo 应为对象");
  // 步骤 4：版本
  const format = majo.format;
  if (!isInt(format) || format < 1) throw new MajoError("bad_shape", "format 非法");
  if (format > 2) throw new MajoError("bad_version", `format ${format} 高于支持的最高版本 2`);
  // 步骤 5/6：玩法与形状
  const ruleset = majo.ruleset;
  if (!isStr(ruleset)) throw new MajoError("bad_shape", "ruleset 应为字符串");
  if (!(RULESETS as readonly string[]).includes(ruleset))
    throw new MajoError("not_supported", `ruleset ${ruleset} 不在四玩法白名单`);
  checkOptions(majo.options, "majo.options");
  const hasTenhou = "log" in root;

  if (format === 1) {
    if ("hands" in majo) throw new MajoError("bad_shape", "format 1 不应携带 hands");
    const summary = checkHand(majo, ruleset, "majo");
    return { ...summary, format: 1, hasTenhou };
  }
  // format 2：整局容器（§8）——fail-closed，全有或全无
  if (!("meta" in majo) && !("replay" in majo)) {
    const hands = majo.hands;
    if (!isArr(hands) || hands.length === 0) throw new MajoError("bad_shape", "hands 非空数组");
    if (hands.length > 40) throw new MajoError("bad_shape", "hands 超上界 40");
    let last: HandSummary | null = null;
    hands.forEach((h, i) => {
      last = checkHand(h, ruleset, `majo.hands[${i}]`);
    });
    return {
      ...(last as HandSummary),
      format: 2,
      frames: hands.length,
      hasTenhou,
    };
  }
  throw new MajoError("bad_shape", "format 2 应为 hands 容器形态");
}

// ---------- mjai JSONL 轻校验（§8.4：已知事件集 + 首尾事件） ----------

const MJAI_TYPES = new Set([
  "start_game", "start_kyoku", "tsumo", "dahai", "reach", "reach_accepted",
  "chi", "pon", "daiminkan", "ankan", "kakan", "dora", "hora", "ryukyoku",
  "end_kyoku", "end_game",
]);
const MJAI_PAI = /^(?:[1-9][mps]|5[mps]r|[ESWNPFC])$/;

function parseMjai(text: string): string {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) throw new MajoError("bad_file", "空 JSONL");
  const types: string[] = [];
  lines.forEach((line, i) => {
    let ev: unknown;
    try {
      ev = JSON.parse(line);
    } catch {
      throw new MajoError("bad_file", `第 ${i + 1} 行 JSON 解析失败`);
    }
    if (!isObj(ev) || !isStr(ev.type) || !MJAI_TYPES.has(ev.type))
      throw new MajoError("bad_shape", `第 ${i + 1} 行事件类型未知`);
    // 牌码字段轻校验（出现即查）
    for (const k of ["pai", "dora_marker"]) {
      if (ev[k] !== undefined && !MJAI_PAI.test(ev[k] as string))
        throw new MajoError("bad_shape", `第 ${i + 1} 行 ${k} 牌码非法`);
    }
    if (ev.type === "start_kyoku" && isObj(ev.tehais)) {
      // tehais 在 JSONL 里是数组的数组
      if (!isArr(ev.tehais) || ev.tehais.length !== 4)
        throw new MajoError("bad_shape", `第 ${i + 1} 行 tehais 应为 4 家`);
      ev.tehais.forEach((th: unknown, s: number) => {
        if (!isArr(th) || th.length !== 13)
          throw new MajoError("bad_shape", `第 ${i + 1} 行 tehais[${s}] 应为 13 张`);
        th.forEach((t) => {
          if (!isStr(t) || !MJAI_PAI.test(t))
            throw new MajoError("bad_shape", `第 ${i + 1} 行起手牌码非法`);
        });
      });
    }
    types.push(ev.type);
  });
  if (types[0] !== "start_game") throw new MajoError("bad_shape", "首事件应为 start_game");
  if (types[types.length - 1] !== "end_game") throw new MajoError("bad_shape", "末事件应为 end_game");
  return `mjai events=${types.length} kyoku=${types.filter((t) => t === "start_kyoku").length} ` +
    `hora=${types.filter((t) => t === "hora").length} ryukyoku=${types.filter((t) => t === "ryukyoku").length}`;
}

// ---------- 主流程 ----------

interface Outcome { file: string; ok: boolean; detail: string; }

function processFile(path: string, rel: string): Outcome {
  try {
    const text = readFileSync(path, "utf-8");
    if (rel.endsWith(".jsonl")) {
      return { file: rel, ok: true, detail: parseMjai(text) };
    }
    const s = parseMajojson(text);
    const bits = [
      `${s.ruleset} format${s.format}`,
      s.format === 2 ? `hands=${s.frames}` : `frames=${s.frames}`,
      `wins=${s.wins}`,
      s.ryukyoku ? `ryukyoku=${s.ryukyoku}` : null,
      `seed=${s.seed === null ? "null" : s.seed}`,
      s.hasTenhou ? "tenhou=yes" : "tenhou=no",
    ].filter(Boolean);
    return { file: rel, ok: true, detail: bits.join(" ") };
  } catch (e) {
    return { file: rel, ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (name.endsWith(".json") || name.endsWith(".jsonl")) yield p;
  }
}

function main(): number {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("用法: node --experimental-strip-types majo_reader.ts <examples 目录或文件...>");
    return 2;
  }
  const outcomes: Outcome[] = [];
  const files: string[] = [];
  let negativeManifest: { dir: string; cases: Array<{ file: string; expect: string }> } | null = null;
  for (const a of args) {
    if (statSync(a).isDirectory()) {
      const manifestPath = join(a, "negative", "manifest.json");
      let hasNegative = false;
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
          cases: Array<{ file: string; expect: string }>;
        };
        negativeManifest = { dir: join(a, "negative"), cases: manifest.cases };
        hasNegative = true;
      } catch { /* 无负例目录 */ }
      for (const f of walk(a)) {
        if (hasNegative && f.startsWith(join(a, "negative"))) continue; // 负例走 manifest 断言
        files.push(f);
      }
    } else files.push(a);
  }
  for (const f of files) outcomes.push(processFile(f, relative(".", f)));

  // 负例断言（manifest 驱动）
  let negTotal = 0;
  let negOk = 0;
  if (negativeManifest !== null) {
    for (const c of negativeManifest.cases) {
      negTotal++;
      const r = processFile(join(negativeManifest.dir, c.file), `negative/${c.file}`);
      const got = r.ok ? "未被拒收" : (r.detail.match(/^\[(\w+)\]/)?.[1] ?? "?");
      const pass = !r.ok && got === c.expect;
      if (pass) negOk++;
      outcomes.push({
        file: `negative/${c.file}`,
        ok: pass,
        detail: pass ? `NEG ✓ 命中期望错误码 ${c.expect}` : `期望 ${c.expect}，实际 ${got} — ${r.detail}`,
      });
    }
  }

  let fail = 0;
  let posOk = 0;
  let posTotal = 0;
  for (const o of outcomes) {
    if (o.file.startsWith("negative")) continue;
    posTotal++;
    if (o.ok) posOk++;
  }
  fail = outcomes.length - posOk - negOk;
  for (const o of outcomes) {
    if (!o.ok) console.log(`FAIL ${o.file}  ${o.detail}`);
    else console.log(`OK   ${o.file}  ${o.detail}`);
  }
  console.log(`\nSUMMARY: 正例 ${posOk}/${posTotal} 通过，负例 ${negOk}/${negTotal} 命中，失败 ${fail}`);
  return fail === 0 ? 0 : 1;
}

process.exit(main());
