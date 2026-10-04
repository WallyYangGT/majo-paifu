# majojson 牌谱格式规范

> **Majo 牌谱 JSON（`majojson`）**——「麻将面对面」（Mahjong Face to Face）使用的牌谱开放格式：
> 一个自足的 JSON 文档，完整记录一手（或整局多手）麻将的逐帧状态、结算与牌墙，四玩法统一。
> 本文是该格式的**权威公开规范**（产品中立版）：只面向「生成方 / 消费方」陈述义务，不依赖任何特定实现。
> 天凤互操作知识（天凤段、牌码、座位旋转、目验方法）独立成文：[`interop/tenhou-interop.md`](../interop/tenhou-interop.md)。
> 完整可运行的样例见 [`examples/`](../examples/)。
>
> 适用格式版本：`majo.format` 1（单手）与 2（整局多手容器）。
> 格式演进流程：先在实现侧修订，再单向同步到本规范（见附录 C）。

---

## 0. 范围与命名

| | 内容 |
| --- | --- |
| 格式名 | **Majo 牌谱 JSON**（内部标识 `majojson`，版本 `majo.format`） |
| 扩展名 | `.json`（四玩法统一；整局容器与单手同名法）；mjai 产物 `.jsonl`（§8.4，独立文件） |
| 文件名 | `majo-<ruleset>-<handSeq>-<yyyyMMdd-HHmm>.json`（`ruleset` ∈ `riichi/mcr/sichuan/guangdong`；纯 ASCII） |
| MIME | `application/json`（保存/传输时按参数传递，不得硬编码为其它类型） |
| 编码 | UTF-8，无 BOM；建议 2 空格缩进、`log`/`frames` 数组**每元素一行**（可 diff、可 grep） |
| 粒度 | **一个文件 = 一手**（format 1）；整局多手容器 = format 2（§8）；mjai 产物 = JSONL（`majo-<ruleset>-mjai-<首手seq>-<yyyyMMdd-HHmm>.jsonl`，仅日麻整局级） |

**三段内容与定位**：

| 段 | 出现条件 | 地位 | 谁读 |
| --- | --- | --- | --- |
| `majo` | **必需**（四玩法都带） | **唯一权威**（导入只解析它） | 生成方与消费方 |
| `title`/`name`/`rule`/`log` | 仅日麻、且仅"手牌完整（`seed != null`）的本机对局"导出 | 互操作视图（派生，可缺失；其中 `log` 是硬必需、`name`/`rule` 是 AI 复盘工具的硬必需） | 天凤官方查看器（`tenhou.net/5#json=`）、官方编辑器（`/6`）、`mjai-reviewer` 等 |

**为什么是"超集"而不是两个格式**：天凤查看器只读 `title`/`name`/`rule`/`log` 四键、**未知键静默忽略**
（实测其加载器只取 `f.log`，其余键不校验）；`mjai-reviewer` 的输入解析同样容忍未知字段。
所以 `majo` 段对它们无害——**一份文件既能被 majojson 消费方无损导入，也能在天凤里打开看**。

---

## 1. 设计原则（铁律）

1. **`majo` 段是唯一权威**：导入只解析它；天凤段是给人/给外部工具看的派生视图，导入**不消费**。
2. **不做冗余事件视图**：帧载荷已含全部信息。日麻的"可读 + 可互操作"由天凤段承担；三种非日麻玩法
   目前没有任何第三方消费者，不需要事件视图。
3. **天凤段必须严格合法**。它是这些工具"安静地出错"的地方：
   - 每手数组必须**恰好 17 个元素**：`/6` 编辑器判 `17 == f.length` 才导入该手，否则**静默跳过那一手**；
     `/5` 查看器会补空数组继续渲染（多余元素忽略）；`mjai-reviewer` 则是**整个文件**解析失败；
   - 副露字符串必须匹配官方正则（`^(\d\d)?(\d\d)?(\d\d)?([pmkac])(\d\d)(\d\d)?(\d\d)?(\d\d)?$`），
     否则查看器抛**未捕获异常**（它的 try/catch 只包了 `JSON.parse`）；
   - 各家起手必须**恰好 13 张**（庄家第 14 张进"取"数组）。
   → 因此日麻导出的验收硬项是"**用 `tenhou.net/5#json=` 真打开一次**"（目验方法见互操作文档 §6）。
