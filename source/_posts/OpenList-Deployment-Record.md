---
title: OpenList Deployment Record
cover: false
date: 2026-03-05 14:15:00
tags:
categories:
keywords:
description:
---
# 踩坑记录：ClawCloud 部署 OpenList （解决官方模板权限报错问题)

最近想在 ClawCloud 上部署 OpenList 实现文件索引与分享，本以为用平台 AppStore 一键部署能省事儿，结果踩了不少坑 

## 一、部署背景

### 1. 工具选择

- **部署平台**：ClawCloud（海外免费容器云，每月 5 美元永久额度，足够个人轻量使用）
- **部署应用**：OpenList

- **需求**：一键部署失败，手动解决权限问题，实现正常访问 + 自定义域名

### 2. 核心报错问题

从 ClawCloud AppStore 一键部署后，容器启动失败，查看日志出现核心报错：

```log
2026-03-05 12:07:29                                                        错误：当前用户没有 ./data 目录（/opt/openlist/data）的写和/或执行权限。
openlist-yxprkbpz
openlist-yxprkbpz-0
stdout
2026-03-05 12:07:29                                                       请访问 https://doc.oplist.org/guide/installation/docker#v4-1-0-%E4%BB%A5%E5%90%8E%E7%89%88%E6%9C%AC 获取更多信息。
openlist-yxprkbpz
openlist-yxprkbpz-0
stdout
2026-03-05 12:07:29              Exiting...```
```

## 二、问题根源分析

OpenList v4.1.0+ 版本做了权限优化：

1. 移除了原有的 PUID、PGID 环境变量，内置创建了`openlist`用户（UID 1001/GID 1001），并强制以该非 root 用户运行服务；
2. ClawCloud 官方 AppStore 的 OpenList 模板未同步适配该版本变化，未做目录权限初始化，导致容器内 1001 用户无`/opt/openlist/data`目录的读写权限；
3. 直接在 ClawCloud 中执行`chown`等命令会因权限不足失败，平台对普通容器操作做了权限限制。

## 三、解决方案：使用修复后的自定义模板部署

核心思路：**通过 Init 容器提前初始化目录权限**，Init 容器以 root 身份运行，完成权限修复后再启动 OpenList 主容器，从根源解决权限问题。

该方案来自 OpenList 官方 issue 的社区贡献者修复方案

参考以下教程分享



[claw cloud部署v4.1.1提示config权限被拒绝 · Issue #1209 · OpenListTeam/OpenList](https://github.com/OpenListTeam/OpenList/issues/1209#issuecomment-3243803024)

[OpenList最新版部署到ClawCloud - 开发调优 - LINUX DO](https://linux.do/t/topic/892966/23)

过程就不重复写了，因为Linux.do的贴子讲的很清楚

最后采用了如下配置

``` yaml
apiVersion: app.claw.cloud/v1
kind: Template
metadata:
  name: openlist
spec:
  title: "OpenList"
  type: official
  author: ClawCloud Run
  author_id: 180503656
  date: 2025-07-25
  url: "https://github.com/OpenListTeam/OpenList"
  gitRepo: "https://github.com/OpenListTeam/OpenList"
  description: "A file list/WebDAV program that supports multiple storages, powered by Gin and Solidjs."
  readme: "https://raw.githubusercontent.com/ClawCloud/Run-Template/refs/heads/main/template/openlist/README.md"
  icon: "https://raw.githubusercontent.com/OpenListTeam/Logo/main/logo.svg"
  templateType: inline
  locale: en
  categories:
    - tool
    - Free-Plan-Compatible
  defaults:
    app_host:
      type: string
      value: ${{ random(8) }}
    app_name:
      type: string
      value: openlist-${{ random(8) }}
  inputs:
    USERNAME:
      description: "Default Username"
      type: choice
      options:
        - admin
      default: admin
      required: true
    PASSWORD:
      description: "Default Password"
      type: string
      default: ""
      required: true

---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: ${{ defaults.app_name }}
  annotations:
    originImageName: openlistteam/openlist:latest-lite
    deploy.run.claw.cloud/minReplicas: "1"
    deploy.run.claw.cloud/maxReplicas: "1"
  labels:
    run.claw.cloud/app-deploy-manager: ${{ defaults.app_name }}
    app: ${{ defaults.app_name }}
