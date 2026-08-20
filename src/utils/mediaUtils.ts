import {
    internalSerializeKey,
    localPluginPlatform,
    supportLocalMediaType,
} from "@/constants/commonConst";
import appConfig from "@/core/appConfig";
import pathConst from "@/constants/pathConst";
import { addFileScheme, escapeCharacter } from "@/utils/fileUtils";
import { getMediaExtraProperty, patchMediaExtra } from "./mediaExtra";
import { exists, readDir } from "react-native-fs";

/**
 * 获取媒体资源的唯一key
 * @param mediaItem 
 * @returns 
 */
export function getMediaUniqueKey(mediaItem: ICommon.IMediaBase) {
    return `${mediaItem.platform}@${mediaItem.id}`;
}

/**
 * 解析媒体资源的唯一key
 * @param key 
 * @returns 
 */
export function parseMediaUniqueKey(key: string): ICommon.IMediaBase {
    try {
        const str = JSON.parse(key.trim());
        let platform, id;
        if (typeof str === "string") {
            [platform, id] = str.split("@");
        } else {
            platform = str?.platform;
            id = str?.id;
        }
        if (!platform || !id) {
            throw new Error("mediakey不完整");
        }
        return {
            platform,
            id,
        };
    } catch (e: any) {
        throw e;
    }
}

/**
 * 比较两个媒体资源是否相同
 * @param a 
 * @param b 
 * @returns 
 */
export function isSameMediaItem(
    a: ICommon.IMediaBase | null | undefined,
    b: ICommon.IMediaBase | null | undefined,
) {
    // eslint-disable-next-line eqeqeq
    return !!(a && b && a.id == b.id && a.platform === b.platform);
}


/** 获取复位的mediaItem */
export function resetMediaItem<T extends ICommon.IMediaBase>(
    mediaItem: T,
    platform?: string,
    newObj?: boolean,
): T {
    // 本地音乐不做处理
    if (
        mediaItem.platform === localPluginPlatform ||
        platform === localPluginPlatform
    ) {
        return newObj ? { ...mediaItem } : mediaItem;
    }
    if (!newObj) {
        mediaItem.platform = platform ?? mediaItem.platform;
        mediaItem[internalSerializeKey] = undefined;
        return mediaItem;
    } else {
        return {
            ...mediaItem,
            platform: platform ?? mediaItem.platform,
            [internalSerializeKey]: undefined,
        };
    }
}

/**
 * 获取媒体资源的本地路径，如果本地路径不存在，则返回null
 * @param mediaItem 
 * @returns 
 */
export function getLocalPath(mediaItem: ICommon.IMediaBase) {
    if (!mediaItem) {
        return null;
    }

    // 如果本身就是一个内部音乐
    if (mediaItem.url && (mediaItem.url.startsWith("file://") || mediaItem.url.startsWith("content://"))) {
        return mediaItem.url;
    }

    // 尝试从内部数据中获取 -- legacy logic
    const legacyLocalPath = mediaItem?.[internalSerializeKey]?.localPath;
    if (legacyLocalPath && typeof legacyLocalPath === "string") {
        return legacyLocalPath;
    }

    // 从附加信息中获取
    const localPathInMediaExtra = getMediaExtraProperty(mediaItem, "localPath");

    return localPathInMediaExtra ?? null;
}

/** 下载目录文件索引缓存（避免列表渲染时反复 readDir） */
interface IDownloadDirFile {
    name: string;
    path: string;
}
let downloadDirCache: IDownloadDirFile[] | null = null;
let downloadDirCacheTime = 0;
const DOWNLOAD_DIR_CACHE_TTL = 30 * 1000; // 30 秒

/** 获取下载目录文件索引（带 TTL 缓存；下载完成后调用 invalidateDownloadDirCache 刷新） */
async function getDownloadDirFiles(force = false): Promise<IDownloadDirFile[]> {
    const now = Date.now();
    if (
        !force &&
        downloadDirCache &&
        now - downloadDirCacheTime < DOWNLOAD_DIR_CACHE_TTL
    ) {
        return downloadDirCache;
    }
    const dlPath =
        appConfig.getConfig("basic.downloadPath") ?? pathConst.downloadMusicPath;
    try {
        const files = await readDir(addFileScheme(dlPath));
        downloadDirCache = files
            .filter(file =>
                supportLocalMediaType.some(ext =>
                    file.path.toLowerCase().endsWith(ext),
                ),
            )
            .map(file => ({ name: file.name, path: file.path }));
        downloadDirCacheTime = now;
    } catch {
        downloadDirCache = downloadDirCache ?? [];
    }
    return downloadDirCache;
}

/** 使下载目录索引失效（下载完成 / 文件被删除后调用） */
export function invalidateDownloadDirCache() {
    downloadDirCache = null;
    downloadDirCacheTime = 0;
}