4. **天凤段只在"手牌完整、可直采事件"时产出**：它要求这一手是从**发牌开始**记录的（`seed != null`）。
   两种情况**不产天凤段**（宁可少一段，不给误导内容）：
   ① **导入的牌谱重导出**——不是"派生不了"（原样拷贝是可以的），而是**不复制未经验证的第三方内容**，
   也避免同一手出现两份可能互相矛盾的表示；
   ② **崩溃恢复局**（`seed == null`，帧 0 是中局快照，没有起手与更早的事件，
   拼出来的 `log` 起手也不是 13 张，语义上是伪造的一手）。
5. **牌码用本格式自有口径**（`0m/0p/0s` 红五、`1f..8f` 花牌，§4），本格式**不引入天凤牌号**；
   天凤牌码只在天凤段内部使用（互操作文档）。
6. **一切可推导的不存**（番种名、累计分、门风、座位方位……），由消费方照旧推导渲染。
7. **版本演进**：`majo.format` 破坏性变更才 +1，新增**可选**字段不 +1（§7）。

---

## 2. 顶层结构

```json
{
  "majo": {
    "format": 1, "app": "1.0.0", "ruleset": "riichi",
    "options": { "riichiNagashiMangan": true },
    "meta": { "handSeq": 5, "dealerRotation": 4, "endedAt": 1758770000000, "room": "", "seed": 1758770000 },
    "replay": {
      "handNumber": 5, "ruleSet": "riichi",
      "frames": [ … ], "wins": [ … ], "ryukyoku": null,
      "wall": [ … ], "deadSize": 14, "drawPositions": [ … ]
    }
  },
  "title": ["Majo", "日麻"],
  "name": ["东家", "南家", "西家", "北家"],
  "rule": { "disp": "Majo 南喰赤", "aka": 1 },
  "log": [ [ [4,0,0], [25000,25000,25000,25000], [ … ], [ … ], … , [ … ] ] ]
}
```

| 键 | 必需 | 说明 |
| --- | --- | --- |
| `majo` | ✓ | 见 §3 |
| `title` / `name` / `rule` / `log` | 仅日麻本机导出 | 见互操作文档 |
| 其它键 | — | **忽略**（消费方必须容忍未知顶层键；生成方可依赖这一点做前向兼容，但扩展键一律放 `majo` 段内，§7） |

---

## 3. `majo` 段

### 3.1 顶层字段

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `format` | int | ✓ | 格式版本，现行 `1`（单手）/ `2`（整局容器，§8） |
| `app` | string | ✓ | 导出方应用版本（如 `1.0.0`），诊断用；往返幂等判定豁免本字段（§6.2） |
| `ruleset` | string | ✓ | `riichi`/`mcr`/`sichuan`/`guangdong` |
| `options` | object? | — | 规则开关，字段见附录 A.4；缺省 = 玩法默认基线 |
| `meta` | object | ✓ | 见 3.2 |
| `replay` | object | ✓ | 载荷，见 3.3（字段参考附录 A） |

### 3.2 `meta`

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `handSeq` | int | ✓ | **房间内手序号**（1 起） |
| `dealerRotation` | int | ✓ | 局序 = 圈序×4 + 局内序（东一 = 0），与天凤 `kyoku_num`、mjlog `INIT.seed` 首值同口径。**盘面局名取 `dealerRotation % 4 + 1`**。**川麻无圈风概念、换庄从不推进该计数 → 川麻文件里该字段恒 `0`**，消费方按玩法忽略（对川麻按"无局数"处理；不引入 -1 之类的占位值） |
| `endedAt` | long | ✓ | 该手结束时间（epoch ms） |
| `room` | string | ✓ | 房间 id（仅诊断，可空串） |
| `seed` | long? | — | 开手随机数种子；崩溃恢复局为 null。有它才能复算牌墙，也是天凤段必需（天凤 `log` 本身不含牌山） |

### 3.3 `replay`（载荷）

