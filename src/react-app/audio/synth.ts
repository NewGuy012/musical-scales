export type InstrumentVoice = "piano" | "guitar" | "cello" | "pad";
export type SoundPreset = InstrumentVoice | "muted";

interface AudioEngine {
	ctx: AudioContext;
	master: GainNode;
	noiseBuffer: AudioBuffer;
}

let sharedEngine: AudioEngine | null = null;
const guitarBufferCache = new Map<string, AudioBuffer>();
const MAX_GUITAR_CACHE_SIZE = 72;

function getAudioEngine(): AudioEngine | null {
	if (typeof window === "undefined") return null;
	const AudioCtx =
		window.AudioContext ||
		(window as unknown as { webkitAudioContext?: typeof AudioContext })
			.webkitAudioContext;
	if (!AudioCtx) return null;

	if (!sharedEngine) {
		const ctx = new AudioCtx();
		const compressor = ctx.createDynamicsCompressor();
		compressor.threshold.value = -16;
		compressor.knee.value = 18;
		compressor.ratio.value = 3.5;
		compressor.attack.value = 0.004;
		compressor.release.value = 0.16;

		const master = ctx.createGain();
		master.gain.value = 0.72;

		// Subtle feedforward room early reflections so acoustic instruments sit naturally in space
		const roomTone = ctx.createBiquadFilter();
		roomTone.type = "lowpass";
		roomTone.frequency.value = 1650;

		const tap1 = ctx.createDelay(0.1);
		tap1.delayTime.value = 0.021;
		const tap1Gain = ctx.createGain();
		tap1Gain.gain.value = 0.095;

		const tap2 = ctx.createDelay(0.1);
		tap2.delayTime.value = 0.039;
		const tap2Gain = ctx.createGain();
		tap2Gain.gain.value = 0.065;

		master.connect(compressor);
		master.connect(tap1);
		master.connect(tap2);
		tap1.connect(tap1Gain);
		tap2.connect(tap2Gain);
		tap1Gain.connect(roomTone);
		tap2Gain.connect(roomTone);
		roomTone.connect(compressor);
		compressor.connect(ctx.destination);

		// Shared deterministic 0.35s noise buffer for hammer felt / rosin bow attacks
		const noiseLen = Math.floor(ctx.sampleRate * 0.35);
		const noiseBuffer = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
		const noiseData = noiseBuffer.getChannelData(0);
		const rand = createSeededRandom(1337);
		for (let i = 0; i < noiseLen; i++) {
			noiseData[i] = rand();
		}

		sharedEngine = { ctx, master, noiseBuffer };
	}

	if (sharedEngine.ctx.state === "suspended") {
		void sharedEngine.ctx.resume();
	}

	return sharedEngine;
}

function createSeededRandom(seed: number): () => number {
	let s = seed | 0;
	return () => {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
	};
}

