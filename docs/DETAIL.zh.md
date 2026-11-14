# 技术说明

本文补充说明 daily-secretary 的记录流程、数据格式、配置字段和安全边界。安装方法与普通使用步骤见[项目 README](../README.md)。

## 工作流程

```text
scrabber（截屏子进程）       DSH 插件主机                     Windows 桌面组件
screenshots/<日期>/*.png ──▶ 按时间窗口选取截屏和时间线
                              ├─▶ 调用当前模型生成详细记录
                              ├─▶ 写入 diary/detail/ 与 state/notes/
                              ├─▶ 更新 state/ledger.json
                              └─▶ 成功落盘后清理已处理的截屏
                                      ▲                         │
                                      └── 本机回环 HTTP + token ─┘
```

截屏由随插件提供的 `scrabber` 子进程完成；记录调度、模型调用、文件读写和状态管理由 DSH 插件主机负责。桌面组件只显示状态、日记卡片和接收暂停、继续等操作。

## 记录时间窗口

`T` 表示当前尚未总结的窗口起点，保存在 `state/ledger.json`。默认记录间隔 `ΔT` 为 3600 秒。

| 情况 | 处理方式 |
| --- | --- |
| 首次启用 | 默认暂停；用户开始记录后将 `T` 设为当前时间 |
| 到达 `T + ΔT` | 总结 `(T, T + ΔT]`，处理结束后将 `T` 推进到窗口边界 |
| 窗口先遇到本地零点 | 在零点处分段，按日期分别写入记录 |
| 用户暂停 | 先停止截屏，再把尚未总结的窗口补到暂停时刻 |
| 用户恢复 | 先处理暂停期间已有的待处理截屏，再从当前时刻开始记录 |
| DSH 重启或系统恢复 | 如果 `T` 之后有待处理截屏，尝试将其汇总到启动时刻；没有待处理截屏时将游标推进到当前时刻 |

定时窗口以计划边界结束，不会把边界之后的截屏混进上一段。详细记录的时间戳使用本地时间。

## 数据目录

默认数据根目录是插件目录；`dataDir` 可以将数据单独放到其他目录。程序仅在数据根目录中创建以下内容：

```text
<dataDir>/
├─ screenshots/<YYYY-MM-DD>/<YYYY-MM-DD>T<HH.MM.SS>.png
├─ diary/
│  ├─ detail/<YYYY-MM-DD>.md
│  └─ daily/<YYYY-MM-DD>.md
├─ state/
│  ├─ ledger.json
│  ├─ notes/<YYYY-MM-DD>.json
│  ├─ settings.json
│  ├─ widget.json
│  └─ widget-pid.json
└─ logs/
   ├─ secretary.log
   ├─ scrabber.log
   └─ deletions.jsonl
```

`ledger.json` 保存记录游标、暂停状态和统计信息；`notes/` 保存每天各段的要点，供每日小结使用；`settings.json` 保存设置页中的覆盖值。`widget.json` 由桌面组件保存窗口位置，插件只读取它；`widget-pid.json` 保存插件启动的组件进程号。

## 两类日记

### 详细记录

`diary/detail/<日期>.md` 按时间追加记录。相邻段共用时间分隔线：

```text
===============YYYY/MM/DD HH:mm:ss===============

> 起止时间 · 截屏数量 · 实际附图数量

模型生成的工作记录正文

===============YYYY/MM/DD HH:mm:ss===============
```

模型请求带有完整截屏时间线，并按 `imageBudget` 选择代表帧。默认每段附带最多 8 张图。正文要求用具体证据和时间点记录观察到的工作；机器可读的 `highlights` 与 `quip` JSON 围栏附在正文之后，用于每日小结。

### 每日小结

`diary/daily/<日期>.md` 是当天卡片内容，每次生成时覆盖旧文件。默认在本地时间 21:30 生成；之后若出现新的详细记录，默认至少间隔 30 分钟再刷新。每日小结生成前会先处理当前尚未总结的尾段。

## 配置

常用值可以在 DSH「设置 → 每日秘书」里调整。界面设置立即生效并保存在 `state/settings.json`；它们优先于 `cordis.patch.yml` 中的配置。修改截屏间隔会重启截屏子进程，已经拍下的图片不受影响。选择“恢复默认”会删除界面覆盖值并重新使用 YAML 配置。