字段与附录 A.1 `ReplayDataPayload` **同形**：

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `handNumber` | int | ✓ | 房间内手序号（= `meta.handSeq`）。⚠ **与 `frames[].handNumber` 不是一回事**：帧内那个是"本圈内第几局"（川麻为 null，见附录 A.2） |
| `ruleSet` | string | ✓ | 玩法 id（= `ruleset`） |
| `frames` | array | ✓ | `ReplayFrame` 数组（非空；必需字段见 §4） |
| `wins` | array | ✓ | `HandSettlement` 数组（可为空数组，不可缺） |
| `ryukyoku` | object? | — | `ReplayRyukyoku`，流局手携带 |
| `wall` | array? | — | 完整原始牌墙牌码（摸牌顺序，含王牌）；崩溃恢复局为 null |
| `deadSize` | int? | — | 王牌张数（日麻 14，其余 0）；与 `wall` 通常同生存，但**消费方必须容忍其单独存在**（同 `drawPositions` 口径） |
| `drawPositions` | array? | — | 「按位查看牌墙」的已消耗位置日志；与 `wall` 通常同生存，但**消费方必须容忍 `wall` 缺席或为 null 时单独携带**（不得拒收）——[`examples/`](../examples/) 的川麻整局样例（`sichuan/majo-sichuan-match-*.json`）即「有 `drawPositions`、无 `wall`」形态 |

### 3.4 实现注意（生成方与消费方共用）

- **严格解码**：载荷的必需字段都应按**非空**对待——解析时不要依赖"缺字段回落默认值"，
  缺了就按 `bad_shape` 拒绝（§5）。未知键**忽略**（前向兼容）。
- **逐条落地 §4**：解码通过只说明"形状对"，表里剩余的取值约束（帧数、取值白名单、牌码文法、
  `seats[i].seat == i` 等）必须逐条实现——**不要出现"§4 表里写了、校验里没做"**。
- **顺序**：先按大小拒绝（§5 第 1 步），再解码。

---

## 4. 载荷帧的必需字段（校验清单）

本清单是消费方校验的**最低完备集**；生成方必须保证产物通过全部条目。
消费方可以另设更严的防线（帧数上界、体积上界等），但不得放宽。

| 层级 | 必需字段 | 取值约束 |
| --- | --- | --- |
| 帧 | `dealer` | 0..3 |
| | `roundWind` | 字牌码 `1z`..`4z` |
| | `phase` | `DINGQUE`/`AWAIT_DISCARD`/`CLAIM_WINDOW`/`ROBBED_KAN_WINDOW`/`ENDED` |
| | `turn` | 0..3 |
| | `wallRemaining` | ≥ 0 |
| | `seats` | **长度 4 且 `seats[i].seat == i`**（建议消费方强制；缺座位条目时至少不得崩溃） |
| 座位 | `seat` / `nickname` | — |
| | `concealed` / `melds` / `flowers` / `river` | 数组（**`concealed` 必须存在**——消费方普遍取其长度做手牌数渲染） |
| | `score` | int |
| | `active` | boolean（**必须存在**——缺失会被普遍误解为"已胡/出局"） |
| 副露 | `type` / `tiles` | `type` ∈ `CHI`/`PON`/`OPEN_KAN`/`CONCEALED_KAN`/`ADDED_KAN` |
| 可选 | `doraIndicators`/`uraDoraIndicators`/`honba`/`riichiSticks`/`laiziKind`/`laiziIndicator`/`pendingDiscard`/`pendingDiscardBy`/`lastAction`/`handNumber` | 按玩法填充，缺失 = null（安全） |
| 载荷级上界 | `frames.length`；`wall` 三者一致性 | `frames` ≤ 1000（真实一手至多几百帧，纯纵深防御，4MB 体积上限之外的又一道）；`wall` 非空时 `deadSize ≤ wall.size` 且 `drawPositions` 值域 ∈ [0, wall.size) 且 `drawPositions.size ≤ wall.size`（**`drawPositions` 是已消耗位置日志、长度随对局增长，与完整墙定长恒不相等**；不检会让"按位查看牌墙"静默渲染出错墙） |

**牌码文法**：普通 `[1-9][mspz]`、红五 `0[msp]`、花牌 `[1-8]f`。

---

## 5. 解析策略（导入）

### 5.1 步骤与错误码

1. **大小检查**：原始文本 > 4MB → `too_large`（先于解析）。
2. `JSON.parse` 失败 → `bad_file`。
3. **无 `majo` 键**：若同时有 `log` + `rule`（像天凤牌谱）→ `not_majo`（这是天凤牌谱，不是 majojson）；
   否则 `bad_file`。