export function midiToFrequency(midi: number): number {
	return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Generates an accurately tuned classical nylon-string guitar pluck via
 * Karplus-Strong waveguide synthesis with fingertip smoothing, soundhole pluck
 * comb filtering, viscous nylon damping, and Thiran fractional-delay tuning.
 */
export function synthesizeGuitarPluckSamples(
	freq: number,
	sampleRate: number,
	totalSeconds: number,
): Float32Array {
	const fs = Math.max(8000, sampleRate);
	const clampedFreq = Math.max(40, Math.min(fs * 0.25, freq));
	const numSamples = Math.max(256, Math.floor(fs * Math.max(0.1, totalSeconds)));
	const out = new Float32Array(numSamples);

	// Pitch normalized from E2 (~82.4 Hz) to E5 (~659 Hz)
	const normPitch = Math.max(
		0,
		Math.min(1, (Math.log2(clampedFreq) - Math.log2(82.41)) / 3),
	);
	// Warm classical loop filters: averaging blend + nylon viscoelastic IIR damping
	const blend = 0.48 - normPitch * 0.08;
	const nylonDamp = 0.14 + normPitch * 0.14;

	const w = (2 * Math.PI * clampedFreq) / fs;
	// H1(z) = (1 - blend) + blend * z^-1
	const r1 = 1 - blend + blend * Math.cos(w);
	const i1 = -blend * Math.sin(w);
	const pd1 = w > 0 ? -Math.atan2(i1, r1) / w : blend;
	const mag1 = Math.hypot(r1, i1);

	// H2(z) = (1 - nylonDamp) / (1 - nylonDamp * z^-1)
	const r2 = 1 - nylonDamp * Math.cos(w);
	const i2 = nylonDamp * Math.sin(w);
	const pd2 = w > 0 ? Math.atan2(i2, r2) / w : nylonDamp / (1 - nylonDamp);
	const mag2 = (1 - nylonDamp) / Math.hypot(r2, i2);

	const totalPhaseDelay = pd1 + pd2;
	const totalFilterMag = mag1 * mag2;

	// Split fractional period into integer delay ring M + Thiran allpass tau in [0.5, 1.5)
	const exactPeriod = fs / clampedFreq - totalPhaseDelay;
	const M = Math.max(2, Math.floor(exactPeriod - 0.5));
	const tau = Math.max(0.25, Math.min(1.75, exactPeriod - M));
	const allpassCoeff = (1 - tau) / (1 + tau);

	// Classical nylon bass sustain (~3.3s) and warm singing treble decay (~2.0s)
	const decaySec = 3.3 - normPitch * 1.25;
	const targetLoopGain = Math.pow(0.001, 1 / (clampedFreq * decaySec));
	const loopFeedback = Math.min(
		0.9986,
		targetLoopGain / Math.max(0.45, totalFilterMag),
	);

	// Seed burst shaped like warm fingertip pluck (sample-rate normalized low-pass + DC removal)
	const rawBurst = new Float32Array(M);
	const rand = createSeededRandom(Math.round(clampedFreq * 100));
	const pickPole = Math.exp((-2 * Math.PI * 2200) / fs);
	let lpState = 0;
	for (let i = 0; i < M * 2; i++) {
		lpState = (1 - pickPole) * rand() + pickPole * lpState;
		rawBurst[i % M] = lpState;
	}
	// Second backward smoothing pass eliminates harsh pick fizz while keeping finger warmth
	for (let i = M - 1; i >= 0; i--) {
		lpState = (1 - pickPole) * rawBurst[i] + pickPole * lpState;
		rawBurst[i] = lpState;
	}

	let mean = 0;
	for (let i = 0; i < M; i++) mean += rawBurst[i];
	mean /= M;

	// Rosette/soundhole pluck position (~22% from bridge) emphasizes warm fundamental & cedar body
	const ring = new Float32Array(M);
	const pluckOffset = Math.max(1, Math.min(M - 1, Math.round(M * 0.22)));
	let peak = 0;
	for (let i = 0; i < M; i++) {
		const a = rawBurst[i] - mean;
		const b = rawBurst[(i - pluckOffset + M) % M] - mean;
		const val = 0.65 * (a - 0.68 * b) + 0.35 * a;
		ring[i] = val;
		const absVal = Math.abs(val);
		if (absVal > peak) peak = absVal;
	}
	const normScale = peak > 1e-6 ? 0.88 / peak : 1;
	for (let i = 0; i < M; i++) {
		ring[i] *= normScale;
	}

	// Waveguide loop
	let ptr = 0;
	let prevCur = ring[M - 1];
	let iirLp = 0;
	let prevLp = 0;
	let prevAp = 0;

	const fadeInSamples = Math.min(numSamples, Math.round(fs * 0.0032));
	const fadeOutSamples = Math.min(numSamples, Math.round(fs * 0.075));
	const fadeOutStart = numSamples - fadeOutSamples;

	for (let i = 0; i < numSamples; i++) {
		const cur = ring[ptr];
		const fir = (1 - blend) * cur + blend * prevCur;
		prevCur = cur;

		iirLp = (1 - nylonDamp) * fir + nylonDamp * iirLp;

		const ap = allpassCoeff * iirLp + prevLp - allpassCoeff * prevAp;
		prevLp = iirLp;
		prevAp = ap;

		ring[ptr] = ap * loopFeedback;
		ptr = ptr + 1;
		if (ptr >= M) ptr = 0;

		let env = 1;
		if (i < fadeInSamples) {
			env = i / fadeInSamples;
		} else if (i >= fadeOutStart) {
			env = (numSamples - i) / fadeOutSamples;
		}
		out[i] = Math.max(-1, Math.min(1, ap * env));
	}

	return out;
}

function getGuitarPluckBuffer(
	ctx: AudioContext,
	freq: number,
	totalSeconds: number,
): AudioBuffer {
	const quantizedDur = Math.ceil(totalSeconds * 4) / 4;
	const key = `${ctx.sampleRate}:${Math.round(freq * 10)}:${quantizedDur}`;
	const cached = guitarBufferCache.get(key);
	if (cached) return cached;

	const samples = synthesizeGuitarPluckSamples(
		freq,
		ctx.sampleRate,
		quantizedDur,
	);
	const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
	buffer.getChannelData(0).set(samples);

	if (guitarBufferCache.size >= MAX_GUITAR_CACHE_SIZE) {
		const oldestKey = guitarBufferCache.keys().next().value;
		if (oldestKey) guitarBufferCache.delete(oldestKey);
	}
	guitarBufferCache.set(key, buffer);
	return buffer;
}

function schedulePianoVoice(
	engine: AudioEngine,
	midi: number,
	startTime: number,
	duration: number,
	peakGain: number,
) {
	const { ctx, master, noiseBuffer } = engine;
	const freq = midiToFrequency(midi);
	const pitchNorm = Math.max(0, Math.min(1, (midi - 21) / 87));

	// Triple-string warmth (triangle fundamental + softly detuned sawtooth harmonics + fading octave partial)
	const oscTri = ctx.createOscillator();
	const oscSaw = ctx.createOscillator();
	const oscOct = ctx.createOscillator();
	const triGain = ctx.createGain();
	const sawGain = ctx.createGain();
	const octGain = ctx.createGain();

	oscTri.type = "triangle";
	oscTri.frequency.setValueAtTime(freq, startTime);
	oscTri.detune.setValueAtTime(-1.8, startTime);
	triGain.gain.setValueAtTime(0.78, startTime);

	oscSaw.type = "sawtooth";
	oscSaw.frequency.setValueAtTime(freq, startTime);
	oscSaw.detune.setValueAtTime(1.8, startTime);
	sawGain.gain.setValueAtTime(0.36 - pitchNorm * 0.12, startTime);

	oscOct.type = "sine";
	oscOct.frequency.setValueAtTime(freq * 2.0012, startTime);
	octGain.gain.setValueAtTime(0.2, startTime);
	octGain.gain.exponentialRampToValueAtTime(0.015, startTime + 0.42);

	// Felt hammer impact thump (22ms burst)
	const hammerSrc = ctx.createBufferSource();
	hammerSrc.buffer = noiseBuffer;
	const hammerFilter = ctx.createBiquadFilter();
	hammerFilter.type = "bandpass";
	hammerFilter.frequency.setValueAtTime(
		Math.min(2400, Math.max(420, freq * 4.2)),
		startTime,
	);
	hammerFilter.Q.value = 1.6;
	const hammerGain = ctx.createGain();
	hammerGain.gain.setValueAtTime(0.0001, startTime);
	hammerGain.gain.linearRampToValueAtTime(peakGain * 0.12, startTime + 0.003);
	hammerGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.025);

	// Dynamic string brightness filter + upright/grand soundboard body warmth
	const stringFilter = ctx.createBiquadFilter();
	stringFilter.type = "lowpass";
	stringFilter.frequency.setValueAtTime(
		Math.min(5800, Math.max(950, freq * (9.5 - pitchNorm * 4))),
		startTime,
	);
	stringFilter.frequency.exponentialRampToValueAtTime(
		Math.min(3200, Math.max(550, freq * 4.6)),
		startTime + 0.075,
	);
	stringFilter.frequency.exponentialRampToValueAtTime(
		Math.max(320, freq * 2.0),
		startTime + Math.min(0.75, duration + 0.18),
	);
	stringFilter.Q.value = 0.7;

	const boardResonance = ctx.createBiquadFilter();
	boardResonance.type = "peaking";
	boardResonance.frequency.value = 230;
	boardResonance.Q.value = 1.1;
	boardResonance.gain.value = 2.4;

	const release = 0.65 - pitchNorm * 0.24;
	const stopTime = startTime + duration + release;
	const noteGain = ctx.createGain();
	noteGain.gain.setValueAtTime(0.0001, startTime);
	noteGain.gain.linearRampToValueAtTime(peakGain * 1.12, startTime + 0.005);
	noteGain.gain.exponentialRampToValueAtTime(peakGain * 0.68, startTime + 0.08);
	noteGain.gain.exponentialRampToValueAtTime(
		peakGain * 0.36,
		startTime + Math.max(0.14, duration * 0.72),
	);
	noteGain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

	oscTri.connect(triGain);
	oscSaw.connect(sawGain);
	oscOct.connect(octGain);
	triGain.connect(stringFilter);
	sawGain.connect(stringFilter);
	octGain.connect(stringFilter);
	stringFilter.connect(boardResonance);

	hammerSrc.connect(hammerFilter);
	hammerFilter.connect(hammerGain);
	hammerGain.connect(boardResonance);

	boardResonance.connect(noteGain);
	noteGain.connect(master);

	const offset = ((midi * 17) % 100) * 0.002;
	oscTri.start(startTime);
	oscSaw.start(startTime);
	oscOct.start(startTime);
	hammerSrc.start(startTime, offset, 0.03);

	oscTri.stop(stopTime + 0.03);
	oscSaw.stop(stopTime + 0.03);
	oscOct.stop(stopTime + 0.03);
	hammerSrc.stop(startTime + 0.035);
}

