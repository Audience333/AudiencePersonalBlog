# Ubuntu 部署与维护

以下示例假定项目安装到 `/srv/personal-blog`，域名是 `example.com`。先准备一台已安装 Node.js `24.15+`、Git 和 Caddy 的 Ubuntu 服务器，并完成域名备案、解析和防火墙的 80/443 端口放行。

## 首次部署

```bash
sudo mkdir -p /srv/personal-blog
sudo chown $USER:$USER /srv/personal-blog
git clone https://github.com/Audience333/AudiencePersonalBlog.git /srv/personal-blog
cd /srv/personal-blog
npm ci
npm run check
npm run build
mkdir -p data/uploads data/backups
chmod 700 data
npm run admin:create -- your-admin-name
sudo adduser --system --group --home /srv/personal-blog personalblog
sudo chown -R personalblog:personalblog /srv/personal-blog
```

`npm ci` 会严格按照仓库的锁定依赖安装，适合服务器；`npm run build` 会生成 `dist/` 中的生产版本。最后两行创建受限的服务账号并将网站数据交给它管理，避免网站以 root 身份运行。请妥善保存刚创建的管理员密码。

## 生产环境变量

创建只有系统管理员可读取的变量文件：

```bash
sudo install -m 600 /dev/null /etc/personal-blog.env
sudo nano /etc/personal-blog.env
```

填入以下内容，并将 `example.com` 改为真实域名：

```dotenv
HOST=127.0.0.1
PORT=4321
PUBLIC_SITE_ORIGIN=https://example.com
BLOG_DB_PATH=/srv/personal-blog/data/blog.sqlite
BLOG_UPLOAD_DIR=/srv/personal-blog/data/uploads
```

`NODE_ENV=production` 已写入 systemd 服务。Astro 不会在运行时自动加载项目目录里的 `.env`，所以由 systemd 读取此文件并传入服务。

## 安装应用服务

复制仓库中的服务范例：

```bash
sudo cp deploy/personal-blog.service.example /etc/systemd/system/personal-blog.service
sudo systemctl daemon-reload
sudo systemctl enable --now personal-blog
sudo systemctl status personal-blog
```

服务只监听本机 `127.0.0.1:4321`，不会直接暴露 Node.js 端口。若启动失败，使用 `sudo journalctl -u personal-blog -n 100 --no-pager` 查看最近日志。

## 配置 HTTPS 反向代理

将 `deploy/Caddyfile.example` 的内容合并到 `/etc/caddy/Caddyfile`，把 `example.com` 替换成域名后验证并重载：

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl https://example.com/api/health
```

返回 `{"ok":true}` 表示应用和数据库可用。Caddy 会负责 HTTPS 证书与浏览器到服务器的加密连接。

## 备份

```bash
cd /srv/personal-blog
npm run backup -- --output data/backups
```

每次备份都会创建新的时间戳目录，包含 `blog.sqlite`、`uploads/` 和 `manifest.json`，不会覆盖旧备份。建议用服务器的定时任务将这个目录复制到另一台机器或对象存储。

## 恢复

先停止服务并保留当前数据副本，再从一个备份目录恢复：

```bash
sudo systemctl stop personal-blog
cp -a data data.before-restore
cp data/backups/<timestamp>/blog.sqlite data/blog.sqlite
rm -rf data/uploads
cp -a data/backups/<timestamp>/uploads data/uploads
sudo systemctl start personal-blog
curl https://example.com/api/health
```

如果健康检查失败，停止服务后将 `data.before-restore` 还原为 `data`，再启动服务。这就是回滚路径。

## 升级与回滚

升级前先运行备份，然后：

```bash
cd /srv/personal-blog
git pull
npm ci
npm run check
npm run build
sudo systemctl restart personal-blog
curl https://example.com/api/health
```

如果新版本无法正常工作，使用 `git log --oneline` 找到上一个可用提交，执行 `git checkout <commit>`，再次运行 `npm ci`、`npm run build` 和 `sudo systemctl restart personal-blog`。确认恢复后，再决定是否创建修复提交。