4. `majo.format` 高于支持的版本 → `bad_version`。
5. `majo.replay` 严格解码 + §4 语义检查失败 → `bad_shape`（format 2 容器同理，见 §8.2）。
6. `ruleset` 不在四玩法内 → `not_supported`。

   > **分派序注**：第 5/6 步的先后属于实现自由。参考实现与本仓最小 reader 都**先做玩法白名单、
   > 后做载荷解码**——「既非四玩法、又结构畸形」的双坏文件返回 `not_supported` 而非 `bad_shape`；
   > 单坏文件两种次序结果相同。消费方断言错误码时以「单坏」用例为准（本仓负例语料亦全部为单坏）。

消费方的落盘/登记策略（先写盘再登记列表等）属于实现自由，不属于格式规范；
但错误必须如实呈现给用户，不得留下"列表有、文件无"的幽灵条目。

### 5.2 天凤段完全不参与导入

它错不错都不影响数据正确性（这正是"两段隔离"的收益）：即使某个第三方工具产出的天凤段不合法，
majojson 的导入/回放仍完好。

---

## 6. 往返不变式（导入后必须成立）

1. `majo.replay` 的 `frames/wins/ryukyoku/wall/deadSize/drawPositions` **逐字段相等**（导出→导入→导出幂等）；
   注意区分两个 `handNumber`（§3.3）。
2. 导入后再次导出的 `majo` 段**逐字段相等**（`app` 除外——它是"导出方应用版本"，跨版本重导必然变）。
   **天凤段不产出**（§1 铁律 4）→ "往返幂等"的判定以 `majo` 段为准。
3. 导入的帧序列应能让消费方的回放渲染**全帧进行不抛异常**。

---

## 7. 版本演进规则

- `majo.format` 递增判据：**载荷结构有破坏性变更**（字段改名/删除/语义变化）；新增**可选**字段不递增。
  `1` = 单手文件（§2/§3）、`2` = 整局多手容器（§8，**新形态而非可选字段追加**——`meta`/`replay`
  变成 `hands` 数组，旧版解码必失败，按 §5.1 既有顺序在严格解码前即拒）。
- 天凤段的形态变化不递增本格式版本（它是派生视图）。
- 旧版本读到更高 `majo.format` → 拒收并提示"牌谱版本过新，请升级应用"（`bad_version`）。
- 新增扩展键一律放 `majo` 段内（**不要**往顶层加键）：`majo` 是私有命名空间，顶层留给天凤及其他工具。

---

## 8. 整局多手容器（format 2）

### 8.1 动机与形态

半庄/一圈由 8~16+ 手组成，单手文件在天凤查看器一次只能看一手（`log` 数组多手是官方原生形态）。
整局容器把同一对局的多手打包：

```json
{
  "majo": {
    "format": 2, "app": "1.0.0", "ruleset": "riichi", "options": { … },
    "hands": [ { "meta": { … }, "replay": { … } }, … ]
  },
  "title": ["Majo", "日麻"], "name": [ … ], "rule": { … },
  "log": [ 手17元素, 手17元素, … ]
}
```

- `hands[]` 每项与单手文件的 `meta`/`replay` **完全同形**（§3.2/§3.3），按**整局内序**（1 起）排列；
  `ruleset`/`options` 提升到容器级（一手一玩法声明，容器是唯一玩法权威）；
- 单手文件（format 1）**完全不变**；
- 顶层四键（天凤段）与单手形态同一条件（仅日麻、仅本机完整手），`log` 数组**按局序放多手**——
  `tenhou.net/5#json=` 一次打开完整半庄；`name`/`rule` 必须逐手一致（日麻"庄家=(起家+换庄数)%4"
  不变量下座位旋转恒一致；不一致（理论不可达）→ 宁缺整段不附）。

### 8.2 校验（fail-closed，全有或全无）

`hands` 非空且 ≤ 40（纵深防御：半庄至多 16 手起含连庄余量）；每手过 §4 全量检查（含每手帧数
≤1000——已隐含总量上界）；每手 `replay.ruleSet` == 容器 `ruleset`。**任一手不合格 → 整文件
`bad_shape`**（不允许"导入能放的前几手"）；载荷总量由 4MB 体积防线兜住。

### 8.3 导入与回放

- format 2 文件导入为**一个**条目（不拆手；整条删除、重导出原样往返）；
- 回放时消费方可按手索引（1 起）直接取第 N 手 `replay` 载荷做手级导航；越界 → 明确报错，
  不得静默回到第一手；