/** 文件名是否匹配：优先「歌名@作者」，退而求其次同时包含歌名与作者 */
function isFilenameMatch(
    name: string,
    title: string,
    artist: string,
    keyword: string,
) {
    if (name.includes(keyword)) {
        return true;
    }
    if (
        artist &&
        name.includes(escapeCharacter(title)) &&
        name.includes(escapeCharacter(artist))
    ) {
        return true;
    }
    return false;
}

/**
 * 同步判断媒体是否已下载（供列表「已下载」标记使用）。
 * - 原方式：mediaExtra / 内部数据存在 localPath 或 downloaded 标记；
 * - 回退方式：下载目录索引中匹配到「歌名@作者」的文件。
 * 注意：同步版本依赖目录索引缓存，索引未初始化时返回 false，
 * 调用方可再通过 getLocalPathWithFallback 异步初始化索引后刷新。
 */
export function isDownloadedMediaItem(mediaItem: ICommon.IMediaBase): boolean {
    if (!mediaItem) {
        return false;
    }
    if (getLocalPath(mediaItem)) {
        return true;
    }
    if (getMediaExtraProperty(mediaItem, "downloaded")) {
        return true;
    }
    const title = mediaItem.title ?? "";
    const artist = mediaItem.artist ?? "";
    if (!title) {
        return false;
    }
    const keyword = `${escapeCharacter(title)}@${escapeCharacter(artist)}`;
    if (keyword.length <= 1) {
        return false;
    }
    const files = downloadDirCache;
    if (!files || files.length === 0) {
        return false;
    }
    return files.some(file =>
        isFilenameMatch(file.name, title, artist, keyword),
    );
}

/**
 * 获取媒体资源的本地路径（带回退）。
 *
 * 优先走「原方式」：通过 platform@id 关联的 mediaExtra / 内部数据定位已下载文件；
 * 如果该方式找不到（例如用户更换了插件源，导致 platform 与 id 发生变化，
 * 但磁盘上仍保留着之前以「插件名@id@歌名@作者」命名的文件），
 * 则回退到在下载目录中查找文件名包含「歌名@作者」的文件，
 * 从而兼容更换插件源后依旧能识别并播放原先下载的文件。
 *
 * 命中回退后会将路径写入 mediaExtra 缓存，后续调用走原方式即可，无需再次扫描目录。
 *
 * @param mediaItem 媒体资源
 * @returns 本地路径，找不到时返回 null
 */
export async function getLocalPathWithFallback(
    mediaItem: ICommon.IMediaBase,
): Promise<string | null> {
    if (!mediaItem) {
        return null;
    }

    // 1. 原方式：platform@id 关联的路径
    const standardPath = getLocalPath(mediaItem);
    if (standardPath) {
        try {
            if (await exists(standardPath)) {
                return standardPath;
            }
        } catch {
            /* 路径无效，继续回退 */
        }
    }

    // 2. 回退：根据「歌名@作者」在下载目录中查找
    const title = mediaItem.title ?? "";
    const artist = mediaItem.artist ?? "";
    if (!title) {
        return null;
    }
    const keyword = `${escapeCharacter(title)}@${escapeCharacter(artist)}`;
    // 关键字必须含有效内容，避免误匹配
    if (keyword.length <= 1) {
        return null;
    }

    const dlPath =
        appConfig.getConfig("basic.downloadPath") ?? pathConst.downloadMusicPath;

    let files: IDownloadDirFile[] = [];
    try {
        files = await getDownloadDirFiles();
    } catch {
        return null;
    }

    // 优先精确匹配「歌名@作者」
    for (const file of files) {
        if (file.name.includes(keyword)) {
            // 校验文件仍存在（索引可能是缓存的）
            try {
                if (!(await exists(addFileScheme(file.path)))) {
                    invalidateDownloadDirCache();
                    continue;
                }
            } catch {
                continue;
            }
            // 缓存，便于下次走原方式
            try {
                patchMediaExtra(mediaItem, {
                    localPath: file.path,
                    downloaded: true,
                });
            } catch {
                /* 忽略缓存失败 */
            }
            return file.path;
        }
    }
    // 文件名可能因总长度超过 200 字符被截断，退而求其次：
    // 同时包含「歌名」与「作者」两个片段（顺序不限），提高命中率
    if (artist) {
        for (const file of files) {
            if (
                file.name.includes(escapeCharacter(title)) &&
                file.name.includes(escapeCharacter(artist))
            ) {
                try {
                    if (!(await exists(addFileScheme(file.path)))) {
                        invalidateDownloadDirCache();
                        continue;
                    }
                } catch {
                    continue;
                }
                try {
                    patchMediaExtra(mediaItem, {
                        localPath: file.path,
                        downloaded: true,
                    });
                } catch {
                    /* 忽略缓存失败 */
                }
                return file.path;
            }
        }
    }

    return null;
}