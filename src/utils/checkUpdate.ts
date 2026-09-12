import axios from "axios";
import { compare } from "compare-versions";
import DeviceInfo from "react-native-device-info";

const updateList = [
    "https://raw.githubusercontent.com/dyr1980/liu269569205MusicFree/main/release/version.json",
    "https://cdn.jsdelivr.net/gh/dyr1980/liu269569205MusicFree@main/release/version.json",
    "https://gh-proxy.com/https://raw.githubusercontent.com/dyr1980/liu269569205MusicFree/main/release/version.json",
    "https://ghproxy.net/https://raw.githubusercontent.com/dyr1980/liu269569205MusicFree/main/release/version.json",
];

interface IUpdateInfo {
    needUpdate: boolean;
    data: {
        version: string;
        changeLog: string[];
        download: string[];
    };
}

export default async function checkUpdate(): Promise<IUpdateInfo | undefined> {
    const currentVersion = DeviceInfo.getVersion();
    for (let i = 0; i < updateList.length; ++i) {
        try {
            const rawInfo = (await axios.get(updateList[i])).data;
            if (compare(rawInfo.version, currentVersion, ">")) {
                return {
                    needUpdate: true,
                    data: rawInfo,
                };
            }
        } catch {}
    }
}
