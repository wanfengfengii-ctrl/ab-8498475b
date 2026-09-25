# 卫星太阳翼支撑垫选点裁决

卫星太阳翼展开试验前，从四条安装导轨各自批准的支撑垫候选点中各选一处，保证重心（CG）
存在横/纵测量偏差时，偏差矩形的**全部四个角点都严格位于支撑凸包内**，翼板不倾覆。

- 后端：Node.js + Express（ESM，无构建步骤）
- 前端：原生 HTML/CSS/JS + SVG（选点、支撑凸包、偏差矩形四角与稳定裕量垂线）
- 裁决：穷举四条导轨候选点的**完整笛卡尔组合**，逐组直接裁决

## 裁决规则

硬约束（全部满足才可行）：

1. 每条导轨**恰好**选一个点，且选点位于翼板批准边界（矩形）内；
2. 任意两个支撑垫间距 ≥ `minSpacing`；
3. 重心偏差矩形（标称 CG ± dx、±dy）四个角点到支撑凸包各边的有符号距离
   **严格为正**（落在边上即判失败，容差 1e-7 mm）；凸包退化（四点共线/重合）直接失败。

可行时的目标顺序：

1. **最大化**四角到凸包边界的最小有符号距离（min-margin）；
2. 并列时**最小化**四垫到标称重心的距离和；
3. 再并列时按导轨输入顺序的候选编号序列取字典序最小，保证方案唯一稳定。

无可行方案时：返回在全部组合中"最接近满足约束"的组合作为证据——
按最大约束缺口（越界量 / 间距缺口 / 角点到凸包边的距离缺口）最小、
违反约束组最少、候选序列最小排序，并逐项列出越界点、间距不足点对和最危险角点。

## 接口

`POST /api/fixture-plans`

```json
{
  "rails": [
    [{"x": 120, "y": 120}, {"x": 150, "y": 100}],
    [{"x": 850, "y": 110}],
    [{"x": 860, "y": 480}],
    [{"x": 130, "y": 470}]
  ],
  "boundary": {"min": {"x": 0, "y": 0}, "max": {"x": 1000, "y": 600}},
  "cg": {"x": 500, "y": 300},
  "deviation": {"x": 60, "y": 40},
  "minSpacing": 300
}
```

成功返回 `ok: true`，`result.feasible` 为 `true`/`false`；
请求非法返回 400 与中文校验信息。另提供 `GET /api/health` 健康检查。

## 本地运行

```bash
npm install
npm start          # http://localhost:8080
npm test           # node:test 单元 + 接口测试
npm run smoke      # HTTP 冒烟（需先启动服务，可用 BASE_URL 指定地址）
```

页面填入四条导轨候选点（每行 `x, y`）、翼板边界、标称重心、横纵偏差、最小间距，
点击"生成选点方案"后通过 POST 与服务联调；每次生成前会先撤下旧结果。
"载入无解示例"可查看失败证据展示。

## Docker

宿主机端口可通过 `HOST_PORT` 配置（默认 8080）：

```bash
HOST_PORT=9090 docker compose up -d app
# http://localhost:9090
```

镜像内置 `HEALTHCHECK`（轮询 `/api/health`），Compose 中 app 服务也声明了健康检查。

### 一次性验收服务 verify

`verify` 服务会先完成镜像构建，再依次运行代码测试与 HTTP 冒烟，
全部通过后自行退出并以退出码 0 报告验收通过，任一失败则非零退出：

```bash
docker compose build verify
docker compose up --abort-on-container-exit --exit-code-from verify verify
# 或： docker compose run --rm verify
```

## 目录结构

```
server/
  index.js      # 启动入口（含优雅关闭）
  app.mjs       # Express 应用与路由
  validate.mjs  # 请求校验/归一化
  planner.mjs   # 完整组合枚举与两级裁决、失败证据
  geometry.mjs  # 凸包/有符号距离等几何原语
public/         # 前端页面、样式、SVG 可视化
test/           # node:test 几何、规划器、HTTP 接口测试
scripts/smoke.mjs  # 一次性 HTTP 冒烟（退出码报告结果）
```