spec:
  replicas: 1
  revisionHistoryLimit: 1
  minReadySeconds: 10
  serviceName: ${{ defaults.app_name }}
  selector:
    matchLabels:
      app: ${{ defaults.app_name }}
  template:
    metadata:
      labels:
        app: ${{ defaults.app_name }}
    spec:
      terminationGracePeriodSeconds: 10
      automountServiceAccountToken: false
      initContainers:
        - name: fix-permissions
          image: busybox:1.36
          command: ['sh', '-c', 'chown -R 1001:1001 /opt/openlist/data && chmod -R 777 /opt/openlist/data']
          volumeMounts:
            - name: vn-data
              mountPath: /opt/openlist/data
          securityContext:
            runAsUser: 0
            runAsGroup: 0
      containers:
        - name: ${{ defaults.app_name }}
          image: openlistteam/openlist:latest-lite
          env:
            - name: TZ
              value: Asia/Shanghai
            - name: UMASK
              value: "022"
            - name: OPENLIST_ADMIN_PASSWORD
              value: ${{ inputs.PASSWORD }}
          resources:
            requests:
              cpu: 20m
              memory: 64Mi
            limits:
              cpu: 200m
              memory: 640Mi
          command: []
          args: []
          ports:
            - containerPort: 5244
          imagePullPolicy: IfNotPresent
          volumeMounts:
            - name: vn-data
              mountPath: /opt/openlist/data
      volumes: []
  volumeClaimTemplates:
    - metadata:
        annotations:
          path: /opt/openlist/data
          value: "1"
        name: vn-data
      spec:
        accessModes:
          - ReadWriteOnce
        resources:
          requests:
            storage: 1Gi

---
apiVersion: v1
kind: Service
metadata:
  name: ${{ defaults.app_name }}
  labels:
    run.claw.cloud/app-deploy-manager: ${{ defaults.app_name }}
spec:
  ports:
    - port: 5244
  selector:
    app: ${{ defaults.app_name }}

---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${{ defaults.app_name }}
  labels:
    run.claw.cloud/app-deploy-manager: ${{ defaults.app_name }}
    run.claw.cloud/app-deploy-manager-domain: ${{ defaults.app_host }}
  annotations:
    kubernetes.io/ingress.class: nginx
    nginx.ingress.kubernetes.io/proxy-body-size: 512m
    nginx.ingress.kubernetes.io/proxy-send-timeout: "600"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "600"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/backend-protocol: HTTP
spec:
  rules:
    - host: ${{ defaults.app_host }}.${{ CLAWCLOUD_CLOUD_DOMAIN }}
      http:
        paths:
          - pathType: Prefix
            path: /
            backend:
              service:
                name: ${{ defaults.app_name }}
                port:
                  number: 5244
  tls:
    - hosts:
        - ${{ defaults.app_host }}.${{ CLAWCLOUD_CLOUD_DOMAIN }}
      secretName: ${{ CLAWCLOUD_CERT_SECRET_NAME }}

---
apiVersion: app.claw.cloud/v1
kind: App
metadata:
  name: ${{ defaults.app_name }}
  labels:
    run.claw.cloud/app-deploy-manager: ${{ defaults.app_name }}
spec:
  data:
    url: https://${{ defaults.app_host }}.${{ CLAWCLOUD_CLOUD_DOMAIN }}
  displayType: normal
  icon: "https://raw.githubusercontent.com/OpenListTeam/Logo/main/logo.svg"
  name: OpenList
  type: link
```

## 四、其他失误

- 绑定了域名后怎么访问都不生效，

> 是自己忘了点updata🤡🤡🤡

- 进去爪云发现部署的pod没了

> 原来是要选择服务区域![image-20260305144148458](https://image.czjun.top/2026/03/0f49a0694d35f1b4c03b8d0e3d7052ab.png)



- 坚果云webdav能连接但是无法下载查看

> ``` js
> {"id":4,"mount_path":"/坚果云","order":0,"driver":"WebDav","cache_expiration":30,"custom_cache_policies":"","status":"work","addition":"{\"vendor\":\"jianguoyun\",\"address\":\"https://dav.jianguoyun.com/dav/\",\"username\":\"你的账号\",\"password\":\"你的密码\",\"root_folder_path\":\"/\",\"tls_insecure_skip_verify\":false}","remark":"","modified":"2026-03-05T15:45:07.317700611+08:00","disabled":false,"disable_index":false,"enable_sign":false,"order_by":"","order_direction":"","extract_folder":"","web_proxy":true,"webdav_policy":"302_redirect","proxy_range":false,"down_proxy_url":"","disable_proxy_sign":true}
> ```
>
> 直接用这个试试吧，主要问题是容易触发风控



# 五、总结

这次在 ClawCloud 上部署 OpenList，主要踩了三个坑：

1. **权限问题**

   OpenList 4.1.0 之后改用 1001 用户运行，官方一键模板没处理目录权限，直接启动失败。

   用 **initContainers 提前修复权限** 就好了。

   

2. **平台操作失误**

   绑定域名忘了点 update，Pod 消失是因为选错服务区，都是小细节但很坑。

   

3. **坚果云 WebDAV 不能用**

   能列表不能下载，基本都是 **海外 IP 被坚果云风控**，401/500 是常态。

   想稳定用要么换国内服务器，不过最后我还是用302重定向就是。
