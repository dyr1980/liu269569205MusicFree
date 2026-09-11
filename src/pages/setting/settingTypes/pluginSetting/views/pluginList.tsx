import React, { useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import rpx from "@/utils/rpx";
import * as DocumentPicker from "expo-document-picker";
import Loading from "@/components/base/loading";

import PluginManager, { useSortedPlugins } from "@/core/pluginManager";
import { trace } from "@/utils/log";

import Toast from "@/utils/toast";
import axios from "axios";
import { useNavigation } from "@react-navigation/native";
import Config from "@/core/appConfig";
import Empty from "@/components/base/empty";
import HorizontalSafeAreaView from "@/components/base/horizontalSafeAreaView.tsx";
import { showDialog } from "@/components/dialogs/useDialog";
import { showPanel } from "@/components/panels/usePanel";
import AppBar from "@/components/base/appBar";
import Fab from "@/components/base/fab";
import PluginItem from "../components/pluginItem";
import { IIconName } from "@/components/base/icon.tsx";
import { IInstallPluginResult } from "@/types/core/pluginManager";
import { useI18N } from "@/core/i18n";

interface IOption {
    icon: IIconName;
    title: string;
    onPress?: () => void;
}

export default function PluginList() {
    const plugins = useSortedPlugins();
    const { t } = useI18N();

    const [loading, setLoading] = useState(false);
    const [progressText, setProgressText] = useState("");

    const navigator = useNavigation<any>();

    const menuOptions: IOption[] = [
        {
            icon: "bookmark-square",
            title: t("pluginSetting.menu.subscriptionSetting"),
            async onPress() {
                navigator.navigate("/pluginsetting/subscribe");
            },
        },
        {
            icon: "bars-3",
            title: t("pluginSetting.menu.sort"),
            onPress() {
                navigator.navigate("/pluginsetting/sort");
            },
        },
        {
            icon: "trash-outline",
            title: t("pluginSetting.menu.uninstallAll"),
            onPress() {
                showDialog("SimpleDialog", {
                    title: t("pluginSetting.menu.uninstallAll"),
                    content: t("pluginSetting.menu.uninstallAllContent"),
                    async onOk() {
                        setLoading(true);
                        await PluginManager.uninstallAllPlugins();
                        setLoading(false);
                    },
                });
            },
        },
    ];

    async function onInstallFromLocalClick() {
        try {
            const results = await DocumentPicker.getDocumentAsync({
                copyToCacheDirectory: true,
                multiple: true,
                type: ["application/javascript", "text/javascript"],
            });
            if (results.canceled) {
                // 用户取消
                return;
            }
            setLoading(true);

            await Promise.all(
                results.assets.map(async it => {
                    await PluginManager.installPluginFromLocalFile(it.uri, {
                        notCheckVersion: Config.getConfig(
                            "basic.notCheckPluginVersion",
                        ),
                        useExpoFs: true,
                    });
                }),
            );
            // 初步过滤

            Toast.success(t("toast.installPluginSuccess"));
        } catch (e: any) {
            trace("插件安装失败", e?.message);
            Toast.warn(t("toast.installPluginFail", {
                reason: e?.message ?? "",
            }));
        }
        setLoading(false);
    }

    async function onInstallFromNetworkClick() {
        showPanel("SimpleInput", {
            title: t("pluginSetting.menu.installPlugin"),
            placeholder: t("pluginSetting.menu.installPluginDialogPlaceholder"),
            maxLength: 200,
            async onOk(text, closePanel) {
                setLoading(true);
                closePanel();

                setProgressText("正在解析订阅...");
                const result = await installPluginFromUrl(text.trim(), (cur, total) => {
                    setProgressText(`正在安装插件 ${cur}/${total}`);
                });

                // 检查是否全部安装成功
                const successResults: IInstallPluginResult[] = [];
                const failResults: IInstallPluginResult[] = [];
                for (let i = 0; i < result.length; ++i) {
                    if (result[i].success) {
                        successResults.push(result[i]);
                    } else {
                        failResults.push(result[i]);
                    }
                }

                if (!failResults.length) {
                    Toast.success(t("toast.installPluginSuccess"));
                } else {
                    Toast.warn(successResults.length ? t("toast.partialPluginInstallFailed") : t("toast.allPluginInstallFailed"), {
                        "type": "warn",
                        "actionText": t("common.view"),
                        "onActionClick": () => {
                            showDialog("SimpleDialog", {
                                title: t("pluginSetting.menu.pluginInstallFailedDialogTitle"),
                                content: t("pluginSetting.pluginInstallFailedDialogContent", {
                                    detail: failResults.map(it => (it.pluginUrl ?? "") + "\n" + t("pluginSetting.failReason", {
                                        reason: it.message ?? "",
                                    })).join("\n-----\n"),
                                }),
                            });
                        },
                    });
                }

                setProgressText("");
                setLoading(false);
            },
        });
    }

    async function onSubscribeClick() {
        const urls = Config.getConfig("plugin.subscribeUrl");
        if (!urls) {
            Toast.warn(t("toast.noSubscription"));
        }
        setLoading(true);

        const successResults: IInstallPluginResult[] = [];
        const failResults: IInstallPluginResult[] = [];

        try {
            const urlItems = JSON.parse(urls!);
            if (Array.isArray(urlItems)) {
                for (let i = 0; i < urlItems.length; ++i) {
                    setProgressText(`正在处理订阅 ${i + 1}/${urlItems.length}`);
                    const result = await installPluginFromUrl(urlItems[i].url, (cur, total) => {
                        setProgressText(`订阅 ${i + 1}/${urlItems.length} - 插件 ${cur}/${total}`);
                    });
                    if (result[0]) {
                        if (result[0].success) {
                            successResults.push(result[0]);
                        } else {
                            failResults.push(result[0]);
                        }
                    }
                }
            } else {
                throw new Error();
            }

            if (!failResults.length) {
                Toast.success(t("toast.installPluginSuccess"));
            } else {
                Toast.warn((successResults.length ? t("toast.partialPluginInstallFailed") : t("toast.allPluginInstallFailed")), {
                    "type": "warn",
                    "actionText": t("common.view"),
                    "onActionClick": () => {
                        showDialog("SimpleDialog", {
                            title: t("pluginSetting.menu.pluginInstallFailedDialogTitle"),
                            content: t("pluginSetting.pluginInstallFailedDialogContent", {
                                detail: failResults.map(it => (it.pluginUrl ?? "") + "\n" + t("pluginSetting.failReason", {
                                    reason: it.message ?? "",
                                })).join("\n-----\n"),
                            }),
                        });
                    },
                });
            }

        } catch {
            if (urls?.length) {
                setProgressText("正在安装插件...");
                const result = await installPluginFromUrl(urls, (cur, total) => {
                    setProgressText(`正在安装插件 ${cur}/${total}`);
                });
                if (result[0]) {
                    if (result[0].success) {
                        Toast.success(t("toast.installPluginSuccess"));
                    } else {
                        Toast.warn(t("toast.partialPluginInstallFailedWithReason", {
                            reason: result[0].message ?? "",
                        }));
                    }
                } else {
                    Toast.warn(t("toast.subscriptionInvalid"));
                }
            }
        }
        setProgressText("");
        setLoading(false);
    }

    async function onUpdateAllClick() {
        const plugins = PluginManager.getEnabledPlugins();
        setLoading(true);

        const successResults: IInstallPluginResult[] = [];
        const failResults: IInstallPluginResult[] = [];

        try {
            for (let i = 0; i < plugins.length; ++i) {
                const srcUrl = plugins[i].instance.srcUrl;
                if (srcUrl) {
                    setProgressText(`正在更新插件 ${i + 1}/${plugins.length}`);
                    const result = await installPluginFromUrl(srcUrl);
                    if (result[0]) {
                        if (result[0].success) {
                            successResults.push(result[0]);
                        } else {
                            failResults.push(result[0]);
                        }
                    }
                }
            }

            if (!failResults.length) {
                Toast.success(t("toast.updatePluginSuccess"));
            } else {
                Toast.warn((successResults.length ? t("toast.partialPluginUpdateFailed") : t("toast.allPluginUpdateFailed")), {
                    "type": "warn",
                    "actionText": t("common.view"),
                    "onActionClick": () => {
                        showDialog("SimpleDialog", {
                            title: t("pluginSetting.menu.pluginUpdateFailedDialogTitle"),
                            content: t("pluginSetting.pluginUpdateFailedDialogContent", {
                                detail: failResults.map(it => (it.pluginUrl ?? "") + "\n" + t("pluginSetting.failReason", {
                                    reason: it.message ?? "",
                                })).join("\n-----\n"),
                            }),
                        });
                    },
                });
            }

        } catch (e: any) {
            Toast.warn(t("toast.unknownError", {
                reason: e?.message ?? e,
            }));
        }
        setProgressText("");
        setLoading(false);
    }

    return (
        <>
            <AppBar menu={menuOptions}>{t("sidebar.pluginManagement")}</AppBar>
            <HorizontalSafeAreaView style={style.wrapper}>
                <>
                    {loading ? (
                        <View style={style.loadingWrapper}>
                            <Loading />
                            {progressText ? (
                                <Text style={style.progressText}>{progressText}</Text>
                            ) : null}
                        </View>
                    ) : (
                        <FlatList
                            ListEmptyComponent={Empty}
                            ListFooterComponent={<View style={style.blank} />}
                            data={plugins ?? []}
                            keyExtractor={_ => _.hash}
                            renderItem={({ item: plugin }) => (
                                <PluginItem key={plugin.hash} plugin={plugin} />
                            )}
                        />
                    )}

                    <Fab
                        icon="plus"
                        onPress={() => {
                            showPanel("SimpleSelect", {
                                header: t("pluginSetting.menu.installPlugin"),
                                candidates: [
                                    {
                                        value: "从本地安装插件",
                                        title: t("pluginSetting.fabOptions.installFromLocal"),
                                    },
                                    {
                                        value: "从网络安装插件",
                                        title: t("pluginSetting.fabOptions.installFromNetwork"),
                                    },
                                    {
                                        value: "更新全部插件",
                                        title: t("pluginSetting.fabOptions.updateAllPlugins"),
                                    },
                                    {
                                        value: "更新订阅",
                                        title: t("pluginSetting.fabOptions.updateSubscription"),
                                    },
                                ],
                                onPress(item) {
                                    if (item.value === "从本地安装插件") {
                                        onInstallFromLocalClick();
                                    } else if (
                                        item.value === "从网络安装插件"
                                    ) {
                                        onInstallFromNetworkClick();
                                    } else if (item.value === "更新订阅") {
                                        onSubscribeClick();
                                    } else if (item.value === "更新全部插件") {
                                        onUpdateAllClick();
                                    }
                                },
                            });
                        }}
                    />
                </>
            </HorizontalSafeAreaView>
        </>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: "100%",
        flex: 1,
    },
    loadingWrapper: {
        flex: 1,
        width: "100%",
        justifyContent: "center",
        alignItems: "center",
    },
    progressText: {
        marginTop: rpx(24),
        fontSize: rpx(28),
        opacity: 0.7,
        textAlign: "center",
    },
    blank: {
        height: rpx(200),
    },
});



