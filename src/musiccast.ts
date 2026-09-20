export type Status = { volume: number; maxVolume: number; mute: boolean; on: boolean };

export async function call<T>(ip: string, path: string): Promise<T> {
	const res = await fetch(`http://${ip}/YamahaExtendedControl/v1/${path}`, { signal: AbortSignal.timeout(3000) });
	const json = (await res.json()) as { response_code: number } & T;
	if (json.response_code !== 0) throw new Error(`MusicCast error ${json.response_code} for ${path}`);
	return json;
}

export async function getStatus(ip: string): Promise<Status> {
	const s = await call<{ power: string; volume: number; max_volume: number; mute: boolean }>(ip, "main/getStatus");
	return { volume: s.volume, maxVolume: s.max_volume, mute: s.mute, on: s.power === "on" };
}

export async function setVolume(ip: string, volume: number): Promise<void> {
	await call(ip, `main/setVolume?volume=${Math.round(volume)}`);
}

export async function powerOn(ip: string): Promise<void> {
	await call(ip, "main/setPower?power=on");
}

export async function setMute(ip: string, mute: boolean): Promise<void> {
	await call(ip, `main/setMute?enable=${mute}`);
}

export async function getName(ip: string): Promise<string | undefined> {
	const n = await call<{ network_name?: string }>(ip, "system/getNetworkStatus");
	return n.network_name?.trim() || undefined;
}
