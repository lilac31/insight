// Storage Manager
class StorageManager {
    constructor() {
        this.STORAGE_KEY = 'insight_notes';
        this.CUSTOM_TAGS_KEY = 'insight_custom_tags';
        this.DRAFT_KEY = 'insight_draft';
        this.BACKUP_KEY = 'insight_backup';
        this.TAG_COLORS_KEY = 'insight_tag_colors';
    }

    getNotes() {
        const data = localStorage.getItem(this.STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    }

    saveNotes(notes) {
        try {
            // 保存主数据
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(notes));
            // 创建备份
            this.createBackup(notes);
        } catch (e) {
            console.error('保存笔记失败:', e);
            alert('保存失败，可能是存储空间不足。请导出数据备份！');
        }
    }

    addNote(note) {
        const notes = this.getNotes();
        notes.unshift(note);
        this.saveNotes(notes);
    }

    updateNote(id, updatedContent) {
        const notes = this.getNotes();
        const index = notes.findIndex(note => note.id === id);
        if (index !== -1) {
            notes[index].content = updatedContent;
            notes[index].tags = this.extractTags(updatedContent);
            notes[index].updatedAt = new Date().toISOString();
            this.saveNotes(notes);
        }
    }

    deleteNote(id) {
        const notes = this.getNotes();
        const filtered = notes.filter(note => note.id !== id);
        this.saveNotes(filtered);
    }

    extractTags(content) {
        const tagRegex = /#[\u4e00-\u9fa5a-zA-Z0-9_]+/g;
        const matches = content.match(tagRegex);
        return matches ? [...new Set(matches)] : [];
    }

    // Custom Tags Management
    getCustomTags() {
        const data = localStorage.getItem(this.CUSTOM_TAGS_KEY);
        return data ? JSON.parse(data) : [];
    }

    saveCustomTags(tags) {
        try {
            localStorage.setItem(this.CUSTOM_TAGS_KEY, JSON.stringify(tags));
        } catch (e) {
            console.error('保存标签失败:', e);
        }
    }

    addCustomTag(tagName) {
        const tags = this.getCustomTags();
        // Ensure tag starts with #
        const formattedTag = tagName.startsWith('#') ? tagName : `#${tagName}`;
        
        // Check if tag already exists
        if (tags.some(t => t.name === formattedTag)) {
            return false;
        }

        const newTag = {
            id: Date.now().toString(),
            name: formattedTag,
            createdAt: new Date().toISOString()
        };

        tags.unshift(newTag);
        this.saveCustomTags(tags);
        return true;
    }

    deleteCustomTag(id) {
        const tags = this.getCustomTags();
        const filtered = tags.filter(tag => tag.id !== id);
        this.saveCustomTags(filtered);
    }

    // Tag Colors Management
    getTagColors() {
        const data = localStorage.getItem(this.TAG_COLORS_KEY);
        return data ? JSON.parse(data) : {};
    }

    saveTagColor(tagName, colorIndex) {
        const colors = this.getTagColors();
        colors[tagName] = colorIndex;
        localStorage.setItem(this.TAG_COLORS_KEY, JSON.stringify(colors));
    }

    getTagColor(tagName) {
        const colors = this.getTagColors();
        if (colors[tagName] !== undefined) {
            return colors[tagName];
        }
        // 默认根据标签名生成颜色
        let hash = 0;
        for (let i = 0; i < tagName.length; i++) {
            hash = tagName.charCodeAt(i) + ((hash << 5) - hash);
        }
        return Math.abs(hash) % 8;
    }

    // Draft Management (草稿自动保存)
    saveDraft(content) {
        try {
            localStorage.setItem(this.DRAFT_KEY, JSON.stringify({
                content: content,
                savedAt: new Date().toISOString()
            }));
        } catch (e) {
            console.error('保存草稿失败:', e);
        }
    }

    getDraft() {
        const data = localStorage.getItem(this.DRAFT_KEY);
        return data ? JSON.parse(data) : null;
    }

    clearDraft() {
        localStorage.removeItem(this.DRAFT_KEY);
    }

    // Backup Management (自动备份)
    createBackup(notes) {
        try {
            const backup = {
                notes: notes,
                customTags: this.getCustomTags(),
                timestamp: new Date().toISOString()
            };
            localStorage.setItem(this.BACKUP_KEY, JSON.stringify(backup));
        } catch (e) {
            console.error('创建备份失败:', e);
        }
    }

    getBackup() {
        const data = localStorage.getItem(this.BACKUP_KEY);
        return data ? JSON.parse(data) : null;
    }

    // Export/Import (数据导出导入)
    exportData() {
        const data = {
            notes: this.getNotes(),
            customTags: this.getCustomTags(),
            exportTime: new Date().toISOString(),
            version: '1.0'
        };
        return JSON.stringify(data, null, 2);
    }

    importData(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            if (data.notes && Array.isArray(data.notes)) {
                this.saveNotes(data.notes);
            }
            if (data.customTags && Array.isArray(data.customTags)) {
                this.saveCustomTags(data.customTags);
            }
            return true;
        } catch (e) {
            console.error('导入数据失败:', e);
            return false;
        }
    }
}

// App Manager
class InsightApp {
    constructor() {
        this.storage = new StorageManager();
        this.cloudSync = new WebDAVSyncManager(this.storage); // 切换到 WebDAV
        this.notes = [];
        this.customTags = [];
        this.currentFilter = 'all';
        this.currentEditingId = null;
        this.draftSaveTimer = null;
        
        this.initElements();
        this.initEventListeners();
        this.loadNotes();
        this.loadCustomTags();
        this.updateTagsFilter();
        this.restoreDraft();
        this.initAutoSave();
        this.initBeforeUnload();
        this.cloudSync.startAutoSync();
    }

