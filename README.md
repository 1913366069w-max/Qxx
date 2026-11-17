# 青小寻 · 微信小程序

青岛大学浮山校区校园生活小程序源码：离线矢量地图、地点搜索与步行寻路、「吃在青大」餐饮与匿名评分评论、「青大新鲜事」，以及「学在青大」课表导入与今日楼宇提示。

本项目不是青岛大学官方产品。地图为参考绘制，未经现场测绘；营业时间、门位与店铺信息以现场为准。

## 目录

| 路径 | 内容 |
| --- | --- |
| `wechat-miniprogram/` | 可直接导入微信开发者工具的完整小程序工程（原生，无 npm） |
| `wechat-miniprogram/cloudfunctions/` | 微信云开发云函数 `content` / `reviews` |
| `tests/` | 地图、路由、评论隐私、课表与日历导入测试 |
| `tools/package_miniprogram.py` | 生成可直接导入的源码 ZIP 并做完整性校验 |

## 导入与运行

1. 在微信开发者工具中选择「导入项目」，目录指向 `wechat-miniprogram/`（必须直接含 `app.json` 与 `project.config.json`），不要直接打开 ZIP 文件。
2. 项目已绑定 AppID `wx9590889b770efc12`；登录账号需具备该小程序开发权限。仓库不含 AppSecret、签名密钥或任何账号密码。
3. 如需跨设备公开评论，在开发者工具中开通云开发，新建 `content`、`reviews` 集合并部署两个同名云函数；云环境 ID 可写入 `wechat-miniprogram/config.js`。
4. 备用 HTTPS 接口需在小程序后台配置为 `request` 合法域名；未配置时离线数据与本机评论仍可使用。
5. 小程序不申请定位接口，路线由手动选择起终点生成。

更详细的导入说明见 `wechat-miniprogram/使用微信开发者工具导入.txt` 与 `wechat-miniprogram/README.md`。

## 课表导入

「学在青大」支持本科生 / 研究生课表，仅保存在本机，不读取教务密码：

- **文件**：CSV（UTF-8 / UTF-16 / GBK 自动识别）或 WakeUp 等导出的 `.ics` 日历，最大 1 MB。
- **粘贴**：CSV 文本、日历内容或表格复制的纯文字。
- **手动**：逐条添加课程，设置第 1 周周一日期后按周查看节次、时间、地点与教师。
- 分享口令不会当作 CSV 解析，会提示改用日历文件；Excel 工作簿需先另存为 CSV。

解析逻辑：`utils/schedule-import.js` 统一分发，`utils/timetable.js` 处理 CSV 与周次，`utils/calendar-import.js` 展开日历重复规则，`utils/text-file.js` 处理编码识别。

## 测试

需要 Node.js 18+；地图数据测试另需 Python 与 `shapely`、`numpy`、`mapbox-earcut`。

```bash
node --test tests/*.test.cjs
python tests/test_map_data.py
python tools/package_miniprogram.py
```

打包脚本会校验入口文件齐全、无定位接口声明、餐饮三分类存在，并保证主包小于 1.5 MB，输出可直接导入的源码 ZIP 与 SHA256。

## 数据与隐私

- 课表与评分评论默认只保存在设备本机；评论在云函数或公开接口可用时才会匿名公开。
- 地图派生数据来自 OpenStreetMap，遵循 ODbL 1.0，© OpenStreetMap contributors；应用代码 MIT。
- 用户截图、卫星影像、签名私钥与线上内容不在本仓库中。
- 当前仓库仅为源码备份与协作使用；小程序与网站的发布、上传、审核须另行明确授权。