function scheduleGuitarVoice(
	engine: AudioEngine,
	midi: number,
	startTime: number,
	duration: number,
	peakGain: number,
) {
	const { ctx, master } = engine;
	const freq = midiToFrequency(midi);
	const release = 0.95;
	const totalDur = Math.max(duration + release, 1.95);
	const stopTime = startTime + duration + release;

	const src = ctx.createBufferSource();
	src.buffer = getGuitarPluckBuffer(ctx, freq, totalDur);

	// Classical Torres/Spanish cedar body resonances:
	// Warm A0 soundhole air chamber (~96 Hz) + main cedar top monopole (~194 Hz) + dynamic nylon damping
	const airRes = ctx.createBiquadFilter();
	airRes.type = "peaking";
	airRes.frequency.value = 96;
	airRes.Q.value = 2.6;
	airRes.gain.value = 4.8;

	const topRes = ctx.createBiquadFilter();
	topRes.type = "peaking";
	topRes.frequency.value = 194;
	topRes.Q.value = 2.4;
	topRes.gain.value = 3.5;

	const harshScoop = ctx.createBiquadFilter();
	harshScoop.type = "peaking";
	harshScoop.frequency.value = 2500;
	harshScoop.Q.value = 1.2;
	harshScoop.gain.value = -2.8;

	const bodyLPF = ctx.createBiquadFilter();
	bodyLPF.type = "lowpass";
	bodyLPF.Q.value = 0.65;
	bodyLPF.frequency.setValueAtTime(
		Math.min(3100, Math.max(1750, freq * 7.5)),
		startTime,
	);
	bodyLPF.frequency.exponentialRampToValueAtTime(
		Math.min(2200, Math.max(1250, freq * 4.5)),
		startTime + Math.min(0.28, duration * 0.5),
	);

	const noteGain = ctx.createGain();
	const ksGain = peakGain * 1.48;
	noteGain.gain.setValueAtTime(ksGain, startTime);
	noteGain.gain.setValueAtTime(ksGain * 0.9, startTime + duration);
	noteGain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

	src.connect(airRes);
	airRes.connect(topRes);
	topRes.connect(harshScoop);
	harshScoop.connect(bodyLPF);
	bodyLPF.connect(noteGain);
	noteGain.connect(master);

	src.start(startTime);
	src.stop(stopTime + 0.03);
}

