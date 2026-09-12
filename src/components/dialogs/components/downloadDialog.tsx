import React, { useState } from "react";
import ThemeText from "@/components/base/themeText";
import { StyleSheet, View } from "react-native";
import rpx, { vh } from "@/utils/rpx";
import openUrl from "@/utils/openUrl";
import Clipboard from "@react-native-clipboard/clipboard";
import { ScrollView, TouchableOpacity } from "react-native-gesture-handler";
import { hideDialog } from "../useDialog";
import Checkbox from "@/components/base/checkbox";
import Button from "@/components/base/textButton.tsx";
import Dialog from "./base";
import PersistStatus from "@/utils/persistStatus";
import { useI18N } from "@/core/i18n";
import RNFS from "react-native-fs";
import Share from "react-native-share";
import Toast from "@/utils/toast";
import { trace } from "@/utils/log";

interface IDownloadDialogProps {
    version: string;
    content: string[];
    /** 新的多源数组 */
    downloadUrls?: string[];
    /** 兼容旧调用 */
    fromUrl?: string;
    backUrl?: string;
}

/** 单个源的最长等待时间（毫秒） */
const SINGLE_SOURCE_TIMEOUT = 60 * 1000;

export default function DownloadDialog(props: IDownloadDialogProps) {
    const { content, version, downloadUrls, fromUrl, backUrl } = props;

    // 汇总所有下载地址（新格式优先，旧格式兼容）
    const urls: string[] = (() => {
        if (downloadUrls && downloadUrls.length > 0) {
            return downloadUrls.filter(Boolean);
        }
        return [fromUrl, backUrl].filter(Boolean) as string[];
    })();

    const [skipState, setSkipState] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [progress, setProgress] = useState(0); // 0 ~ 1
    const [statusText, setStatusText] = useState("");

    const { t } = useI18N();

    /** 下载单个 URL，成功返回；失败抛错 */
    const downloadOne = async (url: string, index: number, total: number) => {
        const fileName = `musicfree-${version}-${Date.now()}.apk`;
        const downloadPath = `${RNFS.CachesDirectoryPath}/${fileName}`;

        setStatusText(
            total > 1 ? `正在下载（源 ${index + 1}/${total}）` : "正在下载",
        );

        const downloadTask = RNFS.downloadFile({
            fromUrl: url,
            toFile: downloadPath,
            background: true,
            progress: res => {
                if (res.contentLength > 0) {
                    setProgress(res.bytesWritten / res.contentLength);
                }
            },
        });

        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        try {
            const result = await Promise.race([
                downloadTask.promise,
                new Promise<never>((_, reject) => {
                    timeoutId = setTimeout(() => {
                        RNFS.stopDownload(downloadTask.jobId).catch(() => {});
                        reject(new Error("下载超时"));
                    }, SINGLE_SOURCE_TIMEOUT);
                }),
            ]);

            if (result.statusCode !== 200) {
                throw new Error(`HTTP ${result.statusCode}`);
            }

            const exists = await RNFS.exists(downloadPath);
            if (!exists) {
                throw new Error("下载完成但文件不存在");
            }

            // 调起系统安装器（系统弹出"打开方式"，一般会有"打包安装程序"）
            await Share.open({
                url: `file://${downloadPath}`,
                type: "application/vnd.android.package-archive",
                title: "安装更新",
                failOnCancel: false,
                showAppsToView: true,
            });
        } finally {
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
        }
    };

    /** 依次自动尝试所有源 */
    const handleDownload = async () => {
        if (downloading || urls.length === 0) {
            return;
        }
        setDownloading(true);
        setProgress(0);

        // 用户主动下载，清掉跳过记录
        PersistStatus.set("app.skipVersion", undefined);

        let lastError = "";

        for (let i = 0; i < urls.length; i++) {
            try {
                await downloadOne(urls[i], i, urls.length);
                // 成功了
                hideDialog();
                return;
            } catch (e: any) {
                lastError = e?.message ?? String(e);
                trace(`下载源 ${i + 1} 失败：${lastError}`);
                // 继续尝试下一个
            }
        }

        // 全部失败，兜底打开浏览器
        Toast.warn(`下载失败：${lastError}，已为您打开浏览器`);
        openUrl(urls[0]);
        Clipboard.setString(urls[0]);
        setDownloading(false);
    };

    return (
        <Dialog
            onDismiss={() => {
                if (downloading) {
                    // 下载过程中禁止关闭
                    return;
                }
                if (skipState) {
                    PersistStatus.set("app.skipVersion", version);
                }
                hideDialog();
            }}>
            <Dialog.Title stringContent>
                {t("dialog.downloadDialog.title", { version: version })}
            </Dialog.Title>
            <ScrollView style={style.scrollView}>
                {content?.map?.(_ => (
                    <ThemeText key={_} style={style.item}>
                        {_}
                    </ThemeText>
                ))}
            </ScrollView>

            {downloading && (
                <View style={style.progressWrapper}>
                    <View style={style.progressBarBg}>
                        <View
                            style={[
                                style.progressBarFill,
                                { width: `${Math.round(progress * 100)}%` },
                            ]}
                        />
                    </View>
                    <ThemeText style={style.progressText}>
                        {`${statusText} ${Math.round(progress * 100)}%`}
                    </ThemeText>
                </View>
            )}

            <Dialog.Actions style={style.dialogActions}>
                <TouchableOpacity
                    disabled={downloading}
                    onPress={() => setSkipState(s => !s)}>
                    <View style={style.checkboxGroup}>
                        <Checkbox checked={skipState} />
                        <ThemeText style={style.checkboxHint}>
                            {t("dialog.downloadDialog.skipThisVersion")}
                        </ThemeText>
                    </View>
                </TouchableOpacity>
                <View style={style.buttonGroup}>
                    <Button
                        style={style.button}
                        onPress={() => {
                            if (downloading) return;
                            hideDialog();
                            if (skipState) {
                                PersistStatus.set("app.skipVersion", version);
                            }
                        }}>
                        {t("common.cancel")}
                    </Button>
                    <Button style={style.button} onPress={handleDownload}>
                        {downloading ? "下载中..." : "立即升级"}
                    </Button>
                </View>
            </Dialog.Actions>
        </Dialog>
    );
}

const style = StyleSheet.create({
    item: {
        marginBottom: rpx(20),
        lineHeight: rpx(36),
    },
    content: {
        flex: 1,
        maxHeight: vh(50),
    },
    scrollView: {
        maxHeight: vh(40),
        paddingHorizontal: rpx(26),
    },
    dialogActions: {
        marginTop: rpx(24),
        height: rpx(120),
        marginBottom: rpx(12),
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "space-between",
    },
    checkboxGroup: {
        flexDirection: "row",
        alignItems: "center",
    },
    buttonGroup: {
        flexDirection: "row",
        alignItems: "center",
        width: "100%",
        justifyContent: "flex-end",
    },
    checkboxHint: {
        marginLeft: rpx(12),
    },
    button: {
        paddingLeft: rpx(28),
        paddingVertical: rpx(14),
        marginLeft: rpx(16),
        alignItems: "flex-end",
    },
    progressWrapper: {
        marginTop: rpx(20),
        paddingHorizontal: rpx(26),
    },
    progressBarBg: {
        width: "100%",
        height: rpx(12),
        borderRadius: rpx(6),
        backgroundColor: "rgba(255,255,255,0.15)",
        overflow: "hidden",
    },
    progressBarFill: {
        height: "100%",
        backgroundColor: "#4c9aff",
    },
    progressText: {
        marginTop: rpx(8),
        fontSize: rpx(22),
        opacity: 0.7,
    },
});