- **导入整局的重导出**：`majo` 段原样返回（format 2 形态），**不带天凤/mjai 段**（§1 铁律 4 延伸：
  不复制未经验证的第三方内容）。

### 8.4 mjai 导出（仅日麻、仅整局级）

整局可附带产出 **mjai JSONL**（一事件一行，独立文件）供 AI 复盘输入（Mortal / akochan / mjai.app）。
**方言以 Mortal/libriichi 为准**（serde 无字段 rename）：

| 事件 | 字段与口径 |
| --- | --- |
| `start_game` | `names[4]`（引擎座位序，**无天凤式旋转**——mjai 座位 = 整局绝对座位 0..3） |
| `start_kyoku` | `bakaze`（E/S/W/N）+ `dora_marker` + `kyoku`（**1..=4** = 换庄数%4+1）+ `honba`/`kyotaku`/`oya` + `scores[4]`（原始点）+ `tehais[4][13]`；**庄家第 14 张紧随其后发一条 `tsumo`** |
| `tsumo`/`dahai` | `actor`+`pai`；`dahai` 带 `tsumogiri`；杠补摸牌 = 普通 `tsumo` |
| `reach`/`reach_accepted` | 宣言打牌**前**发 `reach`、紧跟该打牌后发 `reach_accepted`（无 deltas） |
| `chi`/`pon`/`daiminkan` | `actor`/`target`/`pai`（=被鸣张）/`consumed`（其余 2/2/3 张） |
| `ankan`/`kakan` | 暗杠 `consumed[4]` 无 pai；**加杠 `pai` = 加杠那张、`consumed` = 原碰 3 张** |
| `dora` | 杠后新表宝独立事件（`dora_marker`，无 actor） |
| `hora` | `actor`/`target`（自摸==actor；荣和=放铳者、抢杠=加杠宣告者）/`deltas[4]`/`ura_markers`（**字段名是 `ura_markers`**，非 gimite 原规范的 `uradora_markers`；无 pai/yakus/scores——Mortal 只吃这四个字段） |
| `ryukyoku` | **`deltas` 无条件携带**（Mortal 的安全超集；途中流局无分 → 零值）+ `reason`/`tenpais`（gimite 原规范字段：Mortal serde 忽略未知键、akochan 会读 reason；`tenpais` 是 4 布尔数组、仅荒牌流局携带——途中流局无听牌语义）。reason 七值照抄 gimite 转换器 `tenhou_archive.rb`：`fanpai`（荒牌）/`kyushukyuhai`（九种九牌）/`sufonrenta`（四风连打）/`suchareach`（四家立直）/`sanchaho`（三家和）/`sukaikan`（四杠散了）/`nagashimangan`（流局满贯——仅它在荒牌流局且流局满贯规则开启且确有满贯手时替换 `fanpai`） |
| `end_kyoku`/`end_game` | 无字段；每手结束一条 `end_kyoku`、整局末尾一条 `end_game` |

- 牌码：`1m..9m/1p..9p/1s..9s`、字牌 `E/S/W/N/P/F/C`、红五 **`5mr/5pr/5sr`**（Mortal `MJAI_PAI_STRINGS`）；
- 生成与天凤段同源（同一重放路径），红五身份/里宝揭示/流局满贯判定沿用天凤段口径；
- 某手 seed=null（崩溃恢复局）或重放校验失败 → **跳过该手**（宁缺）；全部失败 → 不产文件；
- 已知近似与天凤段相同：红五"哪一张"按计数近似、里宝只在立直者和牌时揭示。

> 注：整局归属（matchId/matchIndex）与归档限额是**导出方内部事务**，不出现在文件格式中——
> format 2 容器本身就是"整局"的完整表示。

---

## 附录 A：载荷字段参考

> 协议类型内联表（公开规范必须自足）。字段顺序即建议的 canonical 键序（§6.2）。

### A.1 `ReplayDataPayload`（= `majo.replay`）

见 §3.3 表。

