import streamDeck, {
	action,
	DialAction,
	DialDownEvent,
	DialRotateEvent,
	SingletonAction,
	WillAppearEvent,
	type DidReceiveSettingsEvent,
	type SendToPluginEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject, JsonValue } from "@elgato/utils";
import { discoverSpeakers } from "../discovery";
import { getName, getStatus, powerOn, setMute, setVolume, type Status } from "../musiccast";

type Settings = { ip?: string; manualIp?: string; name?: string; step?: number };
type Ctx = Pick<DialAction<Settings>, "setFeedback">;

const REFRESH_MS = 5000;

/** A manually typed IP wins over the one picked from the scan. */
const speakerIp = (s: Settings) => s.manualIp?.trim() || s.ip;

@action({ UUID: "com.jan.musiccast.volume" })
export class VolumeDial extends SingletonAction<Settings> {
	private state = new Map<string, Status>();
	private timers = new Map<string, NodeJS.Timeout>();
	private names = new Map<string, string>();
	private pending = new Map<string, NodeJS.Timeout>();

	override async onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> {
		if (!ev.action.isDial()) return;
		const dial = ev.action;
		const id = dial.id;
		await this.refresh(id, dial, ev.payload.settings);
		this.timers.set(id, setInterval(async () => {
			await this.refresh(id, dial, await dial.getSettings());
		}, REFRESH_MS));
	}

	override onWillDisappear(ev: WillDisappearEvent<Settings>): void {
		clearInterval(this.timers.get(ev.action.id));
		this.timers.delete(ev.action.id);
		this.state.delete(ev.action.id);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): Promise<void> {
		if (ev.action.isDial()) await this.refresh(ev.action.id, ev.action, ev.payload.settings);
	}

	/** The property inspector asks for the datasource "devices" to fill its speaker dropdown. */
	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, Settings>): Promise<void> {
		if ((ev.payload as JsonObject)?.event !== "devices") return;
		const speakers = await discoverSpeakers();
		await streamDeck.ui.sendToPropertyInspector({
			event: "devices",
			items: speakers.map((s) => ({ label: `${s.name} (${s.model}, ${s.ip})`, value: s.ip })),
		});
	}

	override async onDialRotate(ev: DialRotateEvent<Settings>): Promise<void> {
		const { step = 2 } = ev.payload.settings;
		const ip = speakerIp(ev.payload.settings);
		const id = ev.action.id;
		const st = this.state.get(id);
		if (!ip || !st) return this.refresh(id, ev.action, ev.payload.settings);
		if (!st.on) return;

		// Update locally right away, then send a single debounced request so fast turns feel smooth.
		st.volume = Math.min(st.maxVolume, Math.max(0, st.volume + ev.payload.ticks * step));
		await this.render(ev.action, ev.payload.settings, st);
		clearTimeout(this.pending.get(id));
		this.pending.set(id, setTimeout(() => {
			setVolume(ip, st.volume).catch((e) => ev.action.showAlert().then(() => console.error(e)));
		}, 80));
	}

	override async onDialDown(ev: DialDownEvent<Settings>): Promise<void> {
		const ip = speakerIp(ev.payload.settings);
		const st = this.state.get(ev.action.id);
		if (!ip || !st) return;
		try {
			if (!st.on) {
				await powerOn(ip);
				st.on = true;
			} else {
				st.mute = !st.mute;
				await setMute(ip, st.mute);
			}
			await this.render(ev.action, ev.payload.settings, st);
		} catch {
			await ev.action.showAlert();
		}
	}

	private async refresh(id: string, ctx: Ctx, settings: Settings): Promise<void> {
		const ip = speakerIp(settings);
		if (!ip) {
			await ctx.setFeedback({ title: settings.name || "MusicCast", value: "Set IP", indicator: 0 });
			return;
		}
		try {
			const st = await getStatus(ip);
			this.state.set(id, st);
			if (!this.names.has(ip)) {
				const name = await getName(ip).catch(() => undefined);
				if (name) this.names.set(ip, name);
			}
			await this.render(ctx, settings, st);
		} catch {
			this.state.delete(id);
			await ctx.setFeedback({ title: settings.name || this.names.get(ip) || ip, value: "offline", indicator: 0 });
		}
	}

	private render(ctx: Ctx, settings: Settings, st: Status): Promise<void> {
		return ctx.setFeedback({
			title: settings.name || this.names.get(speakerIp(settings) ?? "") || speakerIp(settings) || "MusicCast",
			value: !st.on ? "standby" : st.mute ? "muted" : `${st.volume}`,
			indicator: { value: Math.round((st.volume / st.maxVolume) * 100), enabled: st.on && !st.mute },
		});
	}
}
