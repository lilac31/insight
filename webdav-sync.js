// WebDAV Cloud Sync Manager - 坚果云
class WebDAVSyncManager {
    constructor(storage) {
        this.storage = storage;
        this.WEBDAV_SERVER_KEY = 'insight_webdav_server';
        this.WEBDAV_USERNAME_KEY = 'insight_webdav_username';
        this.WEBDAV_PASSWORD_KEY = 'insight_webdav_password';
        this.LAST_SYNC_KEY = 'insight_webdav_last_sync';
        this.AUTO_SYNC_KEY = 'insight_webdav_auto_sync';
        this.SYNC_INTERVAL_KEY = 'insight_webdav_sync_interval';
        
        this.fileName = 'insight-notes.json';
        this.autoSyncTimer = null;
    }

    // WebDAV Configuration
    saveConfig(server, username, password) {
        // 确保服务器地址格式正确
        if (!server.startsWith('http://') && !server.startsWith('https://')) {
            server = 'https://' + server;
        }
        if (!server.endsWith('/')) {
            server += '/';
        }
        
        localStorage.setItem(this.WEBDAV_SERVER_KEY, server);
        localStorage.setItem(this.WEBDAV_USERNAME_KEY, username);
        localStorage.setItem(this.WEBDAV_PASSWORD_KEY, password);
    }

    getConfig() {
        return {
            server: localStorage.getItem(this.WEBDAV_SERVER_KEY) || '',
            username: localStorage.getItem(this.WEBDAV_USERNAME_KEY) || '',
            password: localStorage.getItem(this.WEBDAV_PASSWORD_KEY) || ''
        };
    }

    clearConfig() {
        localStorage.removeItem(this.WEBDAV_SERVER_KEY);
        localStorage.removeItem(this.WEBDAV_USERNAME_KEY);
        localStorage.removeItem(this.WEBDAV_PASSWORD_KEY);
    }

    isConnected() {
        const config = this.getConfig();
        return !!(config.server && config.username && config.password);
    }

    // WebDAV HTTP Basic Auth
    getAuthHeader() {
        const config = this.getConfig();
        const credentials = btoa(`${config.username}:${config.password}`);
        return `Basic ${credentials}`;
    }

    // WebDAV Operations
    async testConnection() {
        try {
            const config = this.getConfig();
            const url = config.server;
            
            const response = await fetch(url, {
                method: 'PROPFIND',
                headers: {
                    'Authorization': this.getAuthHeader(),
                    'Depth': '0'
                }
            });

            if (response.ok || response.status === 207) {
                return { success: true, message: '连接成功！' };
            } else if (response.status === 401) {
                return { success: false, message: '账号或密码错误' };
            } else {
                return { success: false, message: `连接失败 (${response.status})` };
            }
        } catch (error) {
            console.error('WebDAV 连接测试失败:', error);
            return { success: false, message: '网络错误: ' + error.message };
        }
    }

    async syncUp() {
        try {
            const config = this.getConfig();
            if (!this.isConnected()) {
                throw new Error('未配置 WebDAV 连接');
            }

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
            const sizeInMB = (sizeInBytes / (1024 * 1024)).toFixed(3);
            
            console.log(`📊 上传数据大小: ${sizeInKB} KB (${sizeInMB} MB)`);

            const url = config.server + this.fileName;
            
            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Authorization': this.getAuthHeader(),
                    'Content-Type': 'application/json; charset=utf-8'
                },
                body: dataStr
            });

            if (response.ok || response.status === 201 || response.status === 204) {
                this.updateLastSyncTime();
                return { 
                    success: true, 
                    message: '上传成功！',
                    size: sizeInBytes
                };
            } else if (response.status === 401) {
                return { success: false, message: '认证失败，请检查账号密码' };
            } else if (response.status === 507) {
                return { success: false, message: '存储空间不足' };
            } else {
                return { success: false, message: `上传失败 (${response.status})` };
            }
        } catch (error) {
            console.error('WebDAV 上传失败:', error);
            return { success: false, message: error.message };
        }
    }

    async syncDown() {
        try {
            const config = this.getConfig();
            if (!this.isConnected()) {
                throw new Error('未配置 WebDAV 连接');
            }

            const url = config.server + this.fileName;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': this.getAuthHeader()
                }
            });

            if (response.ok) {
                const dataStr = await response.text();
                const data = JSON.parse(dataStr);
                
                if (data.notes && Array.isArray(data.notes)) {
                    this.storage.saveNotes(data.notes);
                }
                if (data.customTags && Array.isArray(data.customTags)) {
                    this.storage.saveCustomTags(data.customTags);
                }
                if (data.tagColors) {
                    localStorage.setItem('insight_tag_colors', JSON.stringify(data.tagColors));
                }

                this.updateLastSyncTime();
                return { success: true, message: '下载成功！' };
            } else if (response.status === 404) {
                return { success: false, message: '云端没有找到数据文件' };
            } else if (response.status === 401) {
                return { success: false, message: '认证失败，请检查账号密码' };
            } else {
                return { success: false, message: `下载失败 (${response.status})` };
            }
        } catch (error) {
            console.error('WebDAV 下载失败:', error);
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
            this.startAutoSync();
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
        const percentage = ((sizeInBytes / (1024 * 1024 * 1024)) * 100).toFixed(1); // 1GB
        
        return {
            bytes: sizeInBytes,
            kb: sizeInKB,
            mb: sizeInMB,
            percentage: percentage,
            notesCount: data.notes.length,
            tagsCount: data.customTags.length,
            isWarning: sizeInBytes >= 800 * 1024 * 1024, // 800 MB
            isCritical: sizeInBytes >= 1024 * 1024 * 1024 // 1 GB
        };
    }
}

// Export for use in main app
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebDAVSyncManager;
}