| 配置键 | 默认值 | 说明 |
| --- | --- | --- |
| `dataDir` | 插件目录 | 数据根目录 |
| `scrabberPath` | 自动查找 | 可覆盖内置截屏程序路径；通常不需要设置 |
| `captureIntervalSeconds` | `20` | 截屏间隔（秒）；界面范围为 2–600 秒 |
| `includeCursor` | `true` | 是否在 Windows 截屏中包含鼠标指针 |
| `deltaTSeconds` | `3600` | 每段记录的默认时间窗口（秒）；界面范围为 5–360 分钟 |
| `imageBudget` | `8` | 每段最多附给模型的截屏数，配置范围为 1–19 |
| `minWindowSeconds` | `60` | 暂停重试和每日小结前处理尾段的最短长度 |
| `provider` / `model` | 跟随 profile | 指定 DSH 已注册的模型路由；两项一起填写，留空则跟随 profile |
| `dailyDigestAt` | `"21:30"` | 每日小结时间（本地时间） |
| `digestRefreshMinutes` | `30` | 有新记录后再次刷新小结前的最短间隔 |
| `segmentMaxTokens` | `3072` | 详细记录的输出 token 上限 |
| `dailySummaryMaxTokens` | `2048` | 每日小结的输出 token 上限 |
| `widget` | `true` | 是否启用桌面组件 |
| `registerTool` | `true` | 是否尝试向 Agent 注册 `daily_secretary` 工具 |

界面范围与 YAML 校验范围略有不同：`captureIntervalSeconds` 的 YAML 范围为 1–3600 秒，`deltaTSeconds` 为 60–86400 秒；界面分别限制为 2–600 秒和 300–21600 秒。`minWindowSeconds` 用于暂停后的重试以及每日小结前的尾段处理，YAML 范围为 0–3600 秒。

显式配置优先于默认的预编译文件查找。维护者或需要自定义路径的用户可用 `scrabberPath`、`DSH_SECRETARY_SCRABBER` 或 `DSH_SECRETARY_WIDGET` 覆盖对应程序；普通安装不需要设置这些值。即使将 `dataDir` 指向其他位置，程序仍从插件安装目录查找内置二进制文件。

也可以在 `cordis.patch.yml` 中为 profile 设置默认值：

```yaml
- id: daily-secretary
  name: daily-secretary
  config:
    deltaTSeconds: 1800
    dailyDigestAt: "22:00"
```

### 模型选择

默认跟随 DSH 当前 profile 的模型。也可以在设置页选择 DSH 已注册的 provider 和 model；插件会向 DSH 实时查询并校验这条路由。选中支持图片输入的模型才能读取截屏内容。文本模型仍可结合时间线生成记录，但看不到画面；设置页和日志会显示这一状态。

## 截屏清理边界

截屏只会在详细记录和对应要点成功写入后清理。模型失败或写盘失败时，原图会保留以便重试。每个候选文件还必须满足以下全部条件，否则保留并记录原因：

1. 是普通文件，不是符号链接；
2. 位于插件自己的 `screenshots/` 下，且只比根目录多一层；
3. 父目录名称符合 `YYYY-MM-DD`；
4. 文件名符合 `YYYY-MM-DDTHH.MM.SS.png`；
5. 文件名中的日期与父目录日期一致；
6. 解析后的真实路径仍位于该 `screenshots/` 目录内；
7. 截屏根目录本身确实名为 `screenshots`，且不是文件系统根目录。

程序只删除通过校验的图片文件。日期目录仅使用非递归删除；目录中还存在其他文件时不会删除该目录。成功删除的文件会写入 `logs/deletions.jsonl`。

## Agent 工具

默认尝试注册 `daily_secretary`。工具服务不可用时，不影响截屏、日记和桌面组件。

| `action` | 用途 | 主要参数 |
| --- | --- | --- |
| `status` | 查看截屏、组件和模型状态 | — |
| `today` | 读取今天的小结 | — |
| `read` | 读取某天的详细记录 | `day: "YYYY-MM-DD"`，省略时读取今天 |
| `pause` / `resume` | 暂停或恢复截屏 | — |
| `settings` | 查看当前设置和模型路由 | — |
| `configure` | 更改可由界面编辑的设置 | `captureSeconds`、`deltaTMinutes`、`dailyDigestAt`、`provider`、`model` |
| `open` | 在文件管理器中打开数据目录 | `target: "screenshots"` 或 `"diary"` |

## 限制与排错

- 当前随包预编译的截屏程序和桌面组件面向 Windows x64；截屏范围是主显示器。
- DSH 未运行期间不会继续截屏。重启时会尝试汇总尚未处理的截屏，但无法记录未产生的画面。
- 截屏与相关文字会发送给当前选用的模型服务；请留意服务隐私政策和费用。
- 圆点为黄色时处于暂停状态；单击圆点恢复记录。
- 截屏程序不可用时，先检查插件包中是否包含预编译文件，并查看 `logs/secretary.log`。
- 有截屏但没有新记录时，检查日志中的 `summary failed`，并确认模型路由、配额和图片输入能力。失败时截屏会保留。
- 当天还没有记录或尚未到小结时间时，卡片可能没有内容；`daily_secretary` 的 `today` 和 `read` 可分别读取小结和详细记录。

## 开发验证

```powershell
node --test
node scripts/build-native.mjs
```

普通用户通过 DSH 安装时直接使用仓库内的预编译程序；Rust 只用于维护者从源码重新构建桌面组件。
