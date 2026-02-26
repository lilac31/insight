// Cloud Sync Manager - GitHub Gist with Sharding Support
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
        
        // 分片配置
        this.MAX_SHARD_SIZE = 800 * 1024; // 800KB per shard (留buffer)
        this.SHARD_PREFIX = 'insight-shard-';
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

    // 分片管理
    shardNotes(notes) {
        // 按时间排序(最新的在前)
        const sortedNotes = [...notes].sort((a, b) => b.timestamp - a.timestamp);
        
        const shards = [];
        let currentShard = [];
        let currentSize = 0;
        
        // 基础结构大小估算
        const baseSize = new Blob([JSON.stringify({
            customTags: this.storage.getCustomTags(),
            tagColors: this.storage.getTagColors(),
            syncTime: new Date().toISOString(),
            version: '1.0',
            shardInfo: { index: 0, total: 1 },
            notes: []
        })]).size;
        
        for (const note of sortedNotes) {
            const noteSize = new Blob([JSON.stringify(note)]).size;
            
            // 如果加入这条笔记会超过限制,开始新分片
            if (currentSize + noteSize + baseSize > this.MAX_SHARD_SIZE && currentShard.length > 0) {
                shards.push(currentShard);
                currentShard = [note];
                currentSize = noteSize;
            } else {
                currentShard.push(note);
                currentSize += noteSize;
            }
        }
        
        // 添加最后一个分片
        if (currentShard.length > 0) {
            shards.push(currentShard);
        }
        
        return shards.length > 0 ? shards : [[]];
    }
    
    mergeShards(shardDataArray) {
        // 合并所有分片的笔记
        const allNotes = [];
        let customTags = [];
        let tagColors = {};
        let latestSyncTime = null;
        
        for (const shardData of shardDataArray) {
            if (shardData.notes) {
                allNotes.push(...shardData.notes);
            }
            
            // 使用最新的标签和颜色配置
            if (shardData.customTags) {
                customTags = shardData.customTags;
            }
            if (shardData.tagColors) {
                tagColors = shardData.tagColors;
            }
            
            // 记录最新的同步时间
            if (shardData.syncTime) {
                if (!latestSyncTime || shardData.syncTime > latestSyncTime) {
                    latestSyncTime = shardData.syncTime;
                }
            }
        }
        
        // 去重(根据ID)
        const uniqueNotes = [];
        const seenIds = new Set();
        for (const note of allNotes) {
            if (!seenIds.has(note.id)) {
                seenIds.add(note.id);
                uniqueNotes.push(note);
            }
        }
        
        return {
            notes: uniqueNotes,
            customTags,
            tagColors,
            syncTime: latestSyncTime,
            version: '1.0'
        };
    }

    // Gist Management with Sharding
    async createGist(data) {
        const token = this.getToken();
        if (!token) throw new Error('未连接 GitHub');

        const notes = data.notes || [];
        const shards = this.shardNotes(notes);
        
        console.log(`📦 创建 Gist: ${shards.length} 个分片, ${notes.length} 条笔记`);
        
        // 准备文件对象
        const files = {};
        for (let i = 0; i < shards.length; i++) {
            const shardData = {
                notes: shards[i],
                customTags: data.customTags || [],
                tagColors: data.tagColors || {},
                syncTime: data.syncTime || new Date().toISOString(),
                version: data.version || '1.0',
                shardInfo: {
                    index: i,
                    total: shards.length
                }
            };
            
            files[`${this.SHARD_PREFIX}${i}.json`] = {
                content: JSON.stringify(shardData, null, 2)
            };
        }

        const gistData = {
            description: `Insight 笔记备份 - ${shards.length} 个分片`,
            public: false,
            files
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

        const notes = data.notes || [];
        const shards = this.shardNotes(notes);
        
        console.log(`📦 更新 Gist: ${shards.length} 个分片, ${notes.length} 条笔记`);
        
        // 准备文件对象
        const files = {};
        for (let i = 0; i < shards.length; i++) {
            const shardData = {
                notes: shards[i],
                customTags: data.customTags || [],
                tagColors: data.tagColors || {},
                syncTime: data.syncTime || new Date().toISOString(),
                version: data.version || '1.0',
                shardInfo: {
                    index: i,
                    total: shards.length
                }
            };
            
            files[`${this.SHARD_PREFIX}${i}.json`] = {
                content: JSON.stringify(shardData, null, 2)
            };
        }
        
        // 获取现有 Gist 以删除多余的旧分片
        try {
            const existingGist = await fetch(`${this.gistAPI}/${gistId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            });
            
            if (existingGist.ok) {
                const gistData = await existingGist.json();
                // 标记旧分片为null以删除
                for (const filename in gistData.files) {
                    if (filename.startsWith(this.SHARD_PREFIX) && !files[filename]) {
                        files[filename] = null;
                    }
                }
            }
        } catch (e) {
            console.warn('无法获取现有分片信息:', e);
        }

        const gistData = {
            description: `Insight 笔记备份 - ${shards.length} 个分片`,
            files
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
        
        // 查找所有分片文件
        const shardFiles = [];
        for (const filename in gist.files) {
            if (filename.startsWith(this.SHARD_PREFIX)) {
                const file = gist.files[filename];
                if (file && file.content) {
                    try {
                        const shardData = JSON.parse(file.content);
                        shardFiles.push({
                            index: shardData.shardInfo?.index || 0,
                            data: shardData
                        });
                    } catch (e) {
                        console.error(`解析分片 ${filename} 失败:`, e);
                    }
                }
            }
        }
        
        if (shardFiles.length === 0) {
            // 兼容旧格式(单文件)
            const file = gist.files['insight-notes.json'];
            if (!file) throw new Error('备份文件不存在');
            return JSON.parse(file.content);
        }
        
        // 按索引排序
        shardFiles.sort((a, b) => a.index - b.index);
        
        console.log(`📦 从 ${shardFiles.length} 个分片恢复数据`);
        
        // 合并分片
        return this.mergeShards(shardFiles.map(f => f.data));
    }

    // Sync Operations
    async syncUp() {
        try {
            // 先尝试从云端获取数据并合并
            let notesToUpload = this.storage.getNotes();
            
            const gistId = localStorage.getItem(this.GIST_ID_KEY);
            if (gistId) {
                try {
                    const cloudData = await this.getGist();
                    if (cloudData.notes && Array.isArray(cloudData.notes)) {
                        // 合并云端和本地的笔记
                        notesToUpload = this.mergeNotes(notesToUpload, cloudData.notes);
                        console.log(`📤 合并后上传: ${notesToUpload.length} 条笔记`);
                    }
                } catch (e) {
                    console.warn('无法获取云端数据,将直接上传本地数据:', e.message);
                }
            }
            
            const data = {
                notes: notesToUpload,
                customTags: this.storage.getCustomTags(),
                tagColors: this.storage.getTagColors(),
                syncTime: new Date().toISOString(),
                version: '1.0'
            };

            // 检查数据大小
            const dataStr = JSON.stringify(data);
            const sizeInBytes = new Blob([dataStr]).size;
            const sizeInKB = (sizeInBytes / 1024).toFixed(2);
            const sizeInMB = (sizeInBytes / (1024 * 1024)).toFixed(2);
            
            console.log(`📊 数据大小: ${sizeInKB} KB (${sizeInMB} MB), ${data.notes.length} 条笔记`);

            await this.updateGist(data);
            this.updateLastSyncTime();
            
            // 计算分片数量
            const shards = this.shardNotes(data.notes);
            const shardInfo = shards.length > 1 ? ` (${shards.length} 个分片)` : '';
            
            return { 
                success: true, 
                message: `上传成功！${shardInfo}`,
                size: sizeInBytes,
                shards: shards.length
            };
        } catch (error) {
            console.error('同步上传失败:', error);
            return { success: false, message: error.message };
        }
    }

    async syncDown() {
        try {
            const cloudData = await this.getGist();
            
            // 获取本地数据
            const localNotes = this.storage.getNotes();
            const localTags = this.storage.getCustomTags();
            
            // 合并笔记 (按 ID 去重,保留最新的)
            if (cloudData.notes && Array.isArray(cloudData.notes)) {
                const mergedNotes = this.mergeNotes(localNotes, cloudData.notes);
                this.storage.saveNotes(mergedNotes);
                console.log(`📥 合并笔记: 本地 ${localNotes.length} 条 + 云端 ${cloudData.notes.length} 条 = ${mergedNotes.length} 条`);
            }
            
            // 合并标签 (去重)
            if (cloudData.customTags && Array.isArray(cloudData.customTags)) {
                const mergedTags = [...new Set([...localTags, ...cloudData.customTags])];
                this.storage.saveCustomTags(mergedTags);
            }
            
            // 标签颜色直接使用云端的
            if (cloudData.tagColors) {
                localStorage.setItem('insight_tag_colors', JSON.stringify(cloudData.tagColors));
            }

            this.updateLastSyncTime();
            return { 
                success: true, 
                message: `合并成功！共 ${this.storage.getNotes().length} 条笔记` 
            };
        } catch (error) {
            console.error('同步下载失败:', error);
            return { success: false, message: error.message };
        }
    }
    
    // 合并笔记:按 ID 去重,保留最新的
    mergeNotes(localNotes, cloudNotes) {
        const notesMap = new Map();
        
        // 先加入本地笔记
        for (const note of localNotes) {
            notesMap.set(note.id, note);
        }
        
        // 加入云端笔记,如果 ID 相同则比较时间戳
        for (const note of cloudNotes) {
            const existing = notesMap.get(note.id);
            if (!existing || note.timestamp > existing.timestamp) {
                notesMap.set(note.id, note);
            }
        }
        
        // 转换回数组并按时间排序
        return Array.from(notesMap.values()).sort((a, b) => b.timestamp - a.timestamp);
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
