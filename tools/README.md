# tools/ —— 最小 reader（验收工具）

> 状态：🚧 占位。

## 它是什么

本仓的硬验收口径：**照 [`spec/`](../spec/README.md) 的规范，从零写一个不依赖原始实现的 minimal reader**（语言不限，Python / TypeScript 皆可，LLM 代跑亦可），读取 [`examples/`](../examples/README.md) 全量样例：

1. 通过规范「载荷帧必需字段」校验清单；
2. 完成解析并打印摘要（玩法、局数、每手结果）。

这是「陌生人可按图索骥」的自验——如果规范写得够好，一个从未接触过原始实现的人只凭文档，就能写出吃下全部 golden 样例的 reader。反过来，任何 reader 走不通的地方，就是规范要补的地方。

## 计划

- `tools/minimal-reader/`：占位，待规范迁入后开工；
- 代码许可与文档分开：Apache-2.0，随代码就地标注（本仓文档与样例为 CC-BY 4.0）。