    initElements() {
        // Input
        this.noteInput = document.getElementById('noteInput');
        this.saveBtn = document.getElementById('saveBtn');
        this.tagsBarList = document.getElementById('tagsBarList');
        this.tagDropdown = document.getElementById('tagDropdown');
        this.tagDropdownList = document.getElementById('tagDropdownList');

        // Lists
        this.notesList = document.getElementById('notesList');
        this.tagsFilter = document.getElementById('tagsFilter');
        
        // Dropdown state
        this.dropdownVisible = false;
        this.dropdownSelectedIndex = -1;
        this.dropdownItems = [];
        this.hashPosition = -1;

        // Modals
        this.searchModal = document.getElementById('searchModal');
        this.searchInput = document.getElementById('searchInput');
        this.searchResults = document.getElementById('searchResults');
        this.statsModal = document.getElementById('statsModal');
        this.noteModal = document.getElementById('noteModal');
        this.editNoteInput = document.getElementById('editNoteInput');
        this.tagsModal = document.getElementById('tagsModal');
        this.syncModal = document.getElementById('syncModal');

        // Tags Management
        this.newTagInput = document.getElementById('newTagInput');
        this.addTagBtn = document.getElementById('addTagBtn');
        this.customTagsList = document.getElementById('customTagsList');
        this.usedTagsList = document.getElementById('usedTagsList');

        // Buttons
        this.searchBtn = document.getElementById('searchBtn');
        this.closeSearchBtn = document.getElementById('closeSearchBtn');
        this.statsBtn = document.getElementById('statsBtn');
        this.closeStatsBtn = document.getElementById('closeStatsBtn');
        this.closeNoteBtn = document.getElementById('closeNoteBtn');
        this.deleteBtn = document.getElementById('deleteBtn');
        this.updateBtn = document.getElementById('updateBtn');
        this.tagsBtn = document.getElementById('tagsBtn');
        this.closeTagsBtn = document.getElementById('closeTagsBtn');
        this.exportBtn = document.getElementById('exportBtn');
        this.syncBtn = document.getElementById('syncBtn');
        
        // WebDAV Sync Elements
        this.closeSyncBtn = document.getElementById('closeSyncBtn');
        this.webdavServer = document.getElementById('webdavServer');
        this.webdavUsername = document.getElementById('webdavUsername');
        this.webdavPassword = document.getElementById('webdavPassword');
        this.testWebdavBtn = document.getElementById('testWebdavBtn');
        this.connectWebdavBtn = document.getElementById('connectWebdavBtn');
        this.webdavConnected = document.getElementById('webdavConnected');
        this.webdavSyncUpBtn = document.getElementById('webdavSyncUpBtn');
        this.webdavSyncDownBtn = document.getElementById('webdavSyncDownBtn');
        this.webdavReconfigBtn = document.getElementById('webdavReconfigBtn');
        this.disconnectWebdavBtn = document.getElementById('disconnectWebdavBtn');
        this.downloadBackupBtn = document.getElementById('downloadBackupBtn');
        this.uploadBackupBtn = document.getElementById('uploadBackupBtn');
        this.fileInput = document.getElementById('fileInput');
        this.autoSyncEnabled = document.getElementById('autoSyncEnabled');
        this.syncInterval = document.getElementById('syncInterval');
        this.syncSettings = document.getElementById('syncSettings');

        // Debug: 检查关键元素是否存在
        const missingElements = [];
        if (!this.syncBtn) missingElements.push('syncBtn');
        if (!this.exportBtn) missingElements.push('exportBtn');
        if (!this.tagsBtn) missingElements.push('tagsBtn');
        if (!this.searchBtn) missingElements.push('searchBtn');
        if (!this.statsBtn) missingElements.push('statsBtn');
        
        if (missingElements.length > 0) {
            console.error('❌ 缺少的元素:', missingElements.join(', '));
        } else {
            console.log('✅ 所有按钮元素已加载');
        }
    }

