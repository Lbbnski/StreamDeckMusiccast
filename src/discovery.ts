import dgram from "node:dgram";
import os from "node:os";
import { call } from "./musiccast";

export type Speaker = { ip: string; name: string; model: string };

const SSDP_ADDR = "239.255.255.250";
const SSDP_PORT = 1900;
const SEARCH_MS = 3000;

const MSEARCH = Buffer.from(
	[
		"M-SEARCH * HTTP/1.1",
		`HOST: ${SSDP_ADDR}:${SSDP_PORT}`,
		'MAN: "ssdp:discover"',
		"MX: 2",
		"ST: urn:schemas-upnp-org:device:MediaRenderer:1",
		"",
		"",
	].join("\r\n"),
);

/** Sends an SSDP search from one local interface and resolves with the IPs that answered. */
function search(localIp: string): Promise<Set<string>> {
	return new Promise((resolve) => {
		const found = new Set<string>();
		const sock = dgram.createSocket({ type: "udp4", reuseAddr: true });
		const done = () => {
			try { sock.close(); } catch { /* already closed */ }
			resolve(found);
		};
		sock.on("error", done);
		sock.on("message", (_msg, rinfo) => found.add(rinfo.address));
		sock.bind(0, localIp, () => {
			try {
				sock.setMulticastInterface(localIp);
				sock.send(MSEARCH, SSDP_PORT, SSDP_ADDR);
			} catch {
				return done();
			}
			setTimeout(done, SEARCH_MS);
		});
	});
}

/** Confirms a host is a MusicCast device via Yamaha's own API; returns null for anything else. */
async function probe(ip: string): Promise<Speaker | null> {
	try {
		const [info, net] = await Promise.all([
			call<{ model_name: string }>(ip, "system/getDeviceInfo"),
			call<{ network_name?: string }>(ip, "system/getNetworkStatus").catch(() => ({}) as { network_name?: string }),
		]);
		return { ip, model: info.model_name, name: net.network_name ?? info.model_name };
	} catch {
		return null;
	}
}

export async function discoverSpeakers(): Promise<Speaker[]> {
	const locals = Object.values(os.networkInterfaces())
		.flat()
		.filter((i): i is os.NetworkInterfaceInfo => !!i && i.family === "IPv4" && !i.internal)
		.map((i) => i.address);

	const ips = new Set((await Promise.all(locals.map(search))).flatMap((s) => [...s]));
	const speakers = (await Promise.all([...ips].map(probe))).filter((s): s is Speaker => s !== null);
	return speakers.sort((a, b) => a.name.localeCompare(b.name));
}
