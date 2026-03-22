import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, FluxDispatcher, PresenceStore, UserStore } from "@webpack/common";
import { findByPropsLazy } from "@webpack";

const NotificationModule = findByPropsLazy("showNotification", "requestPermission");

const settings = definePluginSettings({
    overrideStreamerMode: {
        type: OptionType.BOOLEAN,
        description: "Notify even when Streamer Mode is blocking notifications",
        default: false
    }
});

const priorityUsers = new Set<string>([
    "808910255374204989"
]);

let lastPing = 0;

function onMessage(event: any) {
    const { message } = event;
    if (!message?.author || event.optimistic) return;

    const currentUser = UserStore.getCurrentUser?.();   
    if (!currentUser || message.author.id === currentUser.id) return;

    const channel = ChannelStore.getChannel?.(message.channel_id);
    if (!channel || (channel.type !== 1 && channel.type !== 3)) return;

    if (PresenceStore.getStatus?.(currentUser.id) !== "dnd") return;
    if (!priorityUsers.has(message.author.id)) return;

    notify(message, channel);
}

function notify(message: any, channel: any) {
    const now = Date.now();
    if (now - lastPing < 1000) return;
    lastPing = now;

    const author = message.author;
    const avatar = author.avatar
        ? `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.png`
        : `https://cdn.discordapp.com/embed/avatars/${(BigInt(author.id) >> 22n) % 6n}.png`;

    NotificationModule.showNotification?.(
        avatar,
        author.globalName ?? author.username,
        message.content,
        { message, channel },
        {
            overrideStreamerMode: settings.store.overrideStreamerMode,
            sound: "message1",
            volume: 0.4
        }
    );
}

export default definePlugin({
    name: "PriorityDM",
    description: "Bypass Do Not Disturb for DMs from specific people.",
    authors: [{ name: "Snues", id: 98862725609816064n }],

    settings,

    start() {
        FluxDispatcher.subscribe("MESSAGE_CREATE", onMessage);
    },

    stop() {
        FluxDispatcher.unsubscribe("MESSAGE_CREATE", onMessage);
    }
});