function scheduleCelloVoice(
	engine: AudioEngine,
	midi: number,
	startTime: number,
	duration: number,
	peakGain: number,
) {
	const { ctx, master, noiseBuffer } = engine;
	const freq = midiToFrequency(midi);
	const isShortArticulation = duration <= 0.42;

	// Helmholtz bowed string: full harmonic sawtooth + fundamental-reinforcing triangle
	const oscSaw = ctx.createOscillator();
	const oscTri = ctx.createOscillator();
	const sawGain = ctx.createGain();
	const triGain = ctx.createGain();

	oscSaw.type = "sawtooth";
	oscSaw.frequency.setValueAtTime(freq, startTime);
	sawGain.gain.setValueAtTime(0.7, startTime);

	oscTri.type = "triangle";
	oscTri.frequency.setValueAtTime(freq, startTime);
	triGain.gain.setValueAtTime(0.36, startTime);

	// Delayed finger vibrato (steady pitch on bow grip, singing vibrato blooms during sustain)
	const vibratoLfo = ctx.createOscillator();
	vibratoLfo.type = "sine";
	vibratoLfo.frequency.setValueAtTime(5.2, startTime);
	const vibratoDepth = ctx.createGain();
	const maxCents = isShortArticulation ? 3.5 : 11.5;
	vibratoDepth.gain.setValueAtTime(0, startTime);
	vibratoDepth.gain.setValueAtTime(0, startTime + Math.min(0.13, duration * 0.35));
	vibratoDepth.gain.linearRampToValueAtTime(
		maxCents,
		startTime + Math.min(0.42, Math.max(0.2, duration * 0.72)),
	);
	vibratoLfo.connect(vibratoDepth);
	vibratoDepth.connect(oscSaw.detune);
	vibratoDepth.connect(oscTri.detune);

	// Rosin bow-bite transient (soft bandpass scrape at bow engagement)
	const bowNoise = ctx.createBufferSource();
	bowNoise.buffer = noiseBuffer;
	const bowBandpass = ctx.createBiquadFilter();
	bowBandpass.type = "bandpass";
	bowBandpass.frequency.setValueAtTime(
		Math.min(1300, Math.max(520, freq * 5)),
		startTime,
	);
	bowBandpass.Q.value = 2.2;
	const bowNoiseGain = ctx.createGain();
	const noiseDur = isShortArticulation ? 0.04 : 0.075;
	bowNoiseGain.gain.setValueAtTime(0.0001, startTime);
	bowNoiseGain.gain.linearRampToValueAtTime(
		peakGain * 0.055,
		startTime + noiseDur * 0.35,
	);
	bowNoiseGain.gain.exponentialRampToValueAtTime(0.0001, startTime + noiseDur);

	// Bow-pressure dynamic low-pass filter
	const bowLPF = ctx.createBiquadFilter();
	bowLPF.type = "lowpass";
	bowLPF.Q.value = 0.75;
	const startCutoff = Math.max(360, freq * 2.4);
	const swellCutoff = Math.min(2500, Math.max(720, freq * 7.2));
	const settleCutoff = Math.min(1850, Math.max(520, freq * 4.5));
	const attack = isShortArticulation
		? Math.max(0.025, duration * 0.14)
		: 0.078;
	bowLPF.frequency.setValueAtTime(startCutoff, startTime);
	bowLPF.frequency.exponentialRampToValueAtTime(swellCutoff, startTime + attack + 0.04);
	bowLPF.frequency.exponentialRampToValueAtTime(
		settleCutoff,
		startTime + Math.max(attack + 0.12, duration),
	);

	// Cello spruce/maple acoustic body formants:
	// A0 f-hole air resonance (~78 Hz), B1 wood chest (~195 Hz), box scoop (490 Hz), singing bridge (~1150 Hz)
	const airChamber = ctx.createBiquadFilter();
	airChamber.type = "peaking";
	airChamber.frequency.value = 78;
	airChamber.Q.value = 1.8;
	airChamber.gain.value = 4.0;

	const chestBody = ctx.createBiquadFilter();
	chestBody.type = "peaking";
	chestBody.frequency.value = 195;
	chestBody.Q.value = 2.1;
	chestBody.gain.value = 4.2;

	const midScoop = ctx.createBiquadFilter();
	midScoop.type = "peaking";
	midScoop.frequency.value = 490;
	midScoop.Q.value = 1.4;
	midScoop.gain.value = -3.2;

	const bridgeHill = ctx.createBiquadFilter();
	bridgeHill.type = "peaking";
	bridgeHill.frequency.value = 1150;
	bridgeHill.Q.value = 1.5;
	bridgeHill.gain.value = 3.0;

	const release = isShortArticulation ? 0.26 : 0.44;
	const stopTime = startTime + duration + release;
	const noteGain = ctx.createGain();
	noteGain.gain.setValueAtTime(0.0001, startTime);
	noteGain.gain.linearRampToValueAtTime(peakGain * 0.88, startTime + attack);
	noteGain.gain.linearRampToValueAtTime(
		peakGain * 0.94,
		startTime + Math.max(attack + 0.04, duration * 0.82),
	);
	noteGain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

	oscSaw.connect(sawGain);
	oscTri.connect(triGain);
	sawGain.connect(bowLPF);
	triGain.connect(bowLPF);
	bowNoise.connect(bowBandpass);
	bowBandpass.connect(bowNoiseGain);
	bowNoiseGain.connect(bowLPF);

	bowLPF.connect(airChamber);
	airChamber.connect(chestBody);
	chestBody.connect(midScoop);
	midScoop.connect(bridgeHill);
	bridgeHill.connect(noteGain);
	noteGain.connect(master);

	const noiseOffset = ((midi * 23) % 100) * 0.002;
	oscSaw.start(startTime);
	oscTri.start(startTime);
	vibratoLfo.start(startTime);
	bowNoise.start(startTime, noiseOffset, noiseDur + 0.01);

	oscSaw.stop(stopTime + 0.04);
	oscTri.stop(stopTime + 0.04);
	vibratoLfo.stop(stopTime + 0.04);
	bowNoise.stop(startTime + noiseDur + 0.02);
}

