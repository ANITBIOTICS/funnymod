import { definePluginSettings } from "@api/Settings";
import { getUserSettingLazy } from "@api/UserSettings";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { ChannelStore, FluxDispatcher, Forms, Button, TextInput, UserStore, useState } from "@webpack/common";
import ErrorBoundary from "@components/ErrorBoundary";

const NotificationModule = findByPropsLazy("showNotification", "requestPermission");

const StatusSetting = getUserSettingLazy<string>("status", "status")!;

let pluginEnabled = true;
const listeners = new Set<() => void>();

let toastEl: HTMLDivElement | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function showOverlayToast(text: string) {
    if (toastEl) {
        if (toastTimer) clearTimeout(toastTimer);
        toastEl.remove();
        toastEl = null;
    }
    const el = document.createElement("div");
    el.textContent = text;
    Object.assign(el.style, {
        position: "fixed",
        top: "12px",
        left: "12px",
        padding: "4px 10px",
        borderRadius: "4px",
        backgroundColor: "rgba(0,0,0,0.7)",
        color: "#ccc",
        fontSize: "12px",
        fontFamily: "var(--font-primary)",
        fontWeight: "500",
        zIndex: "999999",
        pointerEvents: "none",
        opacity: "1",
        transition: "opacity 0.1s ease",
    });
    document.body.appendChild(el);
    toastEl = el;
    toastTimer = setTimeout(() => {
        el.style.opacity = "0";
        setTimeout(() => { if (toastEl === el) { el.remove(); toastEl = null; } }, 120);
    }, 600);
}

function togglePlugin() {
    pluginEnabled = !pluginEnabled;
    for (const fn of listeners) fn();
    showOverlayToast(`PriorityDM ${pluginEnabled ? "ON" : "OFF"}`);
}

function onKeyDown(e: KeyboardEvent) {
    if (e.ctrlKey && e.altKey && e.code === "Backslash") {
        e.preventDefault();
        togglePlugin();
    }
}

let indicatorEl: HTMLDivElement | null = null;

function updateIndicator() {
    if (!indicatorEl) return;
    indicatorEl.style.backgroundColor = pluginEnabled ? "var(--green-360)" : "var(--background-primary)";
    indicatorEl.style.color = pluginEnabled ? "white" : "var(--text-muted)";
    indicatorEl.title = `PriorityDM: ${pluginEnabled ? "ON" : "OFF"} (Ctrl+Alt+\\)`;
}

function createIndicator() {
    indicatorEl = document.createElement("div");
    indicatorEl.id = "vc-priority-dm-indicator";
    indicatorEl.textContent = "P";
    Object.assign(indicatorEl.style, {
        position: "fixed",
        bottom: "14px",
        right: "14px",
        width: "24px",
        height: "24px",
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        fontSize: "11px",
        fontWeight: "700",
        transition: "background-color 0.2s, color 0.2s, opacity 0.2s",
        zIndex: "99999",
        userSelect: "none",
        opacity: "0.35",
    });
    indicatorEl.addEventListener("mouseenter", () => { if (indicatorEl) indicatorEl.style.opacity = "1"; });
    indicatorEl.addEventListener("mouseleave", () => { if (indicatorEl) indicatorEl.style.opacity = "0.35"; });
    updateIndicator();
    indicatorEl.addEventListener("click", togglePlugin);
    document.body.appendChild(indicatorEl);
    listeners.add(updateIndicator);
}

function removeIndicator() {
    listeners.delete(updateIndicator);
    if (indicatorEl) {
        indicatorEl.removeEventListener("click", togglePlugin);
        indicatorEl.remove();
        indicatorEl = null;
    }
}

interface PriorityUser {
    id: string;
    nickname: string;
}

function parsePriorityUsers(raw: string): PriorityUser[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
    } catch { }
    // migrate from old comma-separated format
    return raw.split(",").filter(Boolean).map(id => ({ id, nickname: "" }));
}

