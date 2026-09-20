# MusicCast Volume for Stream Deck +

A Stream Deck plugin that controls the volume of Yamaha MusicCast speakers and receivers with the dials of a **Stream Deck +**.

- Turn the dial to change the volume, press it to switch the speaker on, mute or unmute.
- The dial display shows the speaker name, the current volume and a level bar.
- One dial controls one speaker, so several speakers can be controlled at the same time.
- Speakers are found automatically on your network. No need to look up IP addresses.

## Requirements

| Requirement | Details |
|---|---|
| Hardware | Stream Deck + (the plugin only provides a dial action) |
| Software | Stream Deck app 6.9 or newer, Windows 10 or newer |
| Speakers | Yamaha MusicCast devices on the same local network as your PC |
| Build tools | Node.js 20 or newer and npm (only needed to build from source) |

The Stream Deck app runs the plugin with its own bundled Node.js 20 runtime, so nothing else has to be installed to run it.

## Installation

The plugin is not published in the Elgato Marketplace, so it is installed from source and linked into the Stream Deck app.

```powershell
git clone https://github.com/Lbbnski/StreamDeckMusiccast.git
cd StreamDeckMusiccast
npm install
npm run build
npm run link
```

`npm run link` registers the `com.jan.musiccast.sdPlugin` folder with the Stream Deck app (it uses the Elgato CLI installed as a dev dependency). The plugin then appears in the action list under the category **MusicCast Volume**.

If the plugin does not show up, restart the Stream Deck app or run:

```powershell
npx streamdeck restart com.jan.musiccast
```

## Usage

