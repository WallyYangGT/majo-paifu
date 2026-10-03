# majo-paifu

> 麻将面对面（Mahjong Face to Face）的牌谱格式知识库：开放规范 · 真实样例 · 天凤互操作知识
> The open replay-format spec, golden samples and Tenhou-interop knowledge base of *Mahjong Face to Face*.

「麻将面对面」是一款面对面围桌、局域网联机的麻将 app（游戏官网：<https://wallygood.net/majo-f2f/>）。本仓收录它所用牌谱格式（`majojson`）的开放规范、真实可运行的样例牌谱、以及天凤牌谱互操作的成文知识——目标是让任何人**不依赖这个 app**，就能读懂、校验、处理这些牌谱。牌打完，牌谱带得走：牌谱属于玩家，不属于某个 app。

## 仓库导航

| 目录 | 内容 | 状态 |
| --- | --- | --- |
| [`spec/`](spec/README.md) | `majojson` 牌谱格式规范（产品中立化改写版） | ✅ 已迁入 |
| [`interop/`](interop/README.md) | 天凤牌谱互操作知识（格式细节、坑与目验方法） | ✅ 已成文 |
| [`examples/`](examples/README.md) | 真实导出的 golden 样例（四玩法 × format 1/2 × mjai JSONL + 14 负例） | ✅ 已落盘 |
| [`tools/`](tools/README.md) | 最小 reader：照规范从零实现、吃样例过校验的验收工具 | ✅ 已通过验收（正例 9/9、负例 14/14） |

验收即门禁：push 时 CI 自动跑 minimal reader 校验 examples 全量（规范、样例、reader 任一脱节即红灯）。

## 路线

本仓是「牌谱格式与引擎开源」三步走的第一步——纯文档、零产品代码风险、独立成立、随时可停：

1. **文档仓（本仓）✅**：规范 + 真实样例 + 互操作知识 + 验收工具；
2. 编解码与引擎独立开源库：待时机成熟另起仓库；
3. 更多——不设时间表。

## 许可

- 文档与样例数据：[CC-BY 4.0](LICENSE)
- `tools/` 内代码（将来加入时）：Apache-2.0，随代码就地标注

## English summary

**majo-paifu** is the open knowledge base of the replay format used by *Mahjong Face to Face*, a face-to-face, local-network mahjong app (official site: <https://wallygood.net/majo-f2f/>). It exists so that anyone can read, validate and process these replays **without the app**:

- **spec/** — the `majojson` replay-format specification, rewritten to be product-neutral (Chinese text for now);
- **examples/** — real exported golden replays covering four mahjong variants, both container formats (single-hand and whole-session), and mjai JSONL;
- **interop/** — systematically documented Tenhou-format interop knowledge, cross-checked against the official Tenhou JavaScript and community tool sources;
- **tools/** — a minimal from-scratch reader, used as the acceptance test that the spec alone is enough to implement against.

Docs and sample data are licensed under CC-BY 4.0. The sections above (in Chinese) are authoritative.