function savePriorityUsers(users: PriorityUser[]) {
    settings.store.priorityUserIds = JSON.stringify(users);
}

function PriorityUsersComponent() {
    const users = usePriorityUsers();
    const [newId, setNewId] = useState("");
    const [newNick, setNewNick] = useState("");
    const [error, setError] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editUserId, setEditUserId] = useState("");
    const [editNick, setEditNick] = useState("");

    function addUser() {
        const trimmedId = newId.trim();
        if (!trimmedId) return;
        if (!/^\d{17,20}$/.test(trimmedId)) {
            setError("Must be a valid Discord user ID (17-20 digits)");
            return;
        }
        if (users.some(u => u.id === trimmedId)) {
            setError("User already in list");
            return;
        }
        savePriorityUsers([...users, { id: trimmedId, nickname: newNick.trim() }]);
        setNewId("");
        setNewNick("");
        setError("");
    }

    function removeUser(id: string) {
        savePriorityUsers(users.filter(u => u.id !== id));
    }

    function startEdit(user: PriorityUser) {
        setEditingId(user.id);
        setEditUserId(user.id);
        setEditNick(user.nickname);
    }

    function saveEdit(oldId: string) {
        const trimmedId = editUserId.trim();
        if (!trimmedId || !/^\d{17,20}$/.test(trimmedId)) {
            setError("Must be a valid Discord user ID (17-20 digits)");
            return;
        }
        if (trimmedId !== oldId && users.some(u => u.id === trimmedId)) {
            setError("User already in list");
            return;
        }
        savePriorityUsers(users.map(u =>
            u.id === oldId ? { id: trimmedId, nickname: editNick.trim() } : u
        ));
        setEditingId(null);
        setEditUserId("");
        setEditNick("");
        setError("");
    }

    return (
        <ErrorBoundary>
            <Forms.FormTitle>Priority Users</Forms.FormTitle>
            <Forms.FormText style={{ marginBottom: 8 }}>
                Add Discord user IDs that can bypass Do Not Disturb in DMs.
                Set a custom nickname to override the name shown in notifications.
            </Forms.FormText>

            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <TextInput
                    placeholder="User ID"
                    value={newId}
                    onChange={setNewId}
                    onKeyDown={(e: KeyboardEvent) => e.key === "Enter" && addUser()}
                    style={{ flex: 1 }}
                />
                <TextInput
                    placeholder="Nickname (optional)"
                    value={newNick}
                    onChange={setNewNick}
                    onKeyDown={(e: KeyboardEvent) => e.key === "Enter" && addUser()}
                    style={{ flex: 1 }}
                />
                <Button onClick={addUser}>Add</Button>
            </div>

            {error && (
                <Forms.FormText style={{ color: "var(--text-danger)", marginBottom: 8 }}>
                    {error}
                </Forms.FormText>
            )}

            {users.length === 0 && (
                <Forms.FormText>No priority users added yet.</Forms.FormText>
            )}

            {users.map(u => (
                <div key={u.id} style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 8px",
                    marginBottom: 4,
                    borderRadius: 4,
                    backgroundColor: "var(--background-secondary)",
                    gap: 8
                }}>
                    {editingId === u.id ? (
                        <>
                            <TextInput
                                placeholder="User ID"
                                value={editUserId}
                                onChange={setEditUserId}
                                onKeyDown={(e: KeyboardEvent) => e.key === "Enter" && saveEdit(u.id)}
                                style={{ flex: 1 }}
                            />
                            <TextInput
                                placeholder="Nickname (optional)"
                                value={editNick}
                                onChange={setEditNick}
                                onKeyDown={(e: KeyboardEvent) => e.key === "Enter" && saveEdit(u.id)}
                                style={{ flex: 1 }}
                            />
                            <Button
                                size={Button.Sizes.SMALL}
                                onClick={() => saveEdit(u.id)}
                            >
                                Save
                            </Button>
                            <Button
                                color={Button.Colors.TRANSPARENT}
                                size={Button.Sizes.SMALL}
                                onClick={() => setEditingId(null)}
                            >
                                Cancel
                            </Button>
                        </>
                    ) : (
                        <>
                            <span>
                                <UserLabel userId={u.id} />
                                {u.nickname && (
                                    <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>
                                        — notifies as "{u.nickname}"
                                    </span>
                                )}
                            </span>
                            <div style={{ display: "flex", gap: 4 }}>
                                <Button
                                    size={Button.Sizes.SMALL}
                                    onClick={() => startEdit(u)}
                                >
                                    Edit
                                </Button>
                                <Button
                                    color={Button.Colors.RED}
                                    size={Button.Sizes.SMALL}
                                    onClick={() => removeUser(u.id)}
                                >
                                    Remove
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            ))}
        </ErrorBoundary>
    );
}

