// Cloud Sync Manager - GitHub Gist
class CloudSyncManager {
    constructor(storage) {
        this.storage = storage;
        this.GITHUB_TOKEN_KEY = 'insight_github_token';
        this.GIST_ID_KEY = 'insight_gist_id';
        this.LAST_SYNC_KEY = 'insight_last_sync';
        this.AUTO_SYNC_KEY = 'insight_auto_sync';
        this.SYNC_INTERVAL_KEY = 'insight_sync_interval';
        
        this.gistAPI = 'https://api.github.com/gists';
        this.autoSyncTimer = null;
    }

    // GitHub Token Management
    saveToken(token) {
        localStorage.setItem(this.GITHUB_TOKEN_KEY, token);
    }

    getToken() {
        return localStorage.getItem(this.GITHUB_TOKEN_KEY);
    }

    clearToken() {
        localStorage.removeItem(this.GITHUB_TOKEN_KEY);
        localStorage.removeItem(this.GIST_ID_KEY);
    }

    isConnected() {
        return !!this.getToken();
    }

    // Gist Management
    async createGist(data) {
        const token = this.getToken();
        if (!token) throw new Error('未连接 GitHub');

        const gistData = {
            description: 'Insight 笔记备份 - 自动同步',
            public: false,
            files: {
                'insight-notes.json': {
                    content: JSON.stringify(data, null, 2)
                }
            }
        };

        const response = await fetch(this.gistAPI, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(gistData)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMsg = errorData.message || `HTTP ${response.status}`;
            throw new Error(`创建 Gist 失败: ${errorMsg}`);
        }

        const gist = await response.json();
        localStorage.setItem(this.GIST_ID_KEY, gist.id);
        return gist;
    }

    async updateGist(data) {
        const token = this.getToken();
        const gistId = localStorage.getItem(this.GIST_ID_KEY);

        if (!token) throw new Error('未连接 GitHub');

        // 如果没有 Gist ID，创建新的
        if (!gistId) {
            return await this.createGist(data);
        }

        const gistData = {
            files: {
                'insight-notes.json': {
                    content: JSON.stringify(data, null, 2)
                }
            }
        };

        const response = await fetch(`${this.gistAPI}/${gistId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(gistData)
        });

        if (!response.ok) {
            // 如果 Gist 不存在，创建新的
            if (response.status === 404) {
                localStorage.removeItem(this.GIST_ID_KEY);
                return await this.createGist(data);
            }
            const errorData = await response.json().catch(() => ({}));
            const errorMsg = errorData.message || `HTTP ${response.status}`;
            throw new Error(`更新 Gist 失败: ${errorMsg}`);
        }

        return await response.json();
    }

    async getGist() {
        const token = this.getToken();
        const gistId = localStorage.getItem(this.GIST_ID_KEY);

        if (!token) throw new Error('未连接 GitHub');
        if (!gistId) throw new Error('没有找到云端备份');

        const response = await fetch(`${this.gistAPI}/${gistId}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMsg = errorData.message || `HTTP ${response.status}`;
            throw new Error(`获取 Gist 失败: ${errorMsg}`);
        }

        const gist = await response.json();
        const file = gist.files['insight-notes.json'];
        if (!file) throw new Error('备份文件不存在');

        return JSON.parse(file.content);
    }

    // Sync Operations
    async syncUp() {
        try {
            const data = {
                notes: this.storage.getNotes(),
                customTags: this.storage.getCustomTags(),
                tagColors: this.storage.getTagColors(),
                syncTime: new Date().toISOString(),
                version: '1.0'
            };

            // 检查数据大小
            const dataStr = JSON.stringify(data, null, 2);
            const sizeInBytes = new Blob([dataStr]).size;
            const sizeInKB = (sizeInBytes / 1024).toFixed(2);
            const sizeInMB = (sizeInBytes / (1024 * 1024)).toFixed(2);
            
            console.log(`📊 数据大小: ${sizeInKB} KB (${sizeInMB} MB)`);
            
            // 存储大小警告阈值
            const WARNING_SIZE = 800 * 1024; // 800 KB
            const MAX_SIZE = 1024 * 1024; // 1 MB
            
            if (sizeInBytes >= MAX_SIZE) {
                return { 
                    success: false, 
                    message: `数据大小 (${sizeInMB} MB) 超过 GitHub Gist 限制 (1 MB)！\n\n请导出本地备份并清理旧数据。`,
                    size: sizeInBytes,
                    warning: 'critical'
                };
            }
            
            if (sizeInBytes >= WARNING_SIZE) {
                const percentage = ((sizeInBytes / MAX_SIZE) * 100).toFixed(0);
                const message = `⚠️ 容量警告\n\n当前数据: ${sizeInKB} KB\n已使用: ${percentage}%\n\n建议尽快导出备份并清理数据，避免超过 1 MB 限制。`;
                
                // 记录警告时间，避免频繁提示
                const lastWarning = localStorage.getItem('insight_size_warning');
                const now = Date.now();
                
                if (!lastWarning || (now - parseInt(lastWarning)) > 24 * 60 * 60 * 1000) {
                    // 24小时内只提示一次
                    localStorage.setItem('insight_size_warning', now.toString());
                    setTimeout(() => alert(message), 500); // 延迟显示，避免阻塞上传
                }
            }

            await this.updateGist(data);
            this.updateLastSyncTime();
            
            return { 
                success: true, 
                message: '上传成功！',
                size: sizeInBytes
            };
        } catch (error) {
            console.error('同步上传失败:', error);
            return { success: false, message: error.message };
        }
    }