async function installPluginFromUrl(
    text: string,
    onProgress?: (current: number, total: number) => void,
): Promise<IInstallPluginResult[]> {
    try {
        let urls: string[] = [];
        const inputUrl = text.trim();
        if (text.endsWith(".json")) {
            const jsonFile = (
                await axios.get(inputUrl, {
                    timeout: 20000,
                    headers: {
                        "Cache-Control": "no-cache",
                        Pragma: "no-cache",
                        Expires: "0",
                    },
                })
            ).data;
            urls = (jsonFile?.plugins ?? []).map((_: any) => _.url);
        } else {
            urls = [inputUrl];
        }

        const results: IInstallPluginResult[] = [];

        // ---------- 单个插件的下载逻辑 ----------
        // 15 秒硬超时，和电视源常见的超时设置对齐
        // 国内访问 GitHub/jsdelivr 的慢响应一般 8~12 秒，15 秒能兜住
        // 若某个源卡死，最多拖 15 秒，不会影响同批其他源
        const SINGLE_TIMEOUT = 15000;

        const downloadOne = async (url: string): Promise<IInstallPluginResult> => {
            try {
                return await Promise.race([
                    PluginManager.installPluginFromUrl(url, {
                        notCheckVersion: Config.getConfig(
                            "basic.notCheckPluginVersion",
                        ),
                    }),
                    new Promise<IInstallPluginResult>(resolve =>
                        setTimeout(
                            () =>
                                resolve({
                                    success: false,
                                    message: "请求超时（15秒）",
                                    pluginUrl: url,
                                }),
                            SINGLE_TIMEOUT,
                        ),
                    ),
                ]);
            } catch (e: any) {
                return {
                    success: false,
                    message: e?.message ?? String(e),
                    pluginUrl: url,
                };
            }
        };

        // ---------- 第一阶段：分组并发下载 ----------
        const BATCH_SIZE = 4;       // 每批同时下载 4 个
        const BATCH_DELAY = 500;    // 每批之间歇 500ms

        const failedUrls: string[] = [];
        let completed = 0;

        for (let i = 0; i < urls.length; i += BATCH_SIZE) {
            const batch = urls.slice(i, i + BATCH_SIZE);
            // downloadOne 内部已捕获所有异常并加 15 秒硬超时，
            // Promise.all 永远不会 reject，个别源失败不会影响同批其他源
            const batchResults = await Promise.all(batch.map(downloadOne));

            for (let j = 0; j < batchResults.length; j++) {
                if (batchResults[j].success) {
                    results.push(batchResults[j]);
                } else {
                    failedUrls.push(batch[j]);
                }
                completed++;
            }

            // 更新进度
            if (onProgress) {
                onProgress(completed, urls.length);
            }

            // 最后一批不用等
            if (i + BATCH_SIZE < urls.length) {
                await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
            }
        }

        // ---------- 第二阶段：对失败的集中重试（3 轮，递增延时） ----------
        const RETRY_DELAYS = [1000, 2000, 3000];

        let stillFailed = [...failedUrls];

        for (let round = 0; round < RETRY_DELAYS.length; round++) {
            if (stillFailed.length === 0) break;

            const nextRound: string[] = [];
            for (const url of stillFailed) {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[round]));
                const r = await downloadOne(url);
                if (r.success) {
                    results.push(r);
                } else {
                    nextRound.push(url);
                }
            }
            stillFailed = nextRound;
        }

        // ---------- 第三阶段：最终失败的作为结果返回 ----------
        // 这些失败不会影响前面已成功导入的插件，只是作为列表返回给 UI
        for (const url of stillFailed) {
            results.push({
                success: false,
                message: "网络超时，多次重试仍失败（该源可能已失效）",
                pluginUrl: url,
            });
        }

        return results;
    } catch (e: any) {
        return [{ success: false, message: e?.message, pluginUrl: text }];
    }
}