1. Open the Stream Deck app and drag **Speaker Volume** from the **MusicCast Volume** category onto a dial.
2. In the settings panel, choose your speaker from the **Speaker** dropdown (see [Settings](#settings)).
3. Turn the dial to change the volume. Press the dial to switch the speaker on from standby, or to mute and unmute it.
4. To control another speaker, put another **Speaker Volume** action on a second dial and choose a different speaker.

### Dial behaviour

| Interaction | Effect |
|---|---|
| Rotate clockwise / counter-clockwise | Raises / lowers the volume by *Step* per tick, limited to 0 and the speaker's maximum |
| Press | Turns the speaker on if it is in standby, otherwise toggles mute |

While a speaker is in standby, turning the dial has no effect.

The display shows:

- **Title:** the name you configured, or the speaker's own name (see below).
- **Value:** the volume, `muted` while muted, `standby` while the speaker is switched off, `offline` if the speaker cannot be reached, or `Set IP` if no speaker is configured yet.
- **Bar:** the volume as a percentage of the speaker's maximum. It is hidden while muted or in standby.

The plugin re-reads the speaker state every 5 seconds, so volume or mute changes made with the Yamaha app or a remote control show up on the dial as well.

## Settings

| Setting | Description | Default |
|---|---|---|
| **Speaker** | Dropdown filled by a network scan when the settings panel opens. Each entry shows name, model and IP, for example `Heimkino (RX-V4A, 192.168.0.73)`. | none |
| **Manual IP** | IP address or host name of a speaker. Use it when the scan does not find your speaker. If set, it takes precedence over the dropdown. | empty |
| **Name** | Title shown on the dial (max. 16 characters). | the speaker's network name |
| **Step** | Volume change per dial tick, from 1 to 10. | 2 |

Tip: give your speakers fixed IP addresses (a DHCP reservation in your router). The plugin stores the IP address, so a changed address makes the dial show `offline` until you pick the speaker again.

## How it works

### Speaker control

The plugin talks to the speakers with Yamaha's Extended Control HTTP API at `http://<ip>/YamahaExtendedControl/v1/`. Only the main zone is used.

| Purpose | Request |
|---|---|
| Read power state, volume, maximum volume, mute | `main/getStatus` |
| Set volume | `main/setVolume?volume=<n>` |
| Turn on from standby | `main/setPower?power=on` |
| Mute / unmute | `main/setMute?enable=<true\|false>` |
| Speaker name | `system/getNetworkStatus` |
| Identify a MusicCast device | `system/getDeviceInfo` |

Requests time out after 3 seconds. A response code other than `0` is treated as an error.

Volume changes are applied on the dial display immediately. The request to the speaker is sent once, 80 ms after the last tick, so fast turns do not flood the speaker with requests.

### Speaker discovery

When the settings panel opens, the plugin scans the network:

1. For every non-internal IPv4 network adapter it sends an SSDP `M-SEARCH` for `urn:schemas-upnp-org:device:MediaRenderer:1` to `239.255.255.250:1900` and listens for 3 seconds. Searching from every adapter means it works with Wi-Fi and Ethernet at the same time.
2. Every host that answers is verified with `system/getDeviceInfo`. Hosts that are not MusicCast devices (other UPnP renderers, TVs, ...) are dropped.
3. The name and model of the remaining devices are read and sent to the settings panel, which fills the dropdown.

Discovery finds speakers on the same network segment only. It does not cross routers or VPNs. Use **Manual IP** in that case.

## Project structure

```
.
├── src/
│   ├── plugin.ts              Entry point, registers the action
│   ├── musiccast.ts           MusicCast HTTP API client
│   ├── discovery.ts           SSDP discovery and device verification
│   └── actions/
│       └── volume.ts          The "Speaker Volume" dial action
├── com.jan.musiccast.sdPlugin/
│   ├── manifest.json          Plugin manifest (action, controller, icons)
│   ├── ui/
│   │   └── property-inspector.html   Settings panel
│   ├── imgs/                  Icons
│   └── bin/                   Build output (generated, not committed)
├── rollup.config.mjs          Bundles src/ into bin/plugin.js
└── tsconfig.json
```

The plugin is written in TypeScript on top of Elgato's [`@elgato/streamdeck`](https://www.npmjs.com/package/@elgato/streamdeck) SDK. The settings panel uses [sdpi-components](https://sdpi-components.dev), which is loaded from the web when the panel opens, so an internet connection is needed to show the settings.

## Development

| Command | Description |
|---|---|
| `npm run build` | Type-checks and bundles the plugin to `com.jan.musiccast.sdPlugin/bin/plugin.js` |
| `npm run watch` | Rebuilds on every change |
| `npm run link` | Links the plugin folder into the Stream Deck app |
| `npx streamdeck restart com.jan.musiccast` | Reloads the plugin after a rebuild |
| `npx streamdeck validate com.jan.musiccast.sdPlugin` | Validates the manifest |

Plugin logs are written to `com.jan.musiccast.sdPlugin/logs/`. The manifest enables Node.js debugging, so you can attach a debugger to the running plugin as described in the [Stream Deck SDK documentation](https://docs.elgato.com/streamdeck/sdk/).

### Adding another action

1. Create a class extending `SingletonAction` in `src/actions/` and decorate it with `@action({ UUID: "com.jan.musiccast.<name>" })`.
2. Register it in `src/plugin.ts`.
3. Add a matching entry to `Actions` in `manifest.json`.

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Dropdown stays empty or shows "Scanning network…" | The scan takes about 3 seconds. If nothing appears, the speaker may be on another network segment, or a firewall blocks multicast UDP (port 1900). Enter the IP in **Manual IP**. |
| Dial shows `offline` | The speaker is off the network, in deep standby with network standby disabled, or its IP changed. A speaker in standby shows `standby` instead and can be woken with a press, provided network standby is enabled. In the Yamaha app, enable network standby, and pick the speaker again. |
| Dial shows `Set IP` | No speaker is selected yet. Open the settings and choose one. |
| Settings panel is empty | sdpi-components is loaded from the internet. Check your connection. |
| Dial does not react at all | Check `com.jan.musiccast.sdPlugin/logs/` and rebuild with `npm run build`, then restart the plugin. |
| Plugin is missing in the Stream Deck app | Run `npm run link` again and restart the Stream Deck app. |

## Limitations

- Only the main zone of a speaker is controlled.
- Speakers are identified by IP address, so a changed address has to be reselected.
- Discovery works within the local network segment only.
- Only Stream Deck + dials are supported, there is no button action.

## Disclaimer

This project is not affiliated with Yamaha or Elgato. MusicCast is a trademark of Yamaha Corporation, Stream Deck is a trademark of Corsair Memory, Inc.
