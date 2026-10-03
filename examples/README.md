# examples/ —— golden 样例

> 状态：✅ **已落盘**——由主仓测试侧生成器驱动的**真实导出物**（非手写），
> 兑现规范附录「用 golden 测试产物替换骨架示意」的承诺；同时作为
> [`tools/`](../tools/README.md) 最小 reader 的全量校验语料。

## 覆盖矩阵

| 文件 | 玩法 | 形态 | 覆盖点 | seed |
| --- | --- | --- | --- | --- |
| `mcr/majo-mcr-1-*.json` | 国标 | format 1 | 70 帧完整手、1 和牌、`seats[].flowers`、`wins[].fans[]` | 101 |
| `riichi/majo-riichi-1-*.json` | 日麻 | format 1 | 64 帧完整手、立直荣和、**含天凤段四键**、里宝揭示 | 102 |
| `riichi/majo-riichi-1-ryukyoku-*.json` | 日麻 | format 1 | **途中流局**（九种九牌）：`ryukyoku` 载荷、天凤结果数组 `[名称]` 无 Δ分 形态 | 1017 |
| `riichi/majo-riichi-1-noseed-*.json` | 日麻 | format 1 | **崩溃恢复局**：`seed=null`、无 `wall`、无天凤段（§1 铁律 4 ②） | —（恢复点） |
| `riichi/majo-riichi-match-*.json` | 日麻 | **format 2** | 整局容器 3 手（2 胜 + 1 途中流局）+ 天凤段合并、换庄计数 0/1/2、分数跨手承接 | 201/251/301 |
| `riichi/majo-riichi-mjai-1-*.jsonl` | 日麻 | mjai JSONL | 与容器同一组手：245 事件（start_game→end_game、立直链、暗杠、hora/ryukyoku） | 同上 |
| `sichuan/majo-sichuan-1-*.json` | 川麻 | format 1 | 定缺阶段、血战出局、3 家和牌、`meta.dealerRotation = 0` | 101 |
| `sichuan/majo-sichuan-match-*.json` | 川麻 | **format 2** | **裸容器**（无天凤段）：3 手、帧 `handNumber = null` 口径 | 301/351/401 |
| `guangdong/majo-guangdong-1-*.json` | 粤麻 | format 1 | 癞子指示、中马、花牌补花 | 101 |
| `negative/`（14 例 + manifest） | — | 负例 | 规范 §5.1 全部错误码路径，见 `negative/manifest.json` | — |

## 生成方式

- **生成器**：主仓（Mahjong Face to Face 实现仓）`feature/golden-dump` 分支的
  `android/src/test/.../GoldenDumpTest.kt`——HARD 档 bot（Lv2Bot，纯启发式无随机源）
  全程驱动**真实完整对局**，走生产导出链（帧重建 + 牌墙重算 + 天凤段 + mjai）产出，
  pretty 重排后落盘（语义与导出器输出逐字段一致，重排仅为可读/diff）。
- **确定性**：同引擎版本 + 同 seed 重跑**字节级一致**（固定时间戳基线、固定文件名）。
- **复现**（在主仓 worktree/分支内）：

  ```bash
  GOLDEN_OUT_DIR=<本仓>/examples ./gradlew :android:testWebsiteDebugUnitTest \
    --tests "party.mahjong.lan.server.GoldenDumpTest"
  ```

- 生成基线：实现仓 v1.5.3（develop 分支）生成；格式演进后重跑生成器即可刷新本目录。

## 脱敏声明（入库硬前置，已复核）

- 昵称一律合成占位：**东家 / 南家 / 西家 / 北家**（全库扫描确认，无其他字符串）；
- 时间戳全部来自固定基线（`2026-01-01 12:00` 派生），文件名时间部分同；
- 无任何真实对局、真实用户数据；牌局内容为 bot 对局（非真人）。

## 负例（negative/）

手写变异构造：以最小合法正例为底，每个文件只含**一个**违例点，`manifest.json`
声明每个文件应命中的错误码与原因——供 reader/消费方验证 §5.1 错误路径。
覆盖：`bad_file` / `not_majo` / `bad_version` / `not_supported` / `bad_shape`
（seat 错位、座位数、牌码文法、phase 白名单、drawPositions 越界、缺必需字段、
format 2 冒充、容器内玩法不符）。
