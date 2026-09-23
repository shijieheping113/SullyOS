declare const __FORK_BACKUP_UI_VISIBLE__: boolean;

/**
 * 二改备份区块是否显示。
 * - 正式打包：靠 vite.config 注入的 __FORK_BACKUP_UI_VISIBLE__（main 上为 false，可树摇）
 * - Cursor / 本地预览（import.meta.env.DEV）：始终显示，不依赖重启 dev，也跟手机存档无关
 */
export function isForkBackupUiVisible(): boolean {
    if (import.meta.env.DEV) return true;
    try {
        return __FORK_BACKUP_UI_VISIBLE__ === true;
    } catch {
        return false;
    }
}