    initEventListeners() {
        // Input
        this.noteInput.addEventListener('input', (e) => {
            this.handleTagDropdown(e);
            this.saveDraftDebounced();
        });
        
        this.noteInput.addEventListener('click', () => {
            this.handleTagDropdown();
        });
        
        this.saveBtn.addEventListener('click', () => this.saveNote());
        
        this.noteInput.addEventListener('keydown', (e) => {
            // Handle dropdown navigation
            if (this.dropdownVisible) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.moveDropdownSelection(1);
                    return;
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    this.moveDropdownSelection(-1);
                    return;
                } else if (e.key === 'Enter' && this.dropdownSelectedIndex >= 0) {
                    e.preventDefault();
                    this.selectDropdownItem(this.dropdownSelectedIndex);
                    return;
                } else if (e.key === 'Escape') {
                    this.hideTagDropdown();
                    return;
                }
            }
            
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                this.saveNote();
            }
        });
        
        // Click outside to close dropdown
        document.addEventListener('click', (e) => {
            if (!this.noteInput.contains(e.target) && !this.tagDropdown.contains(e.target)) {
                this.hideTagDropdown();
            }
        });

        // Search
        this.searchBtn.addEventListener('click', () => this.openSearchModal());
        this.closeSearchBtn.addEventListener('click', () => this.closeModal(this.searchModal));
        this.searchInput.addEventListener('input', () => this.performSearch());

        // Stats
        this.statsBtn.addEventListener('click', () => this.openStatsModal());
        this.closeStatsBtn.addEventListener('click', () => this.closeModal(this.statsModal));

        // Note Edit
        this.closeNoteBtn.addEventListener('click', () => this.closeModal(this.noteModal));
        this.deleteBtn.addEventListener('click', () => this.deleteCurrentNote());
        this.updateBtn.addEventListener('click', () => this.updateCurrentNote());

        // Tags Management
        this.tagsBtn.addEventListener('click', () => this.openTagsModal());
        this.closeTagsBtn.addEventListener('click', () => this.closeModal(this.tagsModal));
        this.addTagBtn.addEventListener('click', () => this.addCustomTag());
        this.newTagInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.addCustomTag();
            }
        });

        // Export Data
        this.exportBtn.addEventListener('click', () => this.exportAllData());
        
        // Cloud Sync
        // Cloud Sync - WebDAV
        this.syncBtn.addEventListener('click', () => this.openSyncModal());
        this.closeSyncBtn.addEventListener('click', () => this.closeModal(this.syncModal));
        
        if (this.testWebdavBtn) {
            this.testWebdavBtn.addEventListener('click', () => this.testWebDAVConnection());
        }
        if (this.connectWebdavBtn) {
            this.connectWebdavBtn.addEventListener('click', () => this.connectWebDAV());
        }
        if (this.webdavSyncUpBtn) {
            this.webdavSyncUpBtn.addEventListener('click', () => this.handleWebDAVSyncUp());
        }
        if (this.webdavSyncDownBtn) {
            this.webdavSyncDownBtn.addEventListener('click', () => this.handleWebDAVSyncDown());
        }
        if (this.webdavReconfigBtn) {
            this.webdavReconfigBtn.addEventListener('click', () => this.reconfigureWebDAV());
        }
        if (this.disconnectWebdavBtn) {
            this.disconnectWebdavBtn.addEventListener('click', () => this.disconnectWebDAV());
        }
        
        this.downloadBackupBtn.addEventListener('click', () => this.exportAllData());
        this.uploadBackupBtn.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => {
            if (e.target.files[0]) {
                this.importAllData(e.target.files[0]);
            }
        });
        this.autoSyncEnabled.addEventListener('change', (e) => {
            this.cloudSync.setAutoSyncEnabled(e.target.checked);
        });
        this.syncInterval.addEventListener('change', (e) => {
            this.cloudSync.setSyncInterval(parseInt(e.target.value));
        });

        // Modal backdrop
        [this.searchModal, this.statsModal, this.noteModal, this.tagsModal, this.syncModal].forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal(modal);
                }
            });
        });
    }

    updateCharCount() {
        // 已移除字符计数功能
    }

    saveNote() {
        const content = this.noteInput.value.trim();
        if (!content) {
            this.noteInput.classList.add('shake');
            setTimeout(() => this.noteInput.classList.remove('shake'), 300);
            return;
        }

        const note = {
            id: Date.now().toString(),
            content: content,
            tags: this.storage.extractTags(content),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.storage.addNote(note);
        this.notes.unshift(note);
        this.noteInput.value = '';
        this.storage.clearDraft(); // 清除草稿
        this.renderNotes();
        this.updateTagsFilter();
        this.renderTagsBar();
    }

    loadNotes() {
        this.notes = this.storage.getNotes();
        this.renderNotes();
    }

    renderNotes() {
        const filteredNotes = this.currentFilter === 'all' 
            ? this.notes 
            : this.notes.filter(note => note.tags.includes(this.currentFilter));

        if (filteredNotes.length === 0) {
            this.notesList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📝</div>
                    <p>${this.currentFilter === 'all' ? '还没有笔记' : '该标签下没有笔记'}</p>
                    <p class="empty-hint">开始记录你的第一个想法吧</p>
                </div>
            `;
            return;
        }

        this.notesList.innerHTML = filteredNotes.map(note => this.createNoteCard(note)).join('');

        // Add click listeners
        document.querySelectorAll('.note-card').forEach(card => {
            card.addEventListener('click', () => {
                const id = card.dataset.id;
                this.openEditModal(id);
            });
        });
    }

    createNoteCard(note) {
        const content = this.highlightTags(note.content);
        const timeStr = this.formatTime(note.createdAt);

        return `
            <div class="note-card" data-id="${note.id}">
                <div class="note-time">${timeStr}</div>
                <div class="note-content">${content}</div>
            </div>
        `;
    }

    highlightTags(content) {
        return content.replace(/#[\u4e00-\u9fa5a-zA-Z0-9_]+/g, match => {
            const colorIndex = this.getTagColor(match);
            return `<span class="hashtag" data-color="${colorIndex}">${match}</span>`;
        });
    }

    formatTime(isoString) {
        const date = new Date(isoString);
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return '刚刚';
        if (minutes < 60) return `${minutes}分钟前`;
        if (hours < 24) return `${hours}小时前`;
        if (days < 7) return `${days}天前`;

        return date.toLocaleDateString('zh-CN', { 
            month: '2-digit', 
            day: '2-digit' 
        });
    }

    updateTagsFilter() {
        const allTags = new Map();
        this.notes.forEach(note => {
            note.tags.forEach(tag => {
                allTags.set(tag, (allTags.get(tag) || 0) + 1);
            });
        });

        const allCount = this.notes.length;
        document.getElementById('allCount').textContent = allCount;

        const sortedTags = Array.from(allTags.entries())
            .sort((a, b) => b[1] - a[1]);

        const tagsHTML = sortedTags.map(([tag, count]) => `
            <button class="tag-chip" data-tag="${tag}">
                ${tag} <span class="tag-count">${count}</span>
            </button>
        `).join('');

        // Keep the "all" button and add other tags
        const allButton = this.tagsFilter.querySelector('[data-tag="all"]');
        this.tagsFilter.innerHTML = '';
        this.tagsFilter.appendChild(allButton);
        this.tagsFilter.insertAdjacentHTML('beforeend', tagsHTML);

        // Update active state
        this.tagsFilter.querySelectorAll('.tag-chip').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.tag === this.currentFilter);
            chip.addEventListener('click', () => {
                this.currentFilter = chip.dataset.tag;
                this.updateTagsFilter();
                this.renderNotes();
            });
        });
    }

    // Search
    openSearchModal() {
        this.searchModal.classList.add('active');
        document.body.classList.add('modal-open');
        this.searchInput.value = '';
        this.searchResults.innerHTML = '';
        setTimeout(() => this.searchInput.focus(), 100);
    }

    performSearch() {
        const query = this.searchInput.value.trim().toLowerCase();
        
        if (!query) {
            this.searchResults.innerHTML = '';
            return;
        }

        const results = this.notes.filter(note => 
            note.content.toLowerCase().includes(query)
        );

        if (results.length === 0) {
            this.searchResults.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🔍</div>
                    <p>没有找到相关笔记</p>
                </div>
            `;
            return;
        }

        this.searchResults.innerHTML = results.map(note => {
            const highlightedContent = this.highlightSearchTerm(note.content, query);
            const timeStr = this.formatTime(note.createdAt);
            
            return `
                <div class="search-result-item" data-id="${note.id}">
                    <div class="search-result-content">${highlightedContent}</div>
                    <div class="note-time">${timeStr}</div>
                </div>
            `;
        }).join('');

        // Add click listeners
        this.searchResults.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                this.closeModal(this.searchModal);
                this.openEditModal(item.dataset.id);
            });
        });
    }

    highlightSearchTerm(content, query) {
        const regex = new RegExp(`(${query})`, 'gi');
        return content.replace(regex, '<span class="search-highlight">$1</span>');
    }

    // Stats
    openStatsModal() {
        this.statsModal.classList.add('active');
        document.body.classList.add('modal-open');
        this.updateStats();
    }

    updateStats() {
        const allTags = new Set();
        this.notes.forEach(note => {
            note.tags.forEach(tag => allTags.add(tag));
        });

        const today = new Date().toDateString();
        const todayNotes = this.notes.filter(note => 
            new Date(note.createdAt).toDateString() === today
        ).length;

        document.getElementById('totalNotes').textContent = this.notes.length;
        document.getElementById('totalTags').textContent = allTags.size;
        document.getElementById('todayNotes').textContent = todayNotes;
        document.getElementById('streak').textContent = this.calculateStreak();

        this.renderHeatmap();
    }

    calculateStreak() {
        if (this.notes.length === 0) return 0;

        const dates = [...new Set(this.notes.map(note => 
            new Date(note.createdAt).toDateString()
        ))].sort((a, b) => new Date(b) - new Date(a));

        let streak = 0;
        let currentDate = new Date();

        for (let i = 0; i < dates.length; i++) {
            const noteDate = new Date(dates[i]);
            const dayDiff = Math.floor((currentDate - noteDate) / 86400000);

            if (dayDiff === streak) {
                streak++;
            } else {
                break;
            }
        }

        return streak;
    }

    renderHeatmap() {
        const heatmap = document.getElementById('heatmap');
        const last49Days = [];
        const today = new Date();

        // Generate last 49 days (7 weeks)
        for (let i = 48; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            last49Days.push(date.toDateString());
        }

        // Count notes per day
        const notesPerDay = new Map();
        this.notes.forEach(note => {
            const dateStr = new Date(note.createdAt).toDateString();
            notesPerDay.set(dateStr, (notesPerDay.get(dateStr) || 0) + 1);
        });

        // Find max for scaling
        const maxNotes = Math.max(...Array.from(notesPerDay.values()), 0);

        // Render cells
        heatmap.innerHTML = last49Days.map(dateStr => {
            const count = notesPerDay.get(dateStr) || 0;
            const level = maxNotes === 0 ? 0 : Math.ceil((count / maxNotes) * 4);
            
            return `<div class="heatmap-cell level-${level}" title="${dateStr}: ${count} 条"></div>`;
        }).join('');
    }

    // Edit Note
    openEditModal(id) {
        const note = this.notes.find(n => n.id === id);
        if (!note) return;

        this.currentEditingId = id;
        this.editNoteInput.value = note.content;
        this.noteModal.classList.add('active');
        document.body.classList.add('modal-open');
        setTimeout(() => this.editNoteInput.focus(), 100);
    }

    updateCurrentNote() {
        const content = this.editNoteInput.value.trim();
        if (!content) {
            this.editNoteInput.classList.add('shake');
            setTimeout(() => this.editNoteInput.classList.remove('shake'), 300);
            return;
        }

        this.storage.updateNote(this.currentEditingId, content);
        this.loadNotes();
        this.renderNotes();
        this.updateTagsFilter();
        this.closeModal(this.noteModal);
    }

    deleteCurrentNote() {
        if (!confirm('确定要删除这条笔记吗？')) return;

        this.storage.deleteNote(this.currentEditingId);
        this.loadNotes();
        this.renderNotes();
        this.updateTagsFilter();
        this.closeModal(this.noteModal);
    }

    closeModal(modal) {
        modal.classList.remove('active');
        document.body.classList.remove('modal-open');
    }

    openModal(modal) {
        modal.classList.add('active');
        document.body.classList.add('modal-open');
    }

    // Tags Bar (输入框下方显示所有标签)
    renderTagsBar() {
        const allTags = this.getAllTagsWithUsage();
        
        if (allTags.length === 0) {
            this.tagsBarList.innerHTML = '<div class="tags-bar-empty">暂无标签，点击右上角标签图标创建</div>';
            return;
        }

        this.tagsBarList.innerHTML = allTags.map((tag, index) => {
            const colorIndex = this.getTagColor(tag.name);
            return `
                <div class="tag-bar-item" data-color="${colorIndex}">
                    <span class="tag-bar-item-name">${tag.name}</span>
                    <span class="tag-bar-item-count">${tag.count}</span>
                    <span class="tag-bar-delete" data-tag="${tag.name}">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                    </span>
                </div>
            `;
        }).join('');

        // Add delete listeners
        this.tagsBarList.querySelectorAll('.tag-bar-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteCustomTagFromBar(btn.dataset.tag);
            });
        });

        // Add click listeners to insert tag into input
        this.tagsBarList.querySelectorAll('.tag-bar-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.tag-bar-delete')) return;
                const tagName = item.querySelector('.tag-bar-item-name').textContent;
                this.insertTagToInputArea(tagName);
            });
        });
    }

    getTagColor(tagName) {
        // 使用 storage 的颜色管理方法
        return this.storage.getTagColor(tagName);
    }

    getAllTagsWithUsage() {
        // 获取所有自定义标签和已使用标签
        const customTags = this.storage.getCustomTags();
        const usageMap = new Map();

        // 统计使用次数
        this.notes.forEach(note => {
            note.tags.forEach(tag => {
                usageMap.set(tag, (usageMap.get(tag) || 0) + 1);
            });
        });

        // 合并并排序（自定义标签优先，然后按使用次数）
        const allTags = [];
        const customTagNames = new Set(customTags.map(t => t.name));

        // 先添加自定义标签
        customTags.forEach(tag => {
            allTags.push({
                name: tag.name,
                count: usageMap.get(tag.name) || 0,
                isCustom: true
            });
        });

        // 再添加非自定义但被使用的标签
        usageMap.forEach((count, tagName) => {
            if (!customTagNames.has(tagName)) {
                allTags.push({
                    name: tagName,
                    count: count,
                    isCustom: false
                });
            }
        });

        // 按使用次数排序
        allTags.sort((a, b) => b.count - a.count);

        return allTags;
    }

    // Tag Dropdown (输入#时在光标下方显示)
    handleTagDropdown() {
        const value = this.noteInput.value;
        const cursorPos = this.noteInput.selectionStart;
        
        // 找到光标前的文本
        const textBeforeCursor = value.substring(0, cursorPos);
        const lastHashIndex = textBeforeCursor.lastIndexOf('#');
        
        // 检查是否在标签上下文中
        if (lastHashIndex === -1) {
            this.hideTagDropdown();
            return;
        }
        
        // 检查#和光标之间是否有空格或换行
        const textAfterHash = textBeforeCursor.substring(lastHashIndex);
        if (textAfterHash.includes(' ') || textAfterHash.includes('\n')) {
            this.hideTagDropdown();
            return;
        }
        
        // 提取搜索词
        const searchTerm = textAfterHash.substring(1).toLowerCase();
        this.hashPosition = lastHashIndex;
        
        // 获取所有标签并按最近使用排序
        const allTags = this.getTagsByRecentUsage();
        
        // 筛选匹配的标签
        const filteredTags = allTags.filter(tag => 
            tag.name.toLowerCase().includes('#' + searchTerm)
        );
        
        if (filteredTags.length > 0 || searchTerm === '') {
            this.showTagDropdown(filteredTags);
        } else {
            this.hideTagDropdown();
        }
    }

    getTagsByRecentUsage() {
        const customTags = this.storage.getCustomTags();
        const tagUsageMap = new Map();

        // 按时间顺序统计标签最后使用时间
        this.notes.forEach(note => {
            note.tags.forEach(tag => {
                if (!tagUsageMap.has(tag)) {
                    tagUsageMap.set(tag, {
                        name: tag,
                        lastUsed: note.createdAt,
                        count: 1,
                        isCustom: customTags.some(t => t.name === tag)
                    });
                } else {
                    const tagData = tagUsageMap.get(tag);
                    tagData.count++;
                    if (note.createdAt > tagData.lastUsed) {
                        tagData.lastUsed = note.createdAt;
                    }
                }
            });
        });

        // 添加未使用的自定义标签
        customTags.forEach(tag => {
            if (!tagUsageMap.has(tag.name)) {
                tagUsageMap.set(tag.name, {
                    name: tag.name,
                    lastUsed: tag.createdAt,
                    count: 0,
                    isCustom: true
                });
            }
        });

        // 转换为数组并按最后使用时间排序
        const tags = Array.from(tagUsageMap.values());
        tags.sort((a, b) => new Date(b.lastUsed) - new Date(a.lastUsed));

        return tags;
    }

    showTagDropdown(tags) {
        this.dropdownItems = tags;
        this.dropdownSelectedIndex = -1;
        
        if (tags.length === 0) {
            this.tagDropdownList.innerHTML = `
                <div class="tag-dropdown-empty">
                    继续输入创建新标签
                </div>
            `;
        } else {
            this.tagDropdownList.innerHTML = tags.map((tag, index) => {
                return `
                    <div class="tag-dropdown-item" data-index="${index}">
                        <div class="tag-dropdown-icon">${tag.isCustom ? '🏷️' : '📌'}</div>
                        <div class="tag-dropdown-content">
                            <div class="tag-dropdown-name">${tag.name}</div>
                            <div class="tag-dropdown-meta">${tag.count > 0 ? `${tag.count} 次使用` : '未使用'}${tag.isCustom ? ' · 自定义' : ''}</div>
                        </div>
                    </div>
                `;
            }).join('');
            
            // Add click listeners
            this.tagDropdownList.querySelectorAll('.tag-dropdown-item').forEach(item => {
                item.addEventListener('click', () => {
                    this.selectDropdownItem(parseInt(item.dataset.index));
                });
            });
        }
        
        // 计算下拉菜单位置（在#号下方）
        this.positionTagDropdown();
        
        this.tagDropdown.style.display = 'block';
        this.dropdownVisible = true;
    }

    positionTagDropdown() {
        // 获取输入框的位置
        const inputRect = this.noteInput.getBoundingClientRect();
        
        // 创建临时元素来测量#号的位置
        const textBeforeHash = this.noteInput.value.substring(0, this.hashPosition);
        const lines = textBeforeHash.split('\n');
        const currentLine = lines.length;
        
        // 简单定位：在输入框下方偏左
        const top = inputRect.bottom + window.scrollY + 4;
        const left = inputRect.left + window.scrollX + 12;
        
        this.tagDropdown.style.top = `${top}px`;
        this.tagDropdown.style.left = `${left}px`;
    }

    hideTagDropdown() {
        this.tagDropdown.style.display = 'none';
        this.dropdownVisible = false;
        this.dropdownSelectedIndex = -1;
    }

    moveDropdownSelection(direction) {
        const items = this.tagDropdownList.querySelectorAll('.tag-dropdown-item');
        if (items.length === 0) return;
        
        // Remove previous selection
        if (this.dropdownSelectedIndex >= 0) {
            items[this.dropdownSelectedIndex].classList.remove('active');
        }
        
        // Update index
        this.dropdownSelectedIndex += direction;
        
        // Wrap around
        if (this.dropdownSelectedIndex < 0) {
            this.dropdownSelectedIndex = items.length - 1;
        } else if (this.dropdownSelectedIndex >= items.length) {
            this.dropdownSelectedIndex = 0;
        }
        
        // Add new selection
        items[this.dropdownSelectedIndex].classList.add('active');
        items[this.dropdownSelectedIndex].scrollIntoView({ block: 'nearest' });
    }

    selectDropdownItem(index) {
        if (index < 0 || index >= this.dropdownItems.length) return;
        
        const selectedTag = this.dropdownItems[index];
        const value = this.noteInput.value;
        const cursorPos = this.noteInput.selectionStart;
        
        // 替换从#到光标的内容
        const newValue = value.substring(0, this.hashPosition) + 
                        selectedTag.name + ' ' + 
                        value.substring(cursorPos);
        
        this.noteInput.value = newValue;
        
        // 设置光标位置
        const newCursorPos = this.hashPosition + selectedTag.name.length + 1;
        this.noteInput.setSelectionRange(newCursorPos, newCursorPos);
        
        this.hideTagDropdown();
        this.noteInput.focus();
    }

    // Custom Tags Management
    loadCustomTags() {
        this.customTags = this.storage.getCustomTags();
        this.renderCustomTagsList();
        this.renderTagsBar();
    }

    addCustomTag() {
        const tagName = this.newTagInput.value.trim();
        if (!tagName) {
            this.newTagInput.classList.add('shake');
            setTimeout(() => this.newTagInput.classList.remove('shake'), 300);
            return;
        }

        const success = this.storage.addCustomTag(tagName);
        if (!success) {
            alert('该标签已存在！');
            return;
        }

        this.newTagInput.value = '';
        this.loadCustomTags();
        this.updateTagsFilter();
    }

    async deleteCustomTagFromBar(tagName) {
        // 检查该标签被多少笔记使用
        const affectedNotes = this.notes.filter(note => note.tags.includes(tagName));
        
        const message = affectedNotes.length > 0 
            ? `确定要删除标签 "${tagName}" 吗？\n\n⚠️ 有 ${affectedNotes.length} 篇笔记使用了此标签。\n删除后，这些笔记仍然保留，但会失去该标签的分类。`
            : `确定要删除标签 "${tagName}" 吗？`;
        
        if (!confirm(message)) return;

        // 从自定义标签中删除
        const customTag = this.storage.getCustomTags().find(t => t.name === tagName);
        if (customTag) {
            this.storage.deleteCustomTag(customTag.id);
        }

        this.loadCustomTags();
        this.updateTagsFilter();
        
        // 如果当前筛选的就是被删除的标签，切换到全部
        if (this.currentFilter === tagName) {
            this.currentFilter = 'all';
            this.renderNotes();
            this.updateTagsFilter();
        }
    }

    openTagsModal() {
        this.tagsModal.classList.add('active');
        document.body.classList.add('modal-open');
        this.renderCustomTagsList();
        this.renderUsedTagsList();
        setTimeout(() => this.newTagInput.focus(), 100);
    }

    renderCustomTagsList() {
        const customTags = this.storage.getCustomTags();
        document.getElementById('customTagsCount').textContent = customTags.length;

        if (customTags.length === 0) {
            this.customTagsList.innerHTML = `
                <div class="empty-state-small">
                    <p>还没有自定义标签</p>
                    <p class="empty-hint">创建标签后可以快速分类笔记</p>
                </div>
            `;
            return;
        }

        this.customTagsList.innerHTML = customTags.map(tag => {
            const usageCount = this.notes.filter(note => note.tags.includes(tag.name)).length;
            const colorIndex = this.getTagColor(tag.name);
            
            return `
                <div class="tag-item" data-id="${tag.id}">
                    <div class="tag-item-left">
                        <div class="tag-item-icon" data-color="${colorIndex}">🏷️</div>
                        <div class="tag-item-info">
                            <div class="tag-item-name">${tag.name}</div>
                            <div class="tag-item-meta">${usageCount} 篇笔记使用</div>
                        </div>
                    </div>
                    <div class="tag-item-actions">
                        <button class="tag-action-btn color-btn" data-tag="${tag.name}" title="修改颜色">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2"/>
                                <circle cx="8" cy="8" r="3" fill="currentColor"/>
                            </svg>
                        </button>
                        <button class="tag-action-btn insert-btn" data-tag="${tag.name}" title="插入标签">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <path d="M8 3V13M3 8H13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                            </svg>
                        </button>
                        <button class="tag-action-btn delete-btn" data-id="${tag.id}" title="删除标签">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Add event listeners
        this.customTagsList.querySelectorAll('.color-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showColorPicker(btn.dataset.tag);
            });
        });

        this.customTagsList.querySelectorAll('.insert-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.insertTagToInput(btn.dataset.tag);
            });
        });

        this.customTagsList.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteCustomTag(btn.dataset.id);
            });
        });
    }

    showColorPicker(tagName) {
        const colors = [
            { name: '黄色', emoji: '🟨' },
            { name: '蓝色', emoji: '🔵' },
            { name: '粉色', emoji: '💗' },
            { name: '绿色', emoji: '🟢' },
            { name: '紫色', emoji: '🟣' },
            { name: '橙色', emoji: '🟠' },
            { name: '淡紫', emoji: '💜' },
            { name: '青色', emoji: '🩵' }
        ];

        const colorOptions = colors.map((color, index) => `${color.emoji} ${color.name}`).join('\n');
        const currentColor = this.getTagColor(tagName);
        
        const choice = prompt(
            `选择 "${tagName}" 的颜色（输入 0-7）：\n\n${colorOptions}\n\n当前颜色: ${currentColor}`,
            currentColor.toString()
        );

        if (choice !== null) {
            const colorIndex = parseInt(choice);
            if (colorIndex >= 0 && colorIndex <= 7) {
                this.storage.saveTagColor(tagName, colorIndex);
                this.renderCustomTagsList();
                this.renderTagsBar();
                this.renderNotes();
            } else {
                alert('请输入 0-7 之间的数字');
            }
        }
    }

    renderUsedTagsList() {
        const allTags = new Map();
        this.notes.forEach(note => {
            note.tags.forEach(tag => {
                allTags.set(tag, (allTags.get(tag) || 0) + 1);
            });
        });

        const sortedTags = Array.from(allTags.entries())
            .sort((a, b) => b[1] - a[1]);

        document.getElementById('usedTagsCount').textContent = sortedTags.length;

        if (sortedTags.length === 0) {
            this.usedTagsList.innerHTML = `
                <div class="empty-state-small">
                    <p>还没有使用任何标签</p>
                </div>
            `;
            return;
        }

        this.usedTagsList.innerHTML = sortedTags.map(([tag, count]) => {
            const isCustom = this.storage.getCustomTags().some(t => t.name === tag);
            
            return `
                <div class="tag-item">
                    <div class="tag-item-left">
                        <div class="tag-item-icon">${isCustom ? '🏷️' : '📌'}</div>
                        <div class="tag-item-info">
                            <div class="tag-item-name">${tag}</div>
                            <div class="tag-item-meta">${count} 篇笔记</div>
                        </div>
                    </div>
                    <div class="tag-item-actions">
                        <button class="tag-action-btn insert-btn" data-tag="${tag}" title="插入标签">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <path d="M8 3V13M3 8H13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Add event listeners
        this.usedTagsList.querySelectorAll('.insert-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.insertTagToInput(btn.dataset.tag);
            });
        });
    }

    insertTagToInput(tag) {
        const currentValue = this.noteInput.value;
        const cursorPosition = this.noteInput.selectionStart;
        
        // Insert tag at cursor position
        const newValue = currentValue.slice(0, cursorPosition) + 
                        (cursorPosition > 0 && !currentValue[cursorPosition - 1].match(/\s/) ? ' ' : '') +
                        tag + ' ' + 
                        currentValue.slice(cursorPosition);
        
        this.noteInput.value = newValue;
        
        // Close modal and focus input
        this.closeModal(this.tagsModal);
        this.noteInput.focus();
        
        // Set cursor position after inserted tag
        const newCursorPos = cursorPosition + tag.length + 2;
        this.noteInput.setSelectionRange(newCursorPos, newCursorPos);
    }

    insertTagToInputArea(tag) {
        // Insert tag into input area (for tags bar clicks)
        const currentValue = this.noteInput.value;
        const cursorPosition = this.noteInput.selectionStart;
        
        // Insert tag at cursor position
        const newValue = currentValue.slice(0, cursorPosition) + 
                        (cursorPosition > 0 && !currentValue[cursorPosition - 1].match(/\s/) ? ' ' : '') +
                        tag + ' ' + 
                        currentValue.slice(cursorPosition);
        
        this.noteInput.value = newValue;
        this.noteInput.focus();
        
        // Set cursor position after inserted tag
        const newCursorPos = cursorPosition + tag.length + 2;
        this.noteInput.setSelectionRange(newCursorPos, newCursorPos);
    }

    // Custom Tags Management (保留标签管理器中的删除功能)
    deleteCustomTag(id) {
        const tag = this.storage.getCustomTags().find(t => t.id === id);
        if (!tag) return;

        const affectedNotes = this.notes.filter(note => note.tags.includes(tag.name));
        
        const message = affectedNotes.length > 0 
            ? `确定要删除标签 "${tag.name}" 吗？\n\n⚠️ 有 ${affectedNotes.length} 篇笔记使用了此标签。\n删除后，这些笔记仍然保留，但会失去该标签的分类。`
            : `确定要删除标签 "${tag.name}" 吗？`;
        
        if (!confirm(message)) return;

        this.storage.deleteCustomTag(id);
        this.loadCustomTags();
        this.updateTagsFilter();
        
        if (this.currentFilter === tag.name) {
            this.currentFilter = 'all';
            this.renderNotes();
            this.updateTagsFilter();
        }
    }

    // Auto-save Draft (自动保存草稿)
    saveDraftDebounced() {
        clearTimeout(this.draftSaveTimer);
        this.draftSaveTimer = setTimeout(() => {
            const content = this.noteInput.value.trim();
            if (content) {
                this.storage.saveDraft(content);
            }
        }, 1000); // 1秒后自动保存
    }

    restoreDraft() {
        const draft = this.storage.getDraft();
        if (draft && draft.content) {
            const timeDiff = new Date() - new Date(draft.savedAt);
            // 如果草稿在24小时内
            if (timeDiff < 24 * 60 * 60 * 1000) {
                if (confirm('发现未保存的草稿，是否恢复？')) {
                    this.noteInput.value = draft.content;
                    this.noteInput.focus();
                } else {
                    this.storage.clearDraft();
                }
            } else {
                this.storage.clearDraft();
            }
        }
    }

    initAutoSave() {
        // 每5分钟自动备份一次数据
        setInterval(() => {
            const notes = this.storage.getNotes();
            if (notes.length > 0) {
                this.storage.createBackup(notes);
            }
        }, 5 * 60 * 1000);
    }

    initBeforeUnload() {
        // 页面关闭前保存草稿
        window.addEventListener('beforeunload', (e) => {
            const content = this.noteInput.value.trim();
            if (content) {
                this.storage.saveDraft(content);
                // 如果有未保存内容，提示用户
                e.preventDefault();
                e.returnValue = '您有未保存的内容，确定要离开吗？';
                return e.returnValue;
            }
        });
    }

    // Export/Import Data (数据导出导入)
    exportAllData() {
        try {
            const dataStr = this.storage.exportData();
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `insight-backup-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            alert('数据导出成功！');
        } catch (e) {
            alert('导出失败：' + e.message);
        }
    }

    importAllData(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const success = this.storage.importData(e.target.result);
            if (success) {
                alert('数据导入成功！即将刷新页面...');
                location.reload();
            } else {
                alert('数据导入失败，请检查文件格式！');
            }
        };
        reader.readAsText(file);
    }

    // Cloud Sync Methods
    openSyncModal() {
        this.syncModal.classList.add('active');
        document.body.classList.add('modal-open');
        this.updateSyncUI();
    }

    updateSyncUI() {
        const isConnected = this.cloudSync.isConnected();
        
        if (isConnected) {
            document.getElementById('webdavSyncContent').querySelector('.sync-setup').style.display = 'none';
            this.webdavConnected.style.display = 'block';
            this.syncSettings.style.display = 'block';
            
            // Update last sync time
            const lastSync = this.cloudSync.getLastSyncTime();
            if (lastSync) {
                const timeStr = this.formatTime(lastSync);
                document.getElementById('webdavLastSyncTimeText').textContent = timeStr;
            }
            
            // Update auto sync settings
            this.autoSyncEnabled.checked = this.cloudSync.isAutoSyncEnabled();
            this.syncInterval.value = this.cloudSync.getSyncInterval().toString();
            
            // Update storage info
            this.updateStorageInfo();
            
            // Update status
            document.getElementById('syncStatus').classList.add('connected');
            document.querySelector('.sync-status-text').textContent = '已连接云端';
            if (lastSync) {
                document.getElementById('lastSyncTime').textContent = '上次同步: ' + this.formatTime(lastSync);
            }
        } else {
            document.getElementById('webdavSyncContent').querySelector('.sync-setup').style.display = 'block';
            this.webdavConnected.style.display = 'none';
            this.syncSettings.style.display = 'none';
            
            // Hide storage info when disconnected
            const storageInfo = document.getElementById('storageInfo');
            if (storageInfo) {
                storageInfo.style.display = 'none';
            }
            
            document.getElementById('syncStatus').classList.remove('connected');
            document.querySelector('.sync-status-text').textContent = '未连接云端';
            document.getElementById('lastSyncTime').textContent = '';
        }
    }

    updateStorageInfo() {
        const storageInfo = document.getElementById('storageInfo');
        if (!storageInfo) return;
        
        storageInfo.style.display = 'block';
        
        const info = this.cloudSync.getDataSizeInfo();
        
        // Update size display
        document.getElementById('storageSize').textContent = info.kb + ' KB';
        document.getElementById('storageNotesCount').textContent = info.notesCount;
        document.getElementById('storageTagsCount').textContent = info.tagsCount;
        
        // Update progress bar
        const barFill = document.getElementById('storageBarFill');
        barFill.style.width = info.percentage + '%';
        
        // Change color based on usage
        barFill.classList.remove('warning', 'critical');
        if (info.isCritical) {
            barFill.classList.add('critical');
        } else if (info.isWarning) {
            barFill.classList.add('warning');
        }
    }

    // WebDAV Sync Methods
    async testWebDAVConnection() {
        const server = this.webdavServer.value.trim();
        const username = this.webdavUsername.value.trim();
        const password = this.webdavPassword.value.trim();

        if (!server || !username || !password) {
            alert('请填写完整的配置信息');
            return;
        }

        this.testWebdavBtn.disabled = true;
        this.testWebdavBtn.textContent = '测试中...';

        try {
            this.cloudSync.saveConfig(server, username, password);
            const result = await this.cloudSync.testConnection();
            
            if (result.success) {
                alert('✅ ' + result.message);
            } else {
                alert('❌ ' + result.message);
                this.cloudSync.clearConfig();
            }
        } catch (error) {
            alert('❌ 测试失败: ' + error.message);
            this.cloudSync.clearConfig();
        } finally {
            this.testWebdavBtn.disabled = false;
            this.testWebdavBtn.textContent = '🔌 测试连接';
        }
    }

    async connectWebDAV() {
        const server = this.webdavServer.value.trim();
        const username = this.webdavUsername.value.trim();
        const password = this.webdavPassword.value.trim();

        if (!server || !username || !password) {
            alert('请填写完整的配置信息');
            return;
        }

        this.connectWebdavBtn.disabled = true;
        this.connectWebdavBtn.textContent = '连接中...';

        try {
            this.cloudSync.saveConfig(server, username, password);
            
            // 测试连接
            const testResult = await this.cloudSync.testConnection();
            if (!testResult.success) {
                throw new Error(testResult.message);
            }

            alert('✅ 连接成功！');
            this.updateSyncUI();
            this.cloudSync.startAutoSync();
        } catch (error) {
            alert('❌ 连接失败: ' + error.message);
            this.cloudSync.clearConfig();
        } finally {
            this.connectWebdavBtn.disabled = false;
            this.connectWebdavBtn.textContent = '💾 保存并连接';
        }
    }

    async handleWebDAVSyncUp() {
        this.webdavSyncUpBtn.disabled = true;
        this.webdavSyncUpBtn.textContent = '上传中...';

        const result = await this.cloudSync.syncUp();
        
        if (result.success) {
            alert('✅ ' + result.message);
            this.updateSyncUI();
        } else {
            alert('❌ 上传失败: ' + result.message);
        }

        this.webdavSyncUpBtn.disabled = false;
        this.webdavSyncUpBtn.textContent = '⬆️ 上传到云端';
    }

    async handleWebDAVSyncDown() {
        if (!confirm('从云端下载会覆盖本地数据，确定继续吗？\n\n建议先导出本地备份！')) {
            return;
        }

        this.webdavSyncDownBtn.disabled = true;
        this.webdavSyncDownBtn.textContent = '下载中...';

        const result = await this.cloudSync.syncDown();
        
        if (result.success) {
            alert('✅ ' + result.message + '\n\n即将刷新页面...');
            location.reload();
        } else {
            alert('❌ 下载失败: ' + result.message);
        }

        this.webdavSyncDownBtn.disabled = false;
        this.webdavSyncDownBtn.textContent = '⬇️ 从云端下载';
    }

    reconfigureWebDAV() {
        if (!confirm('确定要重新配置吗？\n\n建议先导出本地备份！')) {
            return;
        }

        document.getElementById('webdavSyncContent').querySelector('.sync-setup').style.display = 'block';
        this.webdavConnected.style.display = 'none';
        
        // 填充当前配置
        const config = this.cloudSync.getConfig();
        this.webdavServer.value = config.server.replace('https://', '').replace('http://', '');
        this.webdavUsername.value = config.username;
        this.webdavPassword.value = '';
    }

    disconnectWebDAV() {
        if (!confirm('确定要断开连接吗？\n\n本地数据不会被删除。')) {
            return;
        }

        this.cloudSync.clearConfig();
        this.cloudSync.stopAutoSync();
        this.updateSyncUI();
        alert('已断开连接');
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    try {
        console.log('🚀 开始初始化 Insight App...');
        const app = new InsightApp();
        console.log('✅ Insight App 初始化成功！');
        
        // 将 app 实例暴露到全局，方便调试
        window.insightApp = app;
    } catch (error) {
        console.error('❌ Insight App 初始化失败:', error);
        alert('应用初始化失败，请刷新页面重试。\n\n错误: ' + error.message);
    }
});

// 全局错误处理
window.addEventListener('error', (event) => {
    console.error('❌ 全局错误:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('❌ 未处理的 Promise 错误:', event.reason);
});