### A.2 `ReplayFrame`

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `dealer` | int | ✓ | 本圈庄家座位 0..3 |
| `roundWind` | string | ✓ | 圈风字牌码 `1z`(东)..`4z`(北) |
| `handNumber` | int? | — | 本圈内第几局（1 起）；**川麻为 null**（无圈局概念） |
| `phase` | string | ✓ | `DINGQUE`（川麻定缺阶段）/`AWAIT_DISCARD`/`CLAIM_WINDOW`/`ROBBED_KAN_WINDOW`/`ENDED` |
| `turn` | int | ✓ | 当前行动座位 0..3 |
| `wallRemaining` | int | ✓ | 牌墙余张 |
| `doraIndicators` | string[]? | — | 表宝指示牌（日麻） |
| `uraDoraIndicators` | string[]? | — | 里宝指示牌（日麻） |
| `honba` | int? | — | 本場数（日麻） |
| `riichiSticks` | int? | — | 供託立直棒数（日麻） |
| `laiziKind` | string? | — | 癞子花色定源（粤麻：`flip`/`hongzhong`） |
| `laiziIndicator` | string? | — | 癞子指示牌（粤麻） |
| `pendingDiscard` | string? | — | 鸣牌窗口中被等待打出的牌 |
| `pendingDiscardBy` | int? | — | 上述牌的打出者座位 |
| `lastAction` | string? | — | 上一动作的机器格式（`verb:seat[:arg]`） |
| `seats` | ReplayFrameSeat[4] | ✓ | 四座状态（§4：`seats[i].seat == i`） |

### A.3 `ReplayFrameSeat`

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `seat` | int | ✓ | 座位 0..3 |
| `nickname` | string | ✓ | 昵称 |
| `concealed` | string[] | ✓ | 手牌牌码（含刚摸未打那张） |
| `melds` | MeldInfo[] | ✓ | 副露 |
| `flowers` | string[] | ✓ | 花牌（国标补花） |
| `river` | string[] | ✓ | 牌河牌码 |
| `score` | int | ✓ | 当前点数 |
| `active` | boolean | ✓ | 是否在对局中（川麻血战出局 = false） |
| `riichi` | boolean? | — | 立直状态（日麻） |
| `dingque` | string? | — | 定缺花色（川麻：`m`/`p`/`s`） |

### A.4 `RuleOptions`（= `majo.options`）

全部字段**可空**、缺省 = 玩法默认基线：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `mcrFanCap` | int? | 国标封顶番数；0 或 null = 无上限（基线） |
| `sichuanFanCap` | int? | 川麻封顶番数（3/4/5）；null = 5（基线） |
| `riichiNagashiMangan` | boolean? | 日麻流局满贯开关；null = 开（基线） |
| `guangdongLaiziSource` | string? | 粤麻癞子定源：`flip`（翻牌定癞，基线）/`hongzhong`（固定红中）；null = `flip` |
| `guangdongMaima` | boolean? | 粤麻买马开关；null = 开（基线） |
| `matchLength` | string? | 赛制：`tonpu`（东风战，仅日麻）/`half`（半圈）/`full`（一圈）/`infinite`（无限）；null = 未设置，日麻按 `half`、其余玩法按 `infinite` |

### A.5 `HandSettlement`（`replay.wins[]` 元素）

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `source` | string | ✓ | `SELF_DRAW`（自摸）/`DISCARD`（荣和）/`ROBBED_KAN`（抢杠）/`KAN_REPLACEMENT`（杠上）/`LAST_TILE_WALL`（海底）/`LAST_TILE_DISCARD`（河底） |
| `winners` | WinnerInfo[] | ✓ | 赢家（可多家：一炮多响） |
| `deltas` | ScoreDelta[] | ✓ | 各座位分差变动，**稀疏**——只含有变动的座位（分差守恒由玩法保证；日麻放铳/自摸恒两家、川麻血战出局者不产生收支）。`score` 为变动后累计分 |
| `discardBy` | int? | — | 放铳/河底炮的弃牌者座位（自摸/抢杠缺省） |
| `uraDoraIndicators` | string[]? | — | 里宝揭示（日麻、立直者和牌时） |

### A.6 `WinnerInfo`（`winners[]` 元素）

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `seat` | int | ✓ | 赢家座位 |
| `totalFan` | int | ✓ | 总番 |
| `fans` | FanInfo[] | ✓ | 番种明细 |
| `handTiles` | string[] | ✓ | 和牌时的暗手（**自摸含所胡张；荣和/抢杠不含**，所胡张单独在 `winTile`） |
| `winTile` | string | ✓ | 和牌张牌码 |
| `fu` | int? | — | 符数（日麻） |
| `maimaHorses` | string[]? | — | 中马马牌（粤麻） |
| `maimaWinning` | int? | — | 中马得马数（粤麻） |

