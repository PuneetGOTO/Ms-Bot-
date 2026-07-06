# 安装部署教程：Ubuntu / Windows

本文档说明如何把 Ms Bot 部署到服务器。推荐生产环境使用 Ubuntu + Docker Compose；Windows 更适合本机测试、小规模运行或开发。

- 项目 README： [../README.zh-CN.md](../README.zh-CN.md)
- English README： [../README.md](../README.md)
- Docker 官方 Ubuntu 文档： [Install Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
- Docker Compose 官方文档： [Docker Compose](https://docs.docker.com/compose/)
- Docker Desktop Windows： [Install Docker Desktop on Windows](https://docs.docker.com/desktop/setup/install/windows-install/)

## 一、准备 Discord Bot

1. 打开 [Discord Developer Portal](https://discord.com/developers/applications)。
2. 创建 Application。
3. 进入 `Bot` 页面，创建 Bot，并复制 `Token`。
4. 进入 `OAuth2` -> `General`，复制 `Client ID`。
5. 进入 `OAuth2` -> `URL Generator`，选择 scopes：

```text
bot
applications.commands
```

6. Bot permissions 至少需要：

```text
Send Messages
Use Slash Commands
Embed Links
Connect
Speak
Use Voice Activity
```

7. 用生成的邀请链接把 Bot 加入你的 Discord 服务器。
8. 如果只想先在一个服务器快速测试，复制该 Discord Server ID，作为 `DISCORD_GUILD_ID`。

开启开发者模式后，右键服务器图标可以复制 Server ID。

## 二、Ubuntu 生产部署

推荐系统：

- Ubuntu 22.04 LTS 或 24.04 LTS
- 2 vCPU 起步
- 2 GB RAM 起步，推荐 4 GB+
- 20 GB 磁盘起步
- 能访问 Discord、GitHub、Docker Registry

### 0. 一键部署脚本

如果是全新的 Ubuntu 服务器，推荐先用脚本完成基础部署：

```bash
curl -fsSL https://raw.githubusercontent.com/PuneetGOTO/Ms-Bot-/main/scripts/deploy-ubuntu.sh -o deploy-ubuntu.sh
bash deploy-ubuntu.sh --register-commands
```

脚本会自动完成：

- 检查 Ubuntu 系统。
- 安装基础工具、Docker Engine 与 Docker Compose 插件。
- 克隆或更新 `https://github.com/PuneetGOTO/Ms-Bot-.git` 到 `/opt/ms-bot`。
- 从 `.env.example` 创建 `/opt/ms-bot/.env`。
- 设置 `NODE_ENV=production`。
- 自动生成 `API_TOKEN` 与 `METRICS_TOKEN`。
- 提示输入 `DISCORD_TOKEN`、`DISCORD_CLIENT_ID`，以及可选的 `DISCORD_GUILD_ID`。
- 执行 `docker compose up --build -d`。
- 等待 `http://localhost:3000/health` 通过。
- 使用 `--register-commands` 时，在 bot 容器内注册 Slash Commands。

常用参数：

```bash
bash deploy-ubuntu.sh --app-dir /opt/ms-bot
bash deploy-ubuntu.sh --repo-url https://github.com/PuneetGOTO/Ms-Bot-.git --branch main
bash deploy-ubuntu.sh --skip-docker
bash deploy-ubuntu.sh --no-start
bash deploy-ubuntu.sh --non-interactive
```

脚本部署完成后，常用命令：

```bash
cd /opt/ms-bot
docker compose ps
docker compose logs -f bot
curl http://localhost:3000/health
curl http://localhost:3000/ready
```

脚本不会把 `.env` 推送到 GitHub。请把 `/opt/ms-bot/.env` 当作服务器私密文件保存。

### 1. 更新系统

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y ca-certificates curl git nano openssl ufw
```

### 2. 安装 Docker Engine 与 Compose 插件

以下命令基于 Docker 官方 Ubuntu apt repository 流程：

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

确认安装：

```bash
docker --version
docker compose version
```

让当前用户可以执行 Docker：

```bash
sudo usermod -aG docker "$USER"
newgrp docker
```

如果 `newgrp docker` 后仍没有权限，退出 SSH 后重新登录。

### 3. 克隆项目

```bash
cd /opt
sudo git clone https://github.com/PuneetGOTO/Ms-Bot-.git ms-bot
sudo chown -R "$USER:$USER" /opt/ms-bot
cd /opt/ms-bot
```

### 4. 创建 `.env`

```bash
cp .env.example .env
nano .env
```

至少修改：

```env
NODE_ENV=production
DISCORD_TOKEN=你的_Discord_Bot_Token
DISCORD_CLIENT_ID=你的_Discord_Client_ID
DISCORD_GUILD_ID=

API_TOKEN=替换成至少16位随机字符串
METRICS_TOKEN=替换成至少16位随机字符串

SPOTIFY_ENABLED=false
SPOTIFY_COUNTRY_CODE=US
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
```

生成随机 token：

```bash
openssl rand -hex 32
```

如果使用当前仓库默认 `docker-compose.yml`，Bot 容器内会自动使用这些服务地址：

```env
DATABASE_URL=postgresql://musicbot:musicbot@postgres:5432/musicbot?schema=public
REDIS_URL=redis://redis:6379/0
LAVALINK_NODES=[{"name":"primary","url":"lavalink:2333","auth":"youshallnotpass","secure":false}]
```

生产环境建议进一步修改 `docker-compose.yml` 中的 PostgreSQL 密码与 Lavalink auth，然后同步修改 `.env` / compose environment。

如果要启用 Spotify，请到 [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) 创建 App，复制 `Client ID` 与 `Client Secret`，然后设置：

```env
SPOTIFY_ENABLED=true
SPOTIFY_COUNTRY_CODE=US
SPOTIFY_CLIENT_ID=你的_Spotify_Client_ID
SPOTIFY_CLIENT_SECRET=你的_Spotify_Client_Secret
```

Spotify 通过 Lavalink 的 LavaSrc 插件解析。Spotify 本身不会直接提供可播放音频，LavaSrc 会使用 Spotify 元数据去匹配可播放来源。

### 5. 防火墙建议

如果 REST API 只给本机或反向代理使用，不建议直接向公网开放 `3000`。

基础 SSH 防火墙：

```bash
sudo ufw allow OpenSSH
sudo ufw enable
sudo ufw status
```

如果你需要从公网访问 API，建议只开放反向代理的 `80/443`，并在 Nginx / Caddy 上加 TLS 与访问控制。

### 6. 启动服务

```bash
docker compose up --build -d
```

查看状态：

```bash
docker compose ps
docker compose logs -f bot
```

确认 health：

```bash
curl http://localhost:3000/health
curl http://localhost:3000/ready
```

`/ready` 应该看到：

```json
{
  "status": "ready",
  "nodes": [
    {
      "name": "primary",
      "connected": true
    }
  ]
}
```

### 7. 注册 Slash Commands

如果服务器上安装了 Node.js 与 pnpm，可以直接运行：

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm commands:register
```

如果你只想用 Docker，不在宿主机安装 Node，也可以临时进入 bot 镜像执行已构建脚本：

```bash
docker compose exec bot node dist/scripts/registerCommands.js
```

建议开发期填写 `DISCORD_GUILD_ID`，这样 guild commands 几乎立即刷新。全局 commands 可能需要等待 Discord 缓存传播。

### 8. 更新版本

```bash
cd /opt/ms-bot
git pull
docker compose up --build -d
docker compose logs -f bot
```

如果指令定义有改动：

```bash
pnpm commands:register
```

### 9. 停止服务

停止并移除容器，但保留数据库/Redis 数据卷：

```bash
docker compose down
```

停止并删除数据卷：

```bash
docker compose down -v
```

生产环境不要随便执行 `down -v`，它会删除 PostgreSQL 与 Redis 数据。

### 10. 备份 PostgreSQL

创建备份目录：

```bash
mkdir -p backups
```

导出：

```bash
docker compose exec -T postgres pg_dump -U musicbot -d musicbot > backups/musicbot-$(date +%F-%H%M%S).sql
```

恢复示例：

```bash
cat backups/musicbot.sql | docker compose exec -T postgres psql -U musicbot -d musicbot
```

### 11. 常用日志命令

```bash
docker compose logs -f bot
docker compose logs -f lavalink
docker compose logs --since=10m bot
docker compose logs --tail=200 bot
```

播放时如果 Bot 没进入语音频道，重点看 Bot 日志是否有：

```text
Joining voice channel.
Voice player connected.
```

## 三、Windows 部署或本机运行

Windows 推荐用于开发或小型测试。正式 7/24 运行仍建议使用 Ubuntu 服务器。

### 1. 安装依赖

安装：

- Git for Windows
- Docker Desktop for Windows
- Node.js 22 LTS

确认命令：

```powershell
git --version
docker --version
docker compose version
node --version
corepack --version
```

启用 pnpm：

```powershell
corepack enable
```

### 2. 克隆项目

```powershell
cd E:\Coding
git clone https://github.com/PuneetGOTO/Ms-Bot-.git
cd Ms-Bot-
```

### 3. 配置 `.env`

```powershell
copy .env.example .env
notepad .env
```

填写：

```env
DISCORD_TOKEN=你的_Discord_Bot_Token
DISCORD_CLIENT_ID=你的_Discord_Client_ID
API_TOKEN=至少16位随机字符串
METRICS_TOKEN=至少16位随机字符串
```

生成随机 token：

```powershell
[System.Guid]::NewGuid().ToString("N") + [System.Guid]::NewGuid().ToString("N")
```

### 4. Docker 方式启动

```powershell
docker compose up --build -d
docker compose logs -f bot
```

检查：

```powershell
curl.exe http://localhost:3000/health
curl.exe http://localhost:3000/ready
```

注册 Slash Commands：

```powershell
pnpm install
pnpm commands:register
```

### 5. Windows 本机开发模式

只用 Docker 跑基础服务：

```powershell
docker compose up -d postgres redis lavalink
```

本机跑 Bot：

```powershell
pnpm install
pnpm db:generate
pnpm db:migrate:dev
pnpm commands:register
pnpm dev
```

如果你本机 Node 不是 22 LTS，可能会看到 engine warning。生产 Docker 镜像使用 Node 22。

### 6. 停止 Windows 测试服务

```powershell
docker compose down
```

保留数据卷。删除数据卷：

```powershell
docker compose down -v
```

## 四、上线前检查清单

- `.env` 没有提交到 GitHub。
- `DISCORD_TOKEN` 已换成正式 Bot Token。
- `API_TOKEN` 与 `METRICS_TOKEN` 是随机长字符串。
- PostgreSQL 密码不是默认值。
- Lavalink auth 不是默认值。
- `docker compose ps` 全部服务正常。
- `curl http://localhost:3000/ready` 显示 Lavalink connected。
- Discord 服务器里 Bot 有 Connect / Speak 权限。
- Slash Commands 已注册。
- 生产服务器有日志与数据库备份策略。

## 五、常见问题

### Slash Commands 不显示

运行：

```bash
pnpm commands:register
```

开发期建议设置 `DISCORD_GUILD_ID`。全局指令需要等待 Discord 缓存刷新。

### Bot 在线但不进语音频道

检查：

- 使用指令的人是否在语音频道。
- Bot 是否有 Connect / Speak 权限。
- Bot 是否被频道权限覆盖拒绝。
- `docker compose logs --since=10m bot` 是否出现 `Joining voice channel.`。
- `/ready` 是否显示 Lavalink `connected: true`。

### 找不到歌曲

检查 Lavalink 日志：

```bash
docker compose logs --since=10m lavalink
```

默认 Lavalink 支持 YouTube、SoundCloud、HTTP、Local、Radio 等基础来源。Spotify、Apple Music、Deezer 通常需要额外插件与平台凭据。

### API 401 / 403

检查请求头：

```http
Authorization: Bearer <API_TOKEN>
```

`/metrics` 使用 `METRICS_TOKEN`，不是 `API_TOKEN`。

### 数据库连接失败

Docker Compose 内部应使用 service name：

```env
DATABASE_URL=postgresql://musicbot:musicbot@postgres:5432/musicbot?schema=public
```

宿主机本地连接才使用 `localhost`。