function schedulePadVoice(
	engine: AudioEngine,
	midi: number,
	startTime: number,
	duration: number,
	peakGain: number,
) {
	const { ctx, master } = engine;
	const freq = midiToFrequency(midi);
	const osc1 = ctx.createOscillator();
	const osc2 = ctx.createOscillator();
	const filter = ctx.createBiquadFilter();
	const noteGain = ctx.createGain();

	osc1.type = "triangle";
	osc1.frequency.setValueAtTime(freq, startTime);
	osc1.detune.setValueAtTime(-6, startTime);

	osc2.type = "sine";
	osc2.frequency.setValueAtTime(freq, startTime);
	osc2.detune.setValueAtTime(6, startTime);

	filter.type = "lowpass";
	filter.frequency.setValueAtTime(Math.min(1800, Math.max(520, freq * 3.5)), startTime);
	filter.Q.value = 0.5;

	const attack = 0.08;
	const release = 0.85;
	const stopTime = startTime + duration + release;
	noteGain.gain.setValueAtTime(0.0001, startTime);
	noteGain.gain.linearRampToValueAtTime(peakGain * 0.8, startTime + attack);
	noteGain.gain.setValueAtTime(peakGain * 0.72, startTime + duration);
	noteGain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

	osc1.connect(filter);
	osc2.connect(filter);
	filter.connect(noteGain);
	noteGain.connect(master);

	osc1.start(startTime);
	osc2.start(startTime);
	osc1.stop(stopTime + 0.05);
	osc2.stop(stopTime + 0.05);
}

