import streamDeck from "@elgato/streamdeck";
import { VolumeDial } from "./actions/volume";

streamDeck.actions.registerAction(new VolumeDial());
streamDeck.connect();
