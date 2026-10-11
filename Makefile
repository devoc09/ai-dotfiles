SHELL := /bin/bash

REPO := $(CURDIR)

# Pi
PI_DIR := $(HOME)/.pi/agent

# Pi が読む共有スキルのハブ
SKILLS_DIR := $(HOME)/.agents/skills

# 外部ソース。実体は本リポジトリに置かず、ここへリンクだけ張る
OPENCODE_SKILLS := $(HOME)/.config/opencode/skills
CLAUDE_SKILLS   := $(HOME)/.claude/skills
PLUGIN_DIR      := $(HOME)/.claude/plugins/marketplaces

# 外部リポジトリ由来（更新は skills CLI / 上流に任せる）
EXTERNAL_SKILLS := eli5 explainer
# ponytail プラグイン同梱
PONYTAIL_SKILLS := ponytail ponytail-audit ponytail-debt ponytail-gain ponytail-help ponytail-review

.PHONY: all pi skills claude

all: pi skills

# Pi の設定ファイルをリンクする（実体は本リポジトリ）
pi:
	mkdir -p $(PI_DIR)
	ln -sf $(REPO)/pi/settings.json    $(PI_DIR)/settings.json
	ln -sf $(REPO)/pi/keybindings.json $(PI_DIR)/keybindings.json
	ln -sf $(REPO)/pi/AGENTS.md        $(PI_DIR)/AGENTS.md

# ~/.agents/skills を再構築する
skills:
	mkdir -p $(SKILLS_DIR)
	ln -sfn $(REPO)/skills/finding-vim-patches $(SKILLS_DIR)/finding-vim-patches
	@for s in $(EXTERNAL_SKILLS); do \
		ln -sfn $(OPENCODE_SKILLS)/$$s $(SKILLS_DIR)/$$s; \
	done
	@for s in $(PONYTAIL_SKILLS); do \
		ln -sfn $(PLUGIN_DIR)/ponytail/skills/$$s $(SKILLS_DIR)/$$s; \
	done
	ln -sfn $(PLUGIN_DIR)/i-have-adhd/skills/i-have-adhd $(SKILLS_DIR)/i-have-adhd

# Claude Code / opencode からも同じスキルを使う場合
claude:
	mkdir -p $(CLAUDE_SKILLS)
	ln -sfn $(REPO)/skills/finding-vim-patches $(CLAUDE_SKILLS)/finding-vim-patches