function scheduleVoice(
	engine: AudioEngine,
	midi: number,
	startTime: number,
	duration: number,
	peakGain: number,
	preset: InstrumentVoice,
) {
	switch (preset) {
		case "piano":
			schedulePianoVoice(engine, midi, startTime, duration, peakGain);
			break;
		case "guitar":
			scheduleGuitarVoice(engine, midi, startTime, duration, peakGain);
			break;
		case "cello":
			scheduleCelloVoice(engine, midi, startTime, duration, peakGain);
			break;
		case "pad":
			schedulePadVoice(engine, midi, startTime, duration, peakGain);
			break;
	}
}

export function playSingleNote(
	midi: number,
	preset: SoundPreset = "piano",
	duration = 0.55,
): void {
	if (preset === "muted") return;
	const engine = getAudioEngine();
	if (!engine) return;
	const now = engine.ctx.currentTime + 0.01;
	scheduleVoice(engine, midi, now, duration, 0.24, preset);
}

export function playChordNotes(
	midiNotes: number[],
	options: {
		preset?: SoundPreset;
		duration?: number;
		arpeggiate?: boolean;
		spreadSec?: number;
	} = {},
): void {
	const {
		preset = "piano",
		duration = 0.95,
		arpeggiate = false,
		spreadSec,
	} = options;
	if (preset === "muted" || midiNotes.length === 0) return;
	const engine = getAudioEngine();
	if (!engine) return;

	const now = engine.ctx.currentTime + 0.015;
	const perNoteGain = Math.min(0.22, 0.54 / Math.max(1, midiNotes.length));
	const defaultSpread =
		preset === "cello"
			? arpeggiate
				? 0.08
				: 0.058
			: preset === "guitar"
				? arpeggiate
					? 0.08
					: 0.038
				: arpeggiate
					? 0.075
					: 0.01;
	const spread = spreadSec ?? defaultSpread;

	midiNotes.forEach((midi, idx) => {
		scheduleVoice(
			engine,
			midi,
			now + idx * spread,
			duration,
			perNoteGain,
			preset,
		);
	});
}

