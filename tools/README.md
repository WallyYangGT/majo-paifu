# tools/ —— 最小 reader（验收工具）

> 状态：✅ **已实现并通过验收**——[majo_reader.ts](minimal-reader/majo_reader.ts)
> 正例 9/9 通过、负例 14/14 命中（`examples/` 全量）。

## 它是什么

本仓的硬验收口径的落地：**照 [`spec/`](../spec/README.md) 的规范从零写一个不依赖原始实现的
minimal reader**，读取 [`examples/`](../examples/README.md) 全量样例：

1. 正例全部通过规范「载荷帧必需字段」校验清单，并打印对局摘要（玩法、帧数、结算、seed、有无天凤段）；
2. 负例按 `manifest.json` 逐例命中 §5.1 错误码（`too_large`/`bad_file`/`not_majo`/`bad_version`/`bad_shape`/`not_supported`）。

这是「陌生人可按图索骥」的自验——reader 只凭规范文本实现，任何走不通的地方就是规范要补的地方
（实际上它已经抓到过一处：`deltas` 是稀疏的而非定长四家，规范已据实更正）。

## 运行

零 npm 依赖、单文件 TypeScript（Node ≥ 22.6 的 type stripping 或 Deno）：

```bash
node --experimental-strip-types tools/minimal-reader/majo_reader.ts examples
# 或： deno run tools/minimal-reader/majo_reader.ts examples
```

参数为一个或多个目录/文件；目录会递归收集 `.json`/`.jsonl`（`negative/` 由 manifest 驱动做负例断言）。
任一失败进程退出码非 0——CI 即以此作门禁。

## 许可

本目录代码与文档仓其他部分许可不同：**Apache-2.0**（随代码文件头标注）；文档与样例数据为 CC-BY 4.0。
