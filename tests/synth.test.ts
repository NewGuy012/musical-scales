import { describe, expect, test } from "bun:test";
import {
	getDefaultChordSpread,
	midiToFrequency,
	playChordNotes,
	playSingleNote,
	stopAllAudio,
	synthesizeGuitarPluckSamples,
} from "../src/react-app/audio/synth";

function detectFundamentalAutocorrelation(
	samples: Float32Array,
	sampleRate: number,
	expectedFreq: number,
): number {
	const startIdx = Math.floor(sampleRate * 0.04);
	const windowLen = Math.min(samples.length - startIdx - 1200, 4096);
	const expectedLag = Math.round(sampleRate / expectedFreq);
	const minLag = Math.max(8, Math.floor(expectedLag * 0.8));
	const maxLag = Math.min(windowLen - 1, Math.ceil(expectedLag * 1.25));

	let bestLag = expectedLag;
	let bestCorr = -Infinity;
	for (let lag = minLag; lag <= maxLag; lag++) {
		let corr = 0;
		let energyA = 0;
		let energyB = 0;
		for (let i = 0; i < windowLen; i++) {
			const a = samples[startIdx + i];
			const b = samples[startIdx + i + lag];
			corr += a * b;
			energyA += a * a;
			energyB += b * b;
		}
		const norm = corr / Math.sqrt(Math.max(1e-12, energyA * energyB));
		if (norm > bestCorr) {
			bestCorr = norm;
			bestLag = lag;
		}
	}

	return sampleRate / bestLag;
}

describe("instrument synthesis engine", () => {
	test("midiToFrequency computes standard A4=440Hz and cello C2", () => {
		expect(midiToFrequency(69)).toBeCloseTo(440, 6);
		expect(midiToFrequency(60)).toBeCloseTo(261.6256, 3);
		expect(midiToFrequency(36)).toBeCloseTo(65.4064, 3);
	});

	test("Karplus-Strong guitar pluck maintains exact tuning across E2–E5 and decays cleanly", () => {
		const sampleRate = 48000;
		const guitarMidiNotes = [40, 45, 50, 55, 59, 64, 76];

		for (const midi of guitarMidiNotes) {
			const freq = midiToFrequency(midi);
			const samples = synthesizeGuitarPluckSamples(freq, sampleRate, 1.5);
			expect(samples.length).toBe(Math.floor(sampleRate * 1.5));

			let maxAbs = 0;
			for (let i = 0; i < samples.length; i++) {
				const v = samples[i];
				expect(Number.isFinite(v)).toBe(true);
				if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
			}
			expect(maxAbs).toBeGreaterThan(0.2);
			expect(maxAbs).toBeLessThanOrEqual(1.0);

			let earlyRms = 0;
			let tailRms = 0;
			const chunk = 2400;
			for (let i = 200; i < 200 + chunk; i++) {
				earlyRms += samples[i] * samples[i];
			}
			const tailStart = samples.length - chunk - 200;
			for (let i = tailStart; i < tailStart + chunk; i++) {
				tailRms += samples[i] * samples[i];
			}
			expect(Math.sqrt(earlyRms / chunk)).toBeGreaterThan(
				Math.sqrt(tailRms / chunk) * 2,
			);

			const detectedFreq = detectFundamentalAutocorrelation(
				samples,
				sampleRate,
				freq,
			);
			expect(Math.abs(detectedFreq - freq) / freq).toBeLessThan(0.015);
		}
	});

	test("playback helpers safely handle presets, invalid MIDI, and stopAllAudio outside browser", () => {
		expect(getDefaultChordSpread("guitar")).toBe(0.038);
		expect(getDefaultChordSpread("cello")).toBe(0.058);
		expect(getDefaultChordSpread("piano")).toBe(0.01);

		const presets = ["piano", "guitar", "cello", "pad", "muted"] as const;
		for (const preset of presets) {
			expect(() => playSingleNote(60, preset, 0.5)).not.toThrow();
			expect(() => playSingleNote(-5, preset, 0.5)).not.toThrow();
			expect(() => playSingleNote(999, preset, 0.5)).not.toThrow();
			expect(() =>
				playChordNotes([48, 52, 55, Number.NaN, 200], {
					preset,
					duration: 0.8,
				}),
			).not.toThrow();
		}
		expect(() => stopAllAudio()).not.toThrow();
	});
});