function UserLabel({ userId }: { userId: string; }) {
    const user = UserStore.getUser(userId);
    if (user) {
        return <span>{user.globalName ?? user.username} ({userId})</span>;
    }
    return <span>{userId}</span>;
}

function usePriorityUsers(): PriorityUser[] {
    const raw = settings.use(["priorityUserIds"]).priorityUserIds as string;
    return parsePriorityUsers(raw);
}

function getPriorityUsers(): Map<string, PriorityUser> {
    const raw = settings.store.priorityUserIds as string;
    const users = parsePriorityUsers(raw);
    return new Map(users.map(u => [u.id, u]));
}

const settings = definePluginSettings({
    overrideStreamerMode: {
        type: OptionType.BOOLEAN,
        description: "Notify even when Streamer Mode is blocking notifications",
        default: false
    },
    priorityUserIds: {
        type: OptionType.STRING,
        description: "JSON list of priority users (managed by the UI below)",
        default: "",
        hidden: true
    },
    priorityUsersUI: {
        type: OptionType.COMPONENT,
        description: "",
        component: PriorityUsersComponent
    }
});

let lastPing = 0;

function onMessage(event: any) {
    const { message } = event;
    if (!message?.author || event.optimistic) return;

    const currentUser = UserStore.getCurrentUser?.();
    if (!currentUser || message.author.id === currentUser.id) return;

    const channel = ChannelStore.getChannel?.(message.channel_id);
    if (!channel || (channel.type !== 1 && channel.type !== 3)) return;

    if (StatusSetting.getSetting() !== "dnd") return;
    if (document.hasFocus()) return;
    if (!pluginEnabled) return;

    const priorityMap = getPriorityUsers();
    const entry = priorityMap.get(message.author.id);
    if (!entry) return;

    notify(message, channel, entry.nickname);
}

function notify(message: any, channel: any, nickname: string) {
    const now = Date.now();
    if (now - lastPing < 1000) return;
    lastPing = now;

    const author = message.author;
    const avatar = author.avatar
        ? `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.png`
        : `https://cdn.discordapp.com/embed/avatars/${(BigInt(author.id) >> 22n) % 6n}.png`;

    const displayName = nickname || author.globalName || author.username;

    NotificationModule.showNotification(
        avatar,
        displayName,
        message.content,
        { message, channel },
        {
            overrideStreamerMode: settings.store.overrideStreamerMode,
        }
    );
}

export default definePlugin({
    name: "PriorityDM",
    description: "Bypass Do Not Disturb for DMs from specific people.",
    authors: [{ name: "festivixy", id: 808910255374204989 }],

    settings,

    start() {
        pluginEnabled = true;
        FluxDispatcher.subscribe("MESSAGE_CREATE", onMessage);
        document.addEventListener("keydown", onKeyDown);
        createIndicator();
    },

    stop() {
        FluxDispatcher.unsubscribe("MESSAGE_CREATE", onMessage);
        document.removeEventListener("keydown", onKeyDown);
        removeIndicator();
    }
});
