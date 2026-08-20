import React, { useEffect, useState } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import rpx from "@/utils/rpx";
import ListItem from "../base/listItem";

import LocalMusicSheet from "@/core/localMusicSheet";
import { showPanel } from "../panels/usePanel";
import TitleAndTag from "./titleAndTag";
import ThemeText from "../base/themeText";
import TrackPlayer from "@/core/trackPlayer";
import Icon from "@/components/base/icon.tsx";
import {
    getLocalPathWithFallback,
    isDownloadedMediaItem,
} from "@/utils/mediaUtils";

/** 是否已下载（含回退匹配：下载目录中存在「歌名@作者」文件） */
function useIsDownloaded(musicItem: IMusic.IMusicItem | null) {
    const [isDownloaded, setIsDownloaded] = useState(false);
    useEffect(() => {
        let cancelled = false;
        if (!musicItem) {
            setIsDownloaded(false);
            return;
        }
        // 先同步判断（依赖 mediaExtra 与已初始化的目录索引）
        if (isDownloadedMediaItem(musicItem)) {
            setIsDownloaded(true);
            return;
        }
        // 索引未初始化时异步扫描一次，命中后刷新
        getLocalPathWithFallback(musicItem)
            .then(path => {
                if (!cancelled) {
                    setIsDownloaded(!!path);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setIsDownloaded(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [musicItem]);
    return isDownloaded;
}

interface IMusicItemProps {
    index?: string | number;
    showMoreIcon?: boolean;
    musicItem: IMusic.IMusicItem;
    musicSheet?: IMusic.IMusicSheetItem;
    onItemPress?: (musicItem: IMusic.IMusicItem) => void;
    onItemLongPress?: () => void;
    itemPaddingRight?: number;
    left?: () => JSX.Element;
    containerStyle?: StyleProp<ViewStyle>;
    highlight?: boolean
    /** 点击播放时是否自动下载（默认 true；搜索结果传 false） */
    autoDownload?: boolean;
}
export default function MusicItem(props: IMusicItemProps) {
    const {
        musicItem,
        index,
        onItemPress,
        onItemLongPress,
        musicSheet,
        itemPaddingRight,
        showMoreIcon = true,
        left: Left,
        containerStyle,
        highlight = false,
        autoDownload,
    } = props;

    const isLocal = !!LocalMusicSheet.isLocalMusic(musicItem);
    const isDownloaded = useIsDownloaded(musicItem);

    return (
        <ListItem
            heightType="big"
            style={containerStyle}
            withHorizontalPadding
            leftPadding={index !== undefined ? 0 : undefined}
            rightPadding={itemPaddingRight}
            onLongPress={onItemLongPress}
            onPress={() => {
                if (onItemPress) {
                    onItemPress(musicItem);
                } else {
                    TrackPlayer.play(musicItem, undefined, autoDownload);
                }
            }}>
            {Left ? <Left /> : null}
            {index !== undefined ? (
                <ListItem.ListItemText
                    width={rpx(86)}
                    position="none"
                    fixedWidth
                    fontColor={highlight ? "primary" : "text"}
                    contentStyle={styles.indexText}>
                    {index}
                </ListItem.ListItemText>
            ) : null}
            <ListItem.Content
                title={
                    <TitleAndTag
                        title={musicItem.title}
                        titleFontColor={highlight ? "primary": "text"}
                        tag={musicItem.platform}
                    />
                }
                description={
                    <View style={styles.descContainer}>
                        {(isLocal || isDownloaded) && (
                            <Icon
                                style={styles.icon}
                                color="#11659a"
                                name="check-circle"
                                size={rpx(22)}
                            />
                        )}
                        <ThemeText
                            numberOfLines={1}
                            fontSize="description"
                            fontColor={highlight ? "primary" : "textSecondary"}>
                            {musicItem.artist}
                            {musicItem.album ? ` - ${musicItem.album}` : ""}
                        </ThemeText>
                    </View>
                }
            />
            {showMoreIcon ? (
                <ListItem.ListItemIcon
                    width={rpx(48)}
                    hitSlop={{
                        left: rpx(24),
                        right: rpx(24),
                    }}
                    position="none"
                    icon="ellipsis-vertical"
                    onPress={() => {
                        showPanel("MusicItemOptions", {
                            musicItem,
                            musicSheet,
                        });
                    }}
                />
            ) : null}
        </ListItem>
    );
}

const styles = StyleSheet.create({
    icon: {
        marginRight: rpx(6),
    },
    descContainer: {
        flexDirection: "row",
        marginTop: rpx(16),
    },

    indexText: {
        fontStyle: "italic",
        textAlign: "center",
        padding: rpx(2),
    },
});
