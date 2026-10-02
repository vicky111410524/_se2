```markdown

母專案:https://github.com/hyjdidquiqofh/git-example/commits/main/
           *分支:https://github.com/hyjdidquiqofh/git-example/commits/developGitBranch/
子專案:https://github.com/vicky111410524/git-example/commits/main/

# Git & GitHub 實戰指南：分支、合併、Fork 與 Pull Request

本文件詳細記錄在 GitHub 上針對 **母專案 (`hyjdidquiqofh/git-example`)** 與 **子專案 Fork (`vicky111410524/git-example`)** 所執行的 Git 指令與 GitHub 介面動作。

---

## 網址與專案結構

* **母專案 (Main Repo)**：[hyjdidquiqofh/git-example (main)](https://github.com/hyjdidquiqofh/git-example/commits/main/)
  * **母專案開發分支**：[hyjdidquiqofh/git-example (developGitBranch)](https://github.com/hyjdidquiqofh/git-example/commits/developGitBranch/)
* **子專案 (Forked Repo)**：[vicky111410524/git-example (main)](https://github.com/vicky111410524/git-example/commits/main/)

---

## 工作流程說明 (Git Workflow)

本實作綜合運用了兩種標準的 Git 工作流程：

1. **GitHub Flow / Feature Branch Workflow（母專案內部開發）**
   * **核心概念**：保持 `main` 分支的穩定，所有新功能或修改都在獨立的功能分支（例如 `developGitBranch`）進行，開發完成並測試無誤後再合併回 `main`。
   * **適用場景**：團隊內部成員擁有母專案直接寫入權限時的協同開發。

2. **Forking Workflow（子專案跨庫貢獻）**
   * **核心概念**：外部貢獻者（或沒有母專案直接寫入權限的開發者）先將母專案 Fork 一份到自己的 GitHub 帳號下（`vicky111410524`），在個人的儲存庫完成修改後，再發起 Pull Request (PR) 請求母專案管理者審核並合併。
   * **適用場景**：開源專案貢獻、跨團隊開發或權限嚴格控管的企業環境。

---

## 一、 建立分支 (Branch)

在母專案中建立 `developGitBranch` 分支進行獨立開發。

### 本地指令操作

```bash
# 1. 複製母專案至本地（若尚未 clone）
git clone git@github.com:hyjdidquiqofh/git-example.git
cd git-example

# 2. 建立並切換至新分支 developGitBranch
git checkout -b developGitBranch

# 3. 進行檔案修改並提交變更
git add .
git commit -m "feat: 在 developGitBranch 完成功能開發"

# 4. 推送分支至母專案遠端
git push -u origin developGitBranch

```

> **紀錄連結**：母專案分支提交紀錄可於 [hyjdidquiqofh/git-example (developGitBranch)](https://github.com/hyjdidquiqofh/git-example/commits/developGitBranch/) 查看。

---

## 二、 合併分支 (Merge)

將 `developGitBranch` 的開發成果合併回母專案的 `main` 主幹。

### 本地指令操作

```bash
# 1. 切換回 main 主分支
git checkout main

# 2. 拉取遠端最新的 main 程式碼
git pull origin main

# 3. 將 developGitBranch 合併至當前的 main 分支
git merge developGitBranch

# 4. 將合併後的 main 推送至 GitHub 遠端
git push origin main

```

> **紀錄連結**：合併後的提交紀錄可於 [hyjdidquiqofh/git-example (main)](https://github.com/hyjdidquiqofh/git-example/commits/main/) 查看。

---

## 三、 Fork 專案 (Fork)

將母專案完整複製一份到自己的 GitHub 帳號下，建立子專案。

### GitHub 介面動作

1. 開啟母專案頁面：`https://github.com/hyjdidquiqofh/git-example`
2. 點擊頁面右上角的 **「Fork」** 按鈕。
3. 選擇複製目標為個人帳號 `vicky111410524`，點擊 **「Create fork」**。

### 本地複製與 upstream 設定

```bash
# 1. 將 Fork 後的子專案 Clone 到本地
git clone git@github.com:vicky111410524/git-example.git
cd git-example

# 2. 新增母專案為 upstream 遠端，以便日後同步母專案最新變更
git remote add upstream [https://github.com/hyjdidquiqofh/git-example.git](https://github.com/hyjdidquiqofh/git-example.git)

```

> **紀錄連結**：子專案頁面可於 [vicky111410524/git-example (main)](https://github.com/vicky111410524/git-example/commits/main/) 查看。

---

## 四、 提出 Pull Request (PR)

將子專案的修改請求合併至母專案。

### 1. 本地開發與推送 (子專案)

```bash
# 在子專案本地進行修改並提交
git add .
git commit -m "docs: 透過 Fork 修改並準備發起 PR"

# 推送至個人的 Fork 遠端庫 (origin)
git push origin main

```

### 2. GitHub 介面動作 (發起 PR)

1. 前往子專案 GitHub 頁面：`https://github.com/vicky111410524/git-example`
2. 點擊黃色提示區塊的 **「Compare & pull request」** 或切換至 **Pull requests** 分頁點擊 **「New pull request」**。
3. 設定比較分支方向：
* **Base repository**: `hyjdidquiqofh/git-example` | **base**: `main`
* **Head repository**: `vicky111410524/git-example` | **compare**: `main`


4. 撰寫 PR 標題與變更說明，點擊 **「Create pull request」**。
5. 等待母專案管理員（`hyjdidquiqofh`）審核並執行 Merge 操作。

---
