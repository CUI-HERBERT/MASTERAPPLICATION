# 独立部署与迁移

目标是“GitHub 私有源码 + Cloudflare Worker + D1 + 仅本人可登录”。GitHub Actions 不执行部署；以下步骤由账号所有者或获授权的维护者完成。

## 1. 准备配置和数据库

使用 Node.js 22 或更新版本，在仓库根目录执行：

```sh
npm ci
npm test
npm run build
cp wrangler.example.jsonc wrangler.jsonc
npx wrangler login
npx wrangler d1 create cuishuhe-grad-planner
```

将新建数据库返回的 UUID 填入 `wrangler.jsonc` 的 `d1_databases[0].database_id`；绑定名保持 `DB`，`migrations_dir` 保持 `drizzle`。不要填入原 Sites 的项目 ID 或假定能继续使用原数据库。

随后为新数据库建立表结构：

```sh
npx wrangler d1 migrations apply DB --remote
```

这些命令会创建／修改 Cloudflare 账号内的资源。可参考 [D1 入门](https://developers.cloudflare.com/d1/get-started/) 和 [D1 迁移说明](https://developers.cloudflare.com/d1/reference/migrations/)。

## 2. 设置仅本人可登录

`wrangler.jsonc` 的以下变量必须使用真实值：

| 变量 | 内容 |
| --- | --- |
| `ACCESS_TEAM_DOMAIN` | 你的 Zero Trust 团队地址，如 `https://你的团队名.cloudflareaccess.com` |
| `ACCESS_AUD` | 保护该 Worker 的 Access 应用的 Application Audience (AUD) |
| `ACCESS_OWNER_EMAIL` | 仅允许登录的本人邮箱，必须与 Access 身份中的邮箱一致 |

首次可以先用未填完的模板部署，以取得 Worker 地址；此时独立版拒绝访问，包括个人经历 JSON：

```sh
npx wrangler deploy
```

在 Cloudflare 开通 Zero Trust 后，进入 **Workers & Pages → 该 Worker → Access**，启用保护并选择 **All traffic**，覆盖正式和预览访问。到对应 Access 应用中设置 Allow 策略，只允许本人邮箱；勿选允许所有邮箱或整个公共邮箱域名。登录方式可用邮箱验证码，或按 [GitHub 身份提供商说明](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/github/) 配置 GitHub。

取得该应用的 AUD，填好上述三个变量，重新执行 `npm run build` 和 `npx wrangler deploy`。GitHub OAuth 的 client secret 只应填在 Cloudflare 身份提供商配置中，不进入源码或前端。

Worker 还会验证 Access 签名、签发方、受众、有效期和本人邮箱；外部请求自行添加身份请求头不能获得访问。若更换域名或新增入口，确认其仍受同一个 Worker 的 Access 保护。

界面与设置名称可能变化，以上以 [Cloudflare Workers Access 官方说明](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) 为依据，核对于 2026-11-09。

## 3. 迁移最新个人数据

1. 在原网站确认显示“已与云端同步”，再点击“导出我的备份”，保留 JSON 原件。
2. 打开新网站，用获准的本人身份登录。配置正确后，页面应能显示项目名单和初始经历。
3. 进入“背景与规划”，使用“导入备份”选择刚才的 JSON。确认导入将替换当前新站数据。
4. 等待“已与云端同步”。核对 GPA、经历、收藏、申请进度、已保存情景和行动项。
5. 在另一设备登录同一身份并刷新，确认能读取上述内容后再切换日常使用入口。

JSON 备份包含论文、竞赛、实习、奖项、推荐人及删除标记等个人内容，保存在本机，不提交仓库。新站使用新登录身份作为数据键，不应通过复制旧的用户 ID 来绕过登录。更换 Access 应用或身份提供商后，若身份 subject 改变，应重新导入本人备份。

完成迁移前继续保留原网站和备份；这里只建立新数据库表，不会删除原网站或原云端数据。

## 4. 后续更新

代码更新后运行 `npm test`、`npm run build`，再在已登录的 Cloudflare 环境执行 `npx wrangler deploy`。修改经历、GPA 和收藏只通过网站保存，不需要提交 Git。

`wrangler.jsonc`、`.env*`、`.dev.vars*`、`backups/`、`outputs/`、`.wrangler/` 都被 Git 忽略。部署配置模板可以提交；真实账号配置、令牌、OAuth 密钥与个人导出备份不提交。