    async syncDown() {
        try {
            const data = await this.getGist();
            
            if (data.notes && Array.isArray(data.notes)) {
                this.storage.saveNotes(data.notes);
            }
            if (data.customTags && Array.isArray(data.customTags)) {
                this.storage.saveCustomTags(data.customTags);
            }

            this.updateLastSyncTime();
            return { success: true, message: '下载成功！' };
        } catch (error) {
            console.error('同步下载失败:', error);
            return { success: false, message: error.message };
        }
    }

    updateLastSyncTime() {
        localStorage.setItem(this.LAST_SYNC_KEY, new Date().toISOString());
    }

    getLastSyncTime() {
        return localStorage.getItem(this.LAST_SYNC_KEY);
    }

    // Auto Sync
    startAutoSync() {
        this.stopAutoSync();
        
        const enabled = localStorage.getItem(this.AUTO_SYNC_KEY) === 'true';
        const interval = parseInt(localStorage.getItem(this.SYNC_INTERVAL_KEY) || '10');
        
        if (enabled && this.isConnected()) {
            this.autoSyncTimer = setInterval(() => {
                this.syncUp().then(result => {
                    console.log('自动同步:', result.message);
                });
            }, interval * 60 * 1000);
        }
    }

    stopAutoSync() {
        if (this.autoSyncTimer) {
            clearInterval(this.autoSyncTimer);
            this.autoSyncTimer = null;
        }
    }

    setAutoSyncEnabled(enabled) {
        localStorage.setItem(this.AUTO_SYNC_KEY, enabled.toString());
        if (enabled) {
            this.startAutoSync();
        } else {
            this.stopAutoSync();
        }
    }

    setSyncInterval(minutes) {
        localStorage.setItem(this.SYNC_INTERVAL_KEY, minutes.toString());
        if (localStorage.getItem(this.AUTO_SYNC_KEY) === 'true') {
            this.startAutoSync(); // 重启以应用新间隔
        }
    }

    isAutoSyncEnabled() {
        return localStorage.getItem(this.AUTO_SYNC_KEY) === 'true';
    }

    getSyncInterval() {
        return parseInt(localStorage.getItem(this.SYNC_INTERVAL_KEY) || '10');
    }

    // 获取数据大小信息
    getDataSizeInfo() {
        const data = {
            notes: this.storage.getNotes(),
            customTags: this.storage.getCustomTags(),
            tagColors: this.storage.getTagColors(),
            syncTime: new Date().toISOString(),
            version: '1.0'
        };
        
        const dataStr = JSON.stringify(data, null, 2);
        const sizeInBytes = new Blob([dataStr]).size;
        const sizeInKB = (sizeInBytes / 1024).toFixed(2);
        const sizeInMB = (sizeInBytes / (1024 * 1024)).toFixed(3);
        const percentage = ((sizeInBytes / (1024 * 1024)) * 100).toFixed(1);
        
        return {
            bytes: sizeInBytes,
            kb: sizeInKB,
            mb: sizeInMB,
            percentage: percentage,
            notesCount: data.notes.length,
            tagsCount: data.customTags.length,
            isWarning: sizeInBytes >= 800 * 1024, // 800 KB
            isCritical: sizeInBytes >= 1024 * 1024 // 1 MB
        };
    }
}

// Export for use in main app
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CloudSyncManager;
}