### A.7 其余嵌套类型

| 类型 | 字段 |
| --- | --- |
| `MeldInfo` | `type`: string（`CHI`/`PON`/`OPEN_KAN`/`CONCEALED_KAN`/`ADDED_KAN`）；`tiles`: string[]（副露牌码）；`fromSeat`: int?（被鸣者座位）；`claimedTile`: string?（被鸣张） |
| `FanInfo` | `id`: string（番种标识）；`value`: int（番值）；`times`: int（计次，如双暗刻计 2） |
| `ScoreDelta` | `seat`: int；`delta`: int（分差）；`score`: int（结算后点数） |
| `ReplayRyukyoku` | `reason`: string（流局原因）；`tenpaiSeats`: int[]?（听牌者座位）；`deltas`: ScoreDelta[]?（听牌费分差）；`tenpai`: TenpaiInfo[]?（听牌明细，川麻查叫） |
| `TenpaiInfo` | `seat`: int；`totalFan`: int；`fans`: FanInfo[] |

---

## 附录 B：四玩法载荷要点

非日麻玩法**只有 `majo` 段**（没有 `title/name/rule/log`）；各自的关键信息都在载荷里，
格式不需要为玩法加任何字段：

| 玩法 | 关键信息在载荷哪 |
| --- | --- |
| 国标（`mcr`） | `seats[].flowers`（花牌补花）、`wins[].fans[]`（81 番种明细）、`options.mcrFanCap` |
| 川麻（`sichuan`） | `seats[].dingque`（定缺）、`seats[].active`（血战出局）、`ryukyoku.tenpai`（查叫）、`options.sichuanFanCap`；`meta.dealerRotation = 0`（恒 0，按玩法忽略） |
| 粤麻（`guangdong`） | `laiziKind`/`laiziIndicator`（定癞）、`wins[].maimaHorses`/`maimaWinning`（中马）、`options.guangdongLaiziSource`/`guangdongMaima` |
| 日麻（`riichi`） | `doraIndicators`/`uraDoraIndicators`/`honba`/`riichiSticks`/`seats[].riichi`、`wins[].uraDoraIndicators`/`winners[].fu`；另有 `title/name/rule/log` 天凤段（互操作文档） |

---

## 附录 C：改写说明（维护者向）

本规范是内部实现规范的产品中立化改写版，供公开仓维护与外部读者使用。

**同步方向**：格式演进**先改内部实现规范，再单向同步到本仓**；不在本仓先行发明/修改格式定义。
同步时按下表对位搬运，并保持"中立化筛子"（去内部引用、去版本叙事、面向生成方/消费方陈述）。

| 本规范 | 内部规范 | 处理 |
| --- | --- | --- |
| §0 范围与命名 | §0 | 删 XML 废止行与 MIME 事故叙事 |
| §1 设计铁律 | §1 | 删实现路径与历史叙事；验收项改指互操作文档 |
| §2 顶层结构 | §2 | 样例值泛化；"忽略未知键"升格为消费方义务 |
| §3 majo 段 | §3 | 3.4 由"服务端校验口径"改写为双方实现注意；删源码引用 |
| §4 校验清单 | §4 | 删前端性能框架，升格为消费方最低完备集 |
| §5 解析策略 | §6 | 删落盘/登记两步（实现自由）；错误码全集保留 |
| §6 往返不变式 | §7 | 保留 1~3（逐字段相等/幂等/渲染不抛）；删 token 隔离等实现侧条目 |
| §7 版本演进 | §8 | 保留全部 |
| §8 整局容器（含 mjai） | §9 | 8.4 事件表原样保留；9.3 协议消息细节删；9.5 归档侧整节删（实现自由，见 8.4 末注） |
| 附录 A 载荷字段参考 | 载荷协议类型（实现仓 codegen 产物） | 内联成表（原规范以"同形"引用协议仓） |
| 附录 B 四玩法要点 | 附录 B | 原样 |
| 天凤互操作（本文不收） | §5 | 全部移至 `interop/tenhou-interop.md`，依赖点已内联 |

原规范附录 A 的"骨架示意样例"按其自身承诺由 `examples/` 的**真实导出物**替换（该旧账在本文档仓兑现）。
