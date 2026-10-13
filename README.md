# GPT AutoLogintor 2.1

Windows 本地工具：离线提取 Session JSON 中的 `sessionToken`，以及唤起本机浏览器的无痕 / 隐私窗口。这两个功能独立，提取的令牌不会传给浏览器。

另配 Chrome / Edge 本地扩展：在 ChatGPT 无痕标签中打开扩展，主动粘贴令牌并点击导入。安装目录为项目内的 `extension` 文件夹，详细步骤见 [extension/INSTALL.md](extension/INSTALL.md)。首次安装和无痕权限需在浏览器中手动启用。Firefox 启动功能保留，扩展首版不支持 Firefox。

## 启动

双击 `start.cmd`。需要 Node.js 22 或更新版本；无第三方 npm 依赖，无需下载浏览器运行时。终端需保持运行。关闭工具不会关闭已经打开的普通浏览器。

右侧可选本机安装的 Chrome、Edge 或 Firefox。程序检查 Program Files、Program Files (x86) 和 LocalAppData 下的标准安装位置。非标准安装位置暂不自动识别。

## 使用

- 左侧粘贴完整 Session JSON，点击提取；可显示、复制或清空。只在界面本地解析，令牌不会发给 Node 服务。JSON 排版换行可解析，令牌内部异常字符会被拒绝。
- 右侧选择浏览器，点击“打开 ChatGPT 隐私窗口”，再在网页中正常登录。Chrome 使用 `--incognito --new-window`，Edge 使用 `--inprivate --new-window`，Firefox 使用 `-private-window`。
- 界面“已发送打开请求”只表示进程启动请求已发出，不能证明页面加载、隐私模式或登录成功。请在实际窗口核对隐私标识；系统策略可能限制隐私浏览。
- 同一浏览器配置下的隐私窗口可能共享会话；Firefox 可能在已有隐私窗口内打开新标签。新开窗口不保证空白登录状态。

## 清除与切换账号

结束当前操作后，手动关闭该浏览器同一配置下的全部隐私窗口，再重新打开。只关闭某一个标签或窗口可能不会结束隐私会话。工具不读取现有窗口，不强制结束浏览器进程，也不自动删除浏览器资料。

“清空界面凭证”只清空本工具中的 JSON、提取结果和账号信息，不影响剪贴板、浏览器登录或服务端凭证。

## 与旧版的区别

已移除 Playwright 依赖、自动化浏览器、启动器 Cookie 注入、登录检测轮询和远程关闭/清理功能。Firefox 使用本机普通安装版本，不再需要 `install-firefox.cmd`。可选本地扩展仅通过浏览器 Cookie API 执行用户主动发起的导入及清除，不控制网页或自动完成验证。

普通浏览器启动命令不能写入 session Cookie，导入由单独安装的扩展完成。扩展会验证无痕上下文和目标 Cookie 存储区，清除旧登录 Cookie 后分段写入、读取核对，再刷新当前页；不会修改普通窗口或 Cloudflare Cookie。写入成功不保证登录成功，也不保证消除人机验证。

## 本地服务

只监听 `127.0.0.1` 随机端口，使用随机本地访问密钥并检查 Host / Origin。密钥在界面地址的 `#` 片段中，不是 ChatGPT 令牌。启动接口只接受浏览器 ID，不接受凭证、自定义网址、可执行文件或启动参数。

不将 Session JSON、令牌写入文件、日志或网页持久存储。浏览器只被要求打开固定的 `https://chatgpt.com/`。工具没有读取聊天、代付或订阅功能。

## 验证

运行 `npm test` 检查令牌解析、三种浏览器的启动参数、错误处理、本地 API 访问控制和界面交互。测试使用虚构数据，不登录真实账号。

扩展测试模拟浏览器扩展 API，覆盖存储区隔离、分段、失败清理和消息来源限制；不等于已在真实账号验证登录成功。修改 `lib/session.js` 后运行 `npm run build:extension` 同步自包含扩展的校验文件，再执行测试。无需第三方依赖。Native Messaging 暂未接入。

## 启动参数参考

- [Chromium 命令行参数](https://www.chromium.org/developers/how-tos/run-chromium-with-flags/)
- [Mozilla Firefox 命令行参数](https://wiki.mozilla.org/Firefox/Command_Line_Options)