export interface TimedSequenceStep {
	midi: number[];
	atMs: number;
	durationSec: number;
	spreadSec?: number;
}

function triggerSequenceAudio(
	midi: number[],
	preset: SoundPreset,
	durationSec: number,
	arpeggiate: boolean,
	spreadSec?: number,
) {
	if (midi.length === 1) {
		playSingleNote(midi[0], preset, durationSec);
	} else {
		playChordNotes(midi, {
			preset,
			duration: durationSec,
			arpeggiate,
			spreadSec,
		});
	}
}

export function playStepSequence(
	steps: { midi: number[]; durationSec?: number }[],
	options: {
		preset?: SoundPreset;
		stepMs: number;
		arpeggiate?: boolean;
		spreadSec?: number;
		onStep?: (index: number) => void;
		onDone?: () => void;
	},
): () => void {
	const {
		preset = "piano",
		stepMs,
		arpeggiate = false,
		spreadSec,
		onStep,
		onDone,
	} = options;
	const timedSteps: TimedSequenceStep[] = steps.map((step, idx) => ({
		midi: step.midi,
		atMs: idx * stepMs,
		durationSec:
			step.durationSec ??
			(step.midi.length === 1
				? Math.max(0.28, (stepMs / 1000) * 0.9)
				: Math.max(0.45, (stepMs / 1000) * 0.88)),
		spreadSec,
	}));
	return playTimedSequence(timedSteps, {
		preset,
		arpeggiate,
		totalDurationMs: steps.length * stepMs,
		onStep,
		onDone,
	});
}

export function playTimedSequence(
	steps: TimedSequenceStep[],
	options: {
		preset?: SoundPreset;
		arpeggiate?: boolean;
		totalDurationMs?: number;
		onStep?: (index: number) => void;
		onDone?: () => void;
	},
): () => void {
	const {
		preset = "piano",
		arpeggiate = false,
		totalDurationMs,
		onStep,
		onDone,
	} = options;
	if (typeof window === "undefined") {
		return () => {};
	}
	let cancelled = false;
	const timers: number[] = [];

	steps.forEach((step, idx) => {
		const timerId = window.setTimeout(() => {
			if (cancelled) return;
			onStep?.(idx);
			triggerSequenceAudio(
				step.midi,
				preset,
				step.durationSec,
				arpeggiate,
				step.spreadSec,
			);
		}, step.atMs);
		timers.push(timerId);
	});

	const endDelayMs =
		totalDurationMs ??
		steps.reduce(
			(maxMs, s) => Math.max(maxMs, s.atMs + s.durationSec * 1000),
			0,
		);
	const endTimer = window.setTimeout(() => {
		if (!cancelled) {
			onDone?.();
		}
	}, endDelayMs);
	timers.push(endTimer);

	return () => {
		cancelled = true;
		for (const id of timers) {
			window.clearTimeout(id);
		}
	};
}
