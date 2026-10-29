# 第三方组件与方法来源

## cheat-on-content

本项目使用 [XBuilderLAB/cheat-on-content](https://github.com/XBuilderLAB/cheat-on-content) 的选题与写作方法片段，来源版本为 `97aec3e3dfcc8ba8c080c641432832fa39d12957`。

随项目保留的只读参考文件位于 `vendor/cheat-on-content/`。该部分版权属于 **Copyright (c) 2026 cheat-on-content contributors**，适用的完整 MIT 许可见 [vendor/cheat-on-content/LICENSE](vendor/cheat-on-content/LICENSE)。具体范围见 [ORIGIN.md](vendor/cheat-on-content/ORIGIN.md)。工作台适配说明位于 `内容方法/cheat-on-content/`。

## 运行依赖

- Electron：通过 npm 安装，使用其自身许可证及随安装包提供的第三方声明。
- jsdom：仅用于界面逻辑测试，通过 npm 安装，使用其自身许可证。
- FFmpeg / FFprobe：由使用者单独配置，本仓库不分发其二进制文件；许可取决于所选构建的组件与配置。
- faster-whisper / CTranslate2 与语音模型：由使用者单独配置，本仓库不分发 Python 环境或模型权重；使用时遵循各组件与模型的许可。
- Codex：通过使用者已有的安装和登录调用，本仓库不分发 Codex 或账号凭据，不提供会员或 API 额度。

本仓库不包含用户视频、字幕、评论、账号登录信息或第三方影视样片。需要真实媒体的测试在本地生成色块与音轨，不复用私人素材。